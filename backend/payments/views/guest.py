"""
Guest payment views.

Handles payment processing for guest users (no authentication required).
These views use session-based validation and provide simplified payment flows.
"""

from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.db import transaction
from decimal import Decimal
import logging

from .base import (
    BasePaymentView,
    PaymentValidationMixin,
    OrderAccessMixin,
    PAYMENT_MESSAGES,
)
from ..models import Payment, PaymentTransaction
from orders.models import Order

logger = logging.getLogger(__name__)


class GuestOrderAccessMixin(OrderAccessMixin):
    """
    Mixin for validating guest order access using session data.
    """

    def validate_order_access(self, order, request):
        """
        Validates that a guest user can access the given order.
        Uses session-based validation for guest orders.
        """
        # For guest orders, verify session ownership
        if order.is_guest_order:
            session_guest_id = request.session.get("guest_id")
            if session_guest_id != order.guest_id:
                raise ValueError(PAYMENT_MESSAGES["ACCESS_DENIED"])

        # If order has a customer but request user is not authenticated or doesn't match
        elif order.customer:
            if not request.user.is_authenticated or request.user != order.customer:
                raise ValueError(PAYMENT_MESSAGES["ACCESS_DENIED"])

        return True


class CreateGuestPaymentIntentView(
    BasePaymentView, PaymentValidationMixin, GuestOrderAccessMixin
):
    """
    Creates a Stripe Payment Intent for guest users.

    This endpoint allows guest users to create payment intents for their orders
    without requiring user authentication. Uses session-based order validation.

    Supports both POS flow (order_id) and web cart flow (cart_id):
    - cart_id: Converts cart → order atomically during payment (web orders)
    - order_id: Uses existing order (POS orders)
    """

    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        order_id = request.data.get("order_id")
        cart_id = request.data.get("cart_id")
        amount = request.data.get("amount")
        tip = request.data.get("tip", 0)
        currency = request.data.get("currency", "usd")
        customer_email = request.data.get("customer_email")
        customer_name = request.data.get("customer_name")

        logger.info(f"[CreateGuestPaymentIntent] Starting payment intent creation. cart_id={cart_id}, order_id={order_id}, amount={amount}")

        # Validate required fields - either order_id OR cart_id must be provided
        if not order_id and not cart_id:
            logger.error("[CreateGuestPaymentIntent] Neither order_id nor cart_id provided")
            return self.create_error_response("Either order_id or cart_id is required")

        if order_id and cart_id:
            logger.error("[CreateGuestPaymentIntent] Both order_id and cart_id provided")
            return self.create_error_response("Provide either order_id or cart_id, not both")

        if not amount:
            logger.error("[CreateGuestPaymentIntent] Amount not provided")
            return self.create_error_response("amount is required")

        try:
            # If cart_id provided (web orders), convert cart to order atomically
            if cart_id:
                from cart.models import Cart
                from cart.services import CartService

                logger.info(f"[CreateGuestPaymentIntent] Web order flow - fetching cart {cart_id}")
                # Get the cart
                cart = get_object_or_404(Cart, id=cart_id, tenant=request.tenant)
                logger.info(f"[CreateGuestPaymentIntent] Cart found. Location: {cart.store_location}, Items: {cart.items.count()}, Session: {cart.session_id[:8] if cart.session_id else 'None'}...")

                # Validate cart has location set
                if not cart.store_location:
                    logger.error(f"[CreateGuestPaymentIntent] Cart {cart_id} has no location set")
                    return self.create_error_response(
                        "Cart must have a location set before payment",
                        status.HTTP_400_BAD_REQUEST
                    )

                logger.info(f"[CreateGuestPaymentIntent] Converting cart {cart_id} to order...")
                # Convert cart to order atomically (within transaction)
                # If payment creation fails later, this will rollback
                order = CartService.convert_to_order(cart=cart, cashier=None)
                logger.info(f"[CreateGuestPaymentIntent] Cart converted successfully. Order ID: {order.id}, Order Number: {order.order_number}")
            else:
                # POS flow: order already exists
                logger.info(f"[CreateGuestPaymentIntent] POS order flow - fetching order {order_id}")
                order = self.get_order_or_404(order_id)
                # Validate order access using the mixin
                self.validate_order_access(order, request)
                logger.info(f"[CreateGuestPaymentIntent] Order found and validated: {order.id}")

            # Convert amount and tip to Decimal for consistency
            amount_decimal = self.validate_amount(amount)
            tip_decimal = self.validate_amount(tip) if tip else Decimal("0.00")
            logger.info(f"[CreateGuestPaymentIntent] Amount validated: {amount_decimal}, Tip: {tip_decimal}")

            # Calculate surcharge for online card payments
            from ..services import PaymentService
            surcharge = PaymentService.calculate_surcharge(amount_decimal)
            total_amount_with_surcharge_and_tip = amount_decimal + tip_decimal + surcharge
            logger.info(f"[CreateGuestPaymentIntent] Surcharge calculated: {surcharge}, Total with tip and surcharge: {total_amount_with_surcharge_and_tip}")

            # Create or get payment object
            # The total_amount_due should be the base amount (without surcharge)
            # Surcharges are tracked separately in the transaction
            logger.info(f"[CreateGuestPaymentIntent] Creating/getting Payment object for order {order.id}")
            payment, created = Payment.objects.get_or_create(
                order=order,
                defaults={
                    "total_amount_due": amount_decimal,
                    "guest_session_key": request.session.session_key,
                    "tenant": order.tenant,
                    "store_location": order.store_location,  # Denormalize from order for fast location queries
                },
            )
            logger.info(f"[CreateGuestPaymentIntent] Payment {'created' if created else 'retrieved'}: {payment.id}")

            # If payment already exists, update the amount
            if not created:
                payment.total_amount_due = amount_decimal
                payment.save(update_fields=["total_amount_due"])
                logger.info(f"[CreateGuestPaymentIntent] Payment amount updated to {amount_decimal}")

            # Create Stripe Payment Intent
            import stripe
            from django.conf import settings

            stripe.api_key = settings.STRIPE_SECRET_KEY

            intent_data = {
                "amount": int(total_amount_with_surcharge_and_tip * 100),  # Convert to cents
                "currency": currency,
                "automatic_payment_methods": {
                    "enabled": True,
                },
                "metadata": {
                    "order_id": str(order.id),
                    "payment_id": str(payment.id),
                    "customer_type": "guest",
                },
            }

            # Add customer info if provided
            if customer_email:
                intent_data["receipt_email"] = customer_email

            if customer_name:
                intent_data["description"] = f"Order payment for {customer_name}"

            logger.info(f"[CreateGuestPaymentIntent] Creating Stripe PaymentIntent with amount {intent_data['amount']} cents")
            # Create the payment intent
            intent = stripe.PaymentIntent.create(**intent_data)
            logger.info(f"[CreateGuestPaymentIntent] Stripe PaymentIntent created: {intent.id}")

            # Store the payment intent ID in the payment
            payment.guest_payment_intent_id = intent.id
            payment.save(update_fields=["guest_payment_intent_id"])

            # Create a pending transaction record
            logger.info(f"[CreateGuestPaymentIntent] Creating pending transaction record")
            PaymentTransaction.objects.create(
                payment=payment,
                amount=amount_decimal,
                tip=tip_decimal,
                surcharge=surcharge,
                method=PaymentTransaction.PaymentMethod.CARD_ONLINE,
                status=PaymentTransaction.TransactionStatus.PENDING,
                transaction_id=intent.id,
                tenant=payment.tenant,
            )
            logger.info(f"[CreateGuestPaymentIntent] Transaction record created successfully")

            logger.info(f"[CreateGuestPaymentIntent] Payment intent creation completed successfully for order {order.id}")
            return self.create_success_response(
                {
                    "client_secret": intent.client_secret,
                    "payment_intent_id": intent.id,
                    "payment_id": str(payment.id),
                    "tip": tip_decimal,
                    "surcharge": surcharge,
                    "total_with_surcharge_and_tip": total_amount_with_surcharge_and_tip,
                },
                status.HTTP_201_CREATED,
            )

        except ValueError as e:
            logger.error(f"[CreateGuestPaymentIntent] ValueError: {e}", exc_info=True)
            return self.create_error_response(str(e))
        except Exception as e:
            logger.error(f"[CreateGuestPaymentIntent] Unexpected error: {e}", exc_info=True)
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CompleteGuestPaymentView(
    BasePaymentView, PaymentValidationMixin, GuestOrderAccessMixin
):
    """
    Completes a guest payment after successful Stripe confirmation.

    This endpoint allows guest users to finalize their payments after
    the payment intent has been confirmed by Stripe.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        payment_intent_id = request.data.get("payment_intent_id")
        order_id = request.data.get("order_id")
        tip_amount = request.data.get("tip", 0)

        # Validate required fields
        if not payment_intent_id:
            return self.create_error_response("payment_intent_id is required")

        try:
            # Get the order to verify access
            if order_id:
                order = self.get_order_or_404(order_id)
                # Validate order access using the mixin
                self.validate_order_access(order, request)

            # Complete the payment using the service with tip amount
            from ..services import PaymentService
            from decimal import Decimal

            # Convert tip to Decimal for precise calculation
            tip_decimal = Decimal(str(tip_amount)) if tip_amount else Decimal('0.00')

            completed_payment = PaymentService.complete_payment(payment_intent_id, tip=tip_decimal)

            # Get the completed order data before clearing the session
            completed_order = completed_payment.order

            # Serialize the order data for the confirmation page
            from orders.serializers import OrderSerializer

            order_serializer = OrderSerializer(
                completed_order, context={"request": request}
            )
            order_data = order_serializer.data

            # After successful payment completion, clear the guest session
            # This prevents the completed order from being reused
            from orders.services import GuestSessionService

            GuestSessionService.clear_guest_session(request)

            return self.create_success_response(
                {
                    "status": "success",
                    "message": "Payment completed successfully",
                    "order": order_data,
                }
            )

        except PaymentTransaction.DoesNotExist:
            return self.create_error_response(
                "Payment transaction not found", status.HTTP_404_NOT_FOUND
            )
        except ValueError as e:
            return self.create_error_response(str(e))
        except Exception as e:
            logger.error(f"Error completing guest payment: {e}")
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# Export all guest views
__all__ = [
    "CreateGuestPaymentIntentView",
    "CompleteGuestPaymentView",
    "GuestOrderAccessMixin",
]
