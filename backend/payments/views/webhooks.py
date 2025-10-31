"""
Webhook views for payment providers.

Handles webhook callbacks from external payment providers like Stripe.
These endpoints process asynchronous payment events and update local state.
"""

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.http import HttpResponse
from django.conf import settings
import stripe
import json
import logging
from decimal import Decimal

# Import money precision helpers for currency-aware conversions
from payments.money import from_minor

from .base import BasePaymentView, PAYMENT_MESSAGES
from ..models import Payment, PaymentTransaction

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(BasePaymentView):
    """
    Stripe webhook view to handle asynchronous events.

    Processes webhook events from Stripe for payment status updates,
    refunds, failures, and other payment-related events.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
        endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

        try:
            event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        except ValueError as e:
            # Invalid payload
            logger.error(f"Stripe webhook: Invalid payload - {e}")
            return HttpResponse(status=400)
        except stripe.error.SignatureVerificationError as e:
            # Invalid signature
            logger.error(f"Stripe webhook: Invalid signature - {e}")
            return HttpResponse(status=400)

        # Manually resolve tenant from the event data
        # This is necessary because webhooks bypass tenant middleware
        tenant = self._resolve_tenant_from_event(event)
        if not tenant:
            logger.error(
                f"Stripe webhook: Could not resolve tenant from event type {event['type']}"
            )
            return HttpResponse(status=400)

        # Set tenant context for this request
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant)
        request.tenant = tenant

        try:
            # Handle the event
            if event["type"] == "payment_intent.succeeded":
                payment_intent = event["data"]["object"]
                self._handle_payment_intent_succeeded(payment_intent)
            elif event["type"] == "payment_intent.payment_failed":
                payment_intent = event["data"]["object"]
                self._handle_payment_intent_payment_failed(payment_intent)
            elif event["type"] == "payment_intent.canceled":
                payment_intent = event["data"]["object"]
                self._handle_payment_intent_canceled(payment_intent)
            elif event["type"] == "refund.updated":
                refund = event["data"]["object"]
                self._handle_refund_updated(refund)
            else:
                # For any other event types, we can log them for now
                self._handle_unimplemented_event(event["data"]["object"])

            return HttpResponse(status=200)
        finally:
            # Always clean up tenant context
            set_current_tenant(None)

    def _resolve_tenant_from_event(self, event):
        """
        Resolve tenant from Stripe webhook event data.

        Extracts order_id from PaymentIntent metadata and looks up the
        Order's tenant. This is necessary because webhooks bypass tenant middleware.

        Args:
            event: Stripe webhook event object

        Returns:
            Tenant instance if found, None otherwise
        """
        event_data = event.get("data", {}).get("object", {})

        # For payment_intent events, metadata is directly on the object
        if event["type"].startswith("payment_intent"):
            order_id = event_data.get("metadata", {}).get("order_id")
        # For refund events, we need to get the payment_intent first
        elif event["type"].startswith("refund"):
            payment_intent_id = event_data.get("payment_intent")
            if payment_intent_id:
                # Look up the transaction to get the order
                try:
                    from orders.models import Order

                    txn = PaymentTransaction.all_objects.select_related(
                        "payment__order__tenant"
                    ).get(transaction_id=payment_intent_id)
                    return txn.payment.order.tenant
                except PaymentTransaction.DoesNotExist:
                    logger.error(
                        f"Could not find transaction for PI {payment_intent_id}"
                    )
                    return None
        else:
            logger.warning(
                f"Unhandled event type for tenant resolution: {event['type']}"
            )
            return None

        if not order_id:
            logger.error(f"No order_id in event metadata for {event['type']}")
            return None

        try:
            from orders.models import Order

            # Use all_objects to bypass tenant filtering
            order = Order.all_objects.select_related("tenant").get(id=order_id)
            logger.info(f"Resolved tenant {order.tenant.slug} from order {order_id}")
            return order.tenant
        except Order.DoesNotExist:
            logger.error(f"Order {order_id} not found for tenant resolution")
            return None
        except Exception as e:
            logger.error(f"Error resolving tenant from order {order_id}: {e}")
            return None

    def _handle_payment_intent_succeeded(self, payment_intent):
        """
        Handles the 'payment_intent.succeeded' event, correctly extracting card
        details from either 'card' or 'card_present' type payments.
        Now uses formal state transition methods.
        """
        transaction = self._get_or_create_transaction(payment_intent)
        if not transaction:
            return

        if (
            transaction.status == PaymentTransaction.TransactionStatus.SUCCESSFUL
            and transaction.card_brand
        ):
            logger.info(
                f"Transaction {transaction.id} is already fully processed with card details."
            )
            return

        card_brand = None
        card_last4 = None
        charge_id = payment_intent.get("latest_charge")
        if charge_id:
            try:
                charge = stripe.Charge.retrieve(charge_id)
                details = charge.payment_method_details

                # Check the payment type and get details from the correct object
                card_details_source = None
                if details:
                    if details.type == "card":
                        card_details_source = details.card
                    elif details.type == "card_present":
                        card_details_source = details.card_present

                if card_details_source:
                    card_brand = card_details_source.brand
                    card_last4 = card_details_source.last4

            except stripe.error.StripeError as e:
                logger.error(
                    f"Could not retrieve charge {charge_id} to get card details: {e}"
                )

        from django.db import transaction as db_transaction
        from ..services import PaymentService

        with db_transaction.atomic():
            # Update card details if available
            if card_brand and not transaction.card_brand:
                transaction.card_brand = card_brand
            if card_last4 and not transaction.card_last4:
                transaction.card_last4 = card_last4
            transaction.provider_response = payment_intent
            transaction.save(
                update_fields=["card_brand", "card_last4", "provider_response"]
            )

            # Use formal state transition method if transaction needs to be marked successful
            if transaction.status != PaymentTransaction.TransactionStatus.SUCCESSFUL:
                PaymentService.confirm_successful_transaction(transaction)

        logger.info(
            f"Webhook processed 'payment_intent.succeeded' for Txn {transaction.id}"
        )

    def _handle_payment_intent_payment_failed(self, payment_intent):
        """Handles 'payment_intent.payment_failed' events."""
        self._handle_failure(payment_intent, event_type="payment_failed")

    def _handle_payment_intent_canceled(self, payment_intent):
        """Handles 'payment_intent.canceled' events."""
        self._handle_failure(payment_intent, event_type="canceled")

    def _handle_charge_refunded(self, charge_object):
        """
        Handles 'charge.refunded' events.

        This event is triggered when a charge is refunded (fully or partially).
        We extract the refund information and process it similarly to refund.updated.
        """
        charge_id = charge_object.get("id")
        payment_intent_id = charge_object.get("payment_intent")

        if not payment_intent_id:
            logger.warning(
                f"Webhook 'charge.refunded' received for charge {charge_id} without Payment Intent ID."
            )
            return

        # Process each refund in the charge
        refunds = charge_object.get("refunds", {}).get("data", [])
        if not refunds:
            logger.info(
                f"No refund data found in charge.refunded event for charge {charge_id}"
            )
            return

        # Process the most recent refund (usually there's only one new refund per event)
        for refund in refunds:
            if refund.get("status") == "succeeded":
                self._handle_refund_updated(refund)

    def _handle_refund_updated(self, refund_object):
        """
        Handles the 'refund.updated' event using the Payment Intent ID for a reliable lookup.

        Updated to work with the new refund system:
        - Validates against total transaction amount (amount + tip + surcharge)
        - Creates RefundAuditLog for webhook events
        - Links to existing RefundItem records if available
        """
        if refund_object.get("status") != "succeeded":
            logger.info(
                f"Ignoring refund {refund_object.get('id')} with status: {refund_object.get('status')}"
            )
            return

        # --- THE CORE FIX: USE THE PAYMENT INTENT ID FOR LOOKUP ---
        payment_intent_id = refund_object.get("payment_intent")
        if not payment_intent_id:
            logger.warning(
                "Webhook 'refund.updated' received without a Payment Intent ID."
            )
            return

        try:
            from django.db import transaction as db_transaction
            from ..services import PaymentService
            from refunds.models import RefundAuditLog

            with db_transaction.atomic():
                # Find the transaction using the ID we know is stored in our database.
                txn_to_refund = PaymentTransaction.objects.select_for_update().get(
                    transaction_id=payment_intent_id
                )

                # Idempotency Check: Prevents processing the same refund event twice.
                response_data = txn_to_refund.provider_response or {}
                existing_refund_ids = {
                    r.get("id") for r in response_data.get("refunds", [])
                }
                if refund_object["id"] in existing_refund_ids:
                    logger.info(
                        f"Refund event {refund_object['id']} already processed for Txn {txn_to_refund.id}. Skipping."
                    )
                    return

                # Apply the refund logic
                # Use money.from_minor for currency-aware conversion (supports USD, JPY, KWD, etc.)
                currency = refund_object.get("currency", "usd").upper()
                refunded_amount_minor = refund_object.get("amount", 0)
                refunded_amount_in_event = from_minor(currency, refunded_amount_minor)
                txn_to_refund.refunded_amount += refunded_amount_in_event

                # CRITICAL FIX: Check against total transaction amount (amount + tip + surcharge)
                total_transaction_amount = (
                    txn_to_refund.amount + txn_to_refund.tip + txn_to_refund.surcharge
                )

                if txn_to_refund.refunded_amount >= total_transaction_amount:
                    txn_to_refund.status = PaymentTransaction.TransactionStatus.REFUNDED

                # Store the raw refund object for auditing
                refunds_list = response_data.get("refunds", [])
                refunds_list.append(refund_object)
                response_data["refunds"] = refunds_list
                txn_to_refund.provider_response = response_data

                txn_to_refund.save()

                # Create RefundAuditLog for webhook event
                RefundAuditLog.objects.create(
                    tenant=txn_to_refund.payment.tenant,
                    payment=txn_to_refund.payment,
                    payment_transaction=txn_to_refund,
                    action="webhook_refund_updated",
                    source="WEBHOOK",
                    refund_amount=refunded_amount_in_event,
                    reason=refund_object.get("reason", ""),
                    initiated_by=None,  # Webhook, no user
                    device_info={"webhook_event_id": refund_object.get("id")},
                    provider_response=refund_object,
                    status="success",
                )

                # Update the parent Payment object
                PaymentService._update_payment_status(txn_to_refund.payment)

            logger.info(
                f"Successfully processed webhook 'refund.updated' for Txn {txn_to_refund.id}. "
                f"Refunded: ${refunded_amount_in_event}, Total refunded: ${txn_to_refund.refunded_amount} / ${total_transaction_amount}"
            )

        except PaymentTransaction.DoesNotExist:
            logger.error(
                f"Webhook Error: Received refund for PI {payment_intent_id} but could not find matching transaction."
            )
        except Exception as e:
            logger.error(
                f"An unexpected error occurred in _handle_refund_updated: {e}",
                exc_info=True,
            )

    def _handle_unimplemented_event(self, event_data):
        """
        Generic handler for events we don't explicitly handle yet.

        Args:
            event_data: Stripe event data object
        """
        logger.info(f"Unhandled Stripe event type: {event_data.get('type', 'unknown')}")

    def _get_or_create_transaction(self, payment_intent):
        """
        Robustly retrieves or creates a PaymentTransaction from a PaymentIntent object.
        This is crucial for webhooks that may arrive before the initial transaction
        is created via an API call.
        """
        pi_id = payment_intent.id
        # First, try to find an existing transaction
        txn = (
            PaymentTransaction.objects.select_related("payment", "payment__order")
            .filter(transaction_id=pi_id)
            .first()
        )
        if txn:
            return txn

        # If no transaction, create one from the PaymentIntent metadata
        order_id = payment_intent.metadata.get("order_id")
        if not order_id:
            logger.error(
                f"Webhook Error: PaymentIntent {pi_id} has no 'order_id' in metadata."
            )
            return None

        try:
            from orders.models import Order
            from ..services import PaymentService

            order = Order.objects.get(id=order_id)
            amount_decimal = Decimal(payment_intent.amount) / 100

            payment = PaymentService.get_or_create_payment(order)

            # Use the charge_id if available, else PI ID.
            effective_transaction_id = payment_intent.latest_charge or pi_id

            txn, created = PaymentTransaction.objects.get_or_create(
                payment=payment,
                transaction_id=effective_transaction_id,
                defaults={
                    "amount": amount_decimal,
                    "method": PaymentTransaction.PaymentMethod.CARD_ONLINE,
                    "status": PaymentTransaction.TransactionStatus.PENDING,
                    "provider_response": payment_intent,
                    "tenant": payment.tenant,
                },
            )
            if created:
                logger.info(
                    f"Webhook: Created new PaymentTransaction {txn.id} for PI {pi_id}"
                )
            return txn
        except Order.DoesNotExist:
            logger.error(
                f"Webhook Error: Order {order_id} from PI {pi_id} metadata not found."
            )
        except Exception as e:
            logger.error(
                f"Webhook Error: Could not create transaction for PI {pi_id}: {e}"
            )

        return None

    def _handle_failure(self, payment_intent, event_type="failed"):
        """
        Generic handler for failure events.
        Now uses formal state transition methods.
        """
        transaction = self._get_or_create_transaction(payment_intent)
        if not transaction:
            return

        target_status = (
            PaymentTransaction.TransactionStatus.CANCELED
            if event_type == "canceled"
            else PaymentTransaction.TransactionStatus.FAILED
        )

        if transaction.status == target_status:
            logger.info(
                f"Transaction {transaction.id} already in desired state: {target_status}."
            )
            return

        from django.db import transaction as db_transaction
        from ..services import PaymentService

        with db_transaction.atomic():
            # Update provider response first
            transaction.provider_response = payment_intent
            transaction.save(update_fields=["provider_response"])

            # Use formal state transition method
            if event_type == "canceled":
                # For canceled payments, we can use cancel_payment_process on the parent payment
                PaymentService.cancel_payment_process(transaction.payment)
            else:
                # For failed payments, use record_failed_transaction
                PaymentService.record_failed_transaction(transaction)


class CloverWebhookView(BasePaymentView):
    """
    Placeholder for Clover webhook handling.

    Future implementation for Clover payment provider webhooks.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """
        Handles incoming Clover webhook events.
        """
        return HttpResponse("Clover webhook processing - Not implemented", status=501)


class SquareWebhookView(BasePaymentView):
    """
    Placeholder for Square webhook handling.

    Future implementation for Square payment provider webhooks.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """
        Handles incoming Square webhook events.
        """
        return HttpResponse("Square webhook processing - Not implemented", status=501)


# Export all webhook views
__all__ = [
    "StripeWebhookView",
    "CloverWebhookView",
    "SquareWebhookView",
]
