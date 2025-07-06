from abc import ABC, abstractmethod
from decimal import Decimal
import uuid  # For simulated transaction ID

import stripe
from django.conf import settings
from django.db import transaction

from .models import Payment, PaymentTransaction
from orders.models import Order
from settings.models import TerminalLocation, StoreLocation
import logging

logger = logging.getLogger(__name__)


class PaymentStrategy(ABC):
    """
    The Abstract Base Class for a payment strategy.
    Defines the common interface for all payment methods.
    """

    @abstractmethod
    def process(self, transaction: PaymentTransaction):
        """
        Process the payment transaction.
        This method must be implemented by all concrete strategies.
        It should update the transaction's status and other details.
        """
        pass

    @abstractmethod
    def refund_transaction(
        self, transaction: PaymentTransaction, amount: Decimal, reason: str = None
    ):
        """
        Refunds a specific payment transaction via the provider.
        Updates the transaction's status and provider_response.
        """
        pass


class CashPaymentStrategy(PaymentStrategy):
    """
    A simple strategy for handling cash payments.
    """

    def process(self, transaction: PaymentTransaction, **kwargs):
        # For cash, we assume the payment is successful if it's recorded.
        # No external API calls are needed.
        transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
        transaction.save()
        # In a real system, you might trigger a cash drawer opening here.
        return transaction

    def refund_transaction(
        self, transaction: PaymentTransaction, amount: Decimal, reason: str = None
    ):
        """
        For cash payments, an "external" refund means a manual cash payout.
        We update the transaction status and refunded amount.
        """
        transaction.refunded_amount += amount
        transaction.refund_reason = reason
        # If the refunded amount equals the original transaction amount, mark as fully refunded
        if transaction.refunded_amount >= transaction.amount:
            transaction.status = PaymentTransaction.TransactionStatus.REFUNDED
        else:
            # For partial refunds, we might need a new status or more complex logic
            # For now, if partial, it's still "successful" but with a refunded amount.
            # Or you might want to create a new "Refund" transaction for clarity.
            pass
        transaction.save()
        return transaction


class TerminalPaymentStrategy(PaymentStrategy):
    """
    Base strategy for processing payments via a physical card terminal.
    """

    @abstractmethod
    def get_frontend_configuration(self):
        """
        Returns the necessary configuration for the frontend to interact
        with this terminal provider.
        """
        pass

    def create_connection_token(self):
        """Default implementation for strategies that don't need a connection token."""
        raise NotImplementedError(
            "This payment provider does not use connection tokens."
        )

    def create_payment_intent(
        self, payment: Payment, amount: Decimal, surcharge: Decimal
    ):
        """Default implementation for creating a payment intent."""
        raise NotImplementedError(
            "This payment provider does not support creating payment intents directly."
        )

    def capture_payment(self, transaction: PaymentTransaction):
        """Default implementation for capturing a payment."""
        raise NotImplementedError(
            "This payment provider does not support capturing payments."
        )

    def cancel_action(self, **kwargs):
        """Default implementation for cancelling an action."""
        raise NotImplementedError(
            "This payment provider does not support cancelling actions."
        )


class StripeTerminalStrategy(TerminalPaymentStrategy):
    """
    Strategy for processing payments via a Stripe card terminal.
    """

    @staticmethod
    def sync_locations_from_stripe():
        """
        Fetches all physical locations from Stripe and updates the local database.
        This is a Stripe-specific utility method.
        """
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            stripe_locations = stripe.terminal.Location.list(limit=100)
            created_count = 0
            updated_count = 0

            with transaction.atomic():
                for loc in stripe_locations.data:
                    # We only care about creating the link here. The StoreLocation must exist first.
                    # This method does not create StoreLocation objects.
                    # We find the first available store location that doesn't have a stripe config yet
                    # This is a naive assumption but works for simple setups.
                    store_location_to_link = StoreLocation.objects.filter(
                        terminallocation__isnull=True
                    ).first()

                    if store_location_to_link:
                        location, created = TerminalLocation.objects.update_or_create(
                            stripe_id=loc.id,
                            defaults={"store_location": store_location_to_link},
                        )
                        if created:
                            created_count += 1
                        else:
                            updated_count += 1

            return {
                "status": "success",
                "created": created_count,
                "updated": updated_count,
            }
        except Exception as e:
            logger.error(f"Error syncing Stripe locations: {e}")
            return {"status": "error", "message": str(e)}

    def get_frontend_configuration(self):
        return {
            "provider": "STRIPE_TERMINAL",
            "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
            "needs_connection_token": True,
        }

    def create_connection_token(self, location_id=None):
        """Create a connection token for Stripe Terminal, optionally scoped to a location."""
        stripe.api_key = settings.STRIPE_SECRET_KEY
        params = {}
        # If a location_id is provided, add it to the request parameters.
        if location_id:
            params["location"] = location_id

        return stripe.terminal.ConnectionToken.create(**params).secret

    def create_payment_intent(
        self, payment: Payment, amount: Decimal, surcharge: Decimal
    ):
        """Create a payment intent for a card-present transaction."""
        stripe.api_key = settings.STRIPE_SECRET_KEY

        # Create the transaction record for this attempt
        transaction = PaymentTransaction.objects.create(
            payment=payment,
            amount=amount,
            surcharge=surcharge,
            method=PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            status=PaymentTransaction.TransactionStatus.PENDING,
        )

        amount_cents = int((amount + surcharge) * 100)
        metadata = {
            "source": "terminal",
            "transaction_id": str(transaction.id),
            "order_id": str(payment.order.id),
        }
        description = f"Payment for Order #{payment.order.id}"

        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            payment_method_types=["card_present"],
            capture_method="manual",
            metadata=metadata,
            description=description,
        )

        transaction.transaction_id = intent.id
        transaction.save(update_fields=["transaction_id"])

        return intent

    def capture_payment(self, transaction: PaymentTransaction):
        """Capture a payment intent that has already been processed by a reader."""
        stripe.api_key = settings.STRIPE_SECRET_KEY
        if not transaction.transaction_id or not transaction.transaction_id.startswith(
            "pi_"
        ):
            raise ValueError("Transaction does not have a valid Payment Intent ID.")

        intent = stripe.PaymentIntent.capture(transaction.transaction_id)
        return intent

    def cancel_action(self, **kwargs):
        """Cancel an ongoing action on a terminal reader."""
        stripe.api_key = settings.STRIPE_SECRET_KEY
        reader_id = kwargs.get("reader_id")
        if not reader_id:
            raise ValueError("reader_id is required to cancel a terminal action.")
        return stripe.terminal.Reader.cancel_action(reader_id)

    def list_readers(self, location_id=None):
        """
        Lists Stripe Terminal readers, optionally filtered by location.
        """
        stripe.api_key = settings.STRIPE_SECRET_KEY
        params = {"limit": 100}
        if location_id:
            params["location"] = location_id

        try:
            readers = stripe.terminal.Reader.list(**params)
            return readers.to_dict().get("data", [])
        except Exception as e:
            logger.error(f"Failed to list Stripe readers: {e}")
            raise  # Re-raise the exception to be handled by the view

    # --- NEW METHOD ---
    def cancel_payment_intent(self, payment_intent_id: str):
        """
        Cancels a payment intent with Stripe.
        Safely ignores errors for intents that are already canceled or processed.
        """
        stripe.api_key = settings.STRIPE_SECRET_KEY
        if not payment_intent_id:
            return False

        try:
            stripe.PaymentIntent.cancel(payment_intent_id)
            logger.info(f"Successfully cancelled Stripe PI: {payment_intent_id}")
            return True
        except stripe.error.InvalidRequestError as e:
            # This error often means the intent is already canceled or in a final state.
            # We can safely ignore it in a "force-cancel" scenario.
            logger.warning(
                f"Could not cancel Stripe PI {payment_intent_id} (likely already finalized): {e}"
            )
            return True
        except Exception as e:
            # Re-raise other, more serious errors.
            logger.error(
                f"Unexpected error cancelling Stripe PI {payment_intent_id}: {e}"
            )
            raise e

    def process(self, transaction: PaymentTransaction):
        transaction.status = PaymentTransaction.TransactionStatus.PENDING
        transaction.transaction_id = f"sim_stripe_pi_{uuid.uuid4().hex}"
        transaction.provider_response = {
            "provider": "stripe",
            "status": "requires_payment_method",
            "message": "Simulated payment intent created. Ready for reader.",
        }
        transaction.save()
        return transaction

    def refund_transaction(
        self, transaction: PaymentTransaction, amount: Decimal, reason: str = None
    ) -> stripe.Refund:
        """
        Creates a refund object via the Stripe API. It now reliably finds the
        Charge ID from the Payment Intent ID stored in transaction_id.
        """
        if not transaction.transaction_id or not transaction.transaction_id.startswith(
            "pi_"
        ):
            raise ValueError(
                "A valid Payment Intent ID is required to process a refund."
            )

        payment_intent_id = transaction.transaction_id
        charge_id_to_refund = None

        # Optimization: Try to get the Charge ID from the stored provider response first.
        if transaction.provider_response and isinstance(
            transaction.provider_response, dict
        ):
            charge_id_to_refund = transaction.provider_response.get("latest_charge")

        try:
            # If the charge ID wasn't in the stored response, fetch the Payment Intent from Stripe.
            if not charge_id_to_refund:
                payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
                charge_id_to_refund = payment_intent.latest_charge

            if not charge_id_to_refund:
                raise ValueError(
                    f"Payment Intent {payment_intent_id} has no successful charge to refund."
                )

            # Create the refund using the correct Charge ID.
            return stripe.Refund.create(
                charge=charge_id_to_refund,
                amount=int(amount * 100),
                reason=reason,
            )
        except stripe.error.StripeError as e:
            logger.error(
                f"Stripe API error during refund for transaction {transaction.id}: {e}"
            )
            raise ValueError(str(e))


class CloverTerminalStrategy(TerminalPaymentStrategy):
    """
    Strategy for processing payments via a Clover card terminal.
    """

    def get_frontend_configuration(self):
        return {
            "provider": "CLOVER_TERMINAL",
            "api_key": "mock_clover_api_key",
            "needs_connection_token": False,
        }

    def process(self, transaction: PaymentTransaction):
        transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
        transaction.transaction_id = f"sim_clover_{uuid.uuid4().hex}"
        transaction.provider_response = {
            "provider": "clover",
            "status": "succeeded",
            "message": "Simulated payment successful.",
        }
        transaction.save()
        return transaction

    def refund_transaction(
        self, transaction: PaymentTransaction, amount: Decimal, reason: str = None
    ):
        """
        Simulated refund for Clover Terminal payments.
        """
        transaction.refunded_amount += amount
        transaction.refund_reason = reason
        if transaction.refunded_amount >= transaction.amount:
            transaction.status = PaymentTransaction.TransactionStatus.REFUNDED
        else:
            pass  # Keep original status or add PARTIALLY_REFUNDED status
        transaction.provider_response["refunds"] = transaction.provider_response.get(
            "refunds", []
        ) + [{"amount": str(amount), "reason": reason, "status": "succeeded"}]
        transaction.save()
        return transaction


class StripeOnlineStrategy(PaymentStrategy):
    """
    Strategy for card-not-present (online) payments using Stripe.
    Handles the creation and confirmation of a Payment Intent.
    """

    def process(self, transaction: PaymentTransaction, **kwargs):
        stripe.api_key = settings.STRIPE_SECRET_KEY
        payment_method_id = kwargs.get("payment_method_id")
        payment_intent_id = kwargs.get("payment_intent_id")

        if not payment_method_id and not payment_intent_id:
            raise ValueError(
                "A payment_method_id or payment_intent_id is required for online payments."
            )

        order = transaction.payment.order
        amount_cents = int(transaction.amount * 100)
        metadata = {
            "order_id": str(order.id),
            "transaction_id": str(transaction.id),
        }

        try:
            if payment_method_id:
                intent = stripe.PaymentIntent.create(
                    amount=amount_cents,
                    currency="usd",
                    payment_method=payment_method_id,
                    confirm=True,
                    automatic_payment_methods={
                        "enabled": True,
                        "allow_redirects": "never",
                    },
                    metadata=metadata,
                )
            else:
                intent = stripe.PaymentIntent.confirm(
                    payment_intent_id,
                    automatic_payment_methods={
                        "enabled": True,
                        "allow_redirects": "never",
                    },
                )

            transaction.transaction_id = intent.id
            transaction.provider_response = intent.to_dict()

            if intent.status == "succeeded":
                transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
            elif intent.status == "requires_action":
                transaction.status = PaymentTransaction.TransactionStatus.PENDING
            else:
                transaction.status = PaymentTransaction.TransactionStatus.FAILED

        except stripe.error.CardError as e:
            transaction.status = PaymentTransaction.TransactionStatus.FAILED
            transaction.provider_response = {
                "error": {"message": e.user_message or str(e)}
            }
        except Exception as e:
            transaction.status = PaymentTransaction.TransactionStatus.FAILED
            transaction.provider_response = {"error": {"message": str(e)}}

        transaction.save()
        return transaction

    def refund_transaction(
        self, transaction: PaymentTransaction, amount: Decimal, reason: str = None
    ):
        """
        Refunds a Stripe Online payment transaction.
        Assumes transaction.transaction_id holds the Payment Intent ID or Charge ID.
        """
        stripe.api_key = settings.STRIPE_SECRET_KEY
        if not transaction.transaction_id:
            raise ValueError("Stripe transaction ID is missing for refund.")

        amount_cents = int(amount * 100)

        try:
            refund = stripe.Refund.create(
                payment_intent=(
                    transaction.transaction_id
                    if transaction.transaction_id.startswith("pi_")
                    else None
                ),
                charge=(
                    transaction.transaction_id
                    if not transaction.transaction_id.startswith("pi_")
                    else None
                ),
                amount=amount_cents,
                reason=reason,
                metadata={"original_transaction_id": str(transaction.id)},
            )
            transaction.refunded_amount += Decimal(str(refund.amount)) / 100
            transaction.refund_reason = reason
            transaction.provider_response["refunds"] = (
                transaction.provider_response.get("refunds", []) + [refund.to_dict()]
            )

            if refund.status == "succeeded":
                transaction.status = PaymentTransaction.TransactionStatus.REFUNDED
            elif refund.status == "pending":
                transaction.status = PaymentTransaction.TransactionStatus.PENDING
            else:
                transaction.status = PaymentTransaction.TransactionStatus.FAILED
            transaction.save()
            return transaction
        except stripe.error.StripeError as e:
            logger.error(f"Stripe refund error for transaction {transaction.id}: {e}")
            transaction.status = PaymentTransaction.TransactionStatus.FAILED
            transaction.provider_response = {"error": {"message": str(e)}}
            transaction.save()
            raise e
        except Exception as e:
            logger.error(
                f"Unexpected error during Stripe refund for transaction {transaction.id}: {e}"
            )
            transaction.status = PaymentTransaction.TransactionStatus.FAILED
            transaction.provider_response = {"error": {"message": str(e)}}
            transaction.save()
            raise e


# We can add CardOnlineStrategy, GiftCardStrategy, etc., here later.
