"""
Guest payment views.

Handles payment processing for guest users (no authentication required).
These views use session-based validation and provide simplified payment flows.
"""

from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
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
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        order_id = request.data.get("order_id")
        amount = request.data.get("amount")
        currency = request.data.get("currency", "usd")
        customer_email = request.data.get("customer_email")
        customer_name = request.data.get("customer_name")

        # Validate required fields
        if not order_id:
            return self.create_error_response("order_id is required")

        if not amount:
            return self.create_error_response("amount is required")

        try:
            # Get the order (ensure it's a guest order or belongs to current session)
            order = self.get_order_or_404(order_id)

            # Validate order access using the mixin
            self.validate_order_access(order, request)

            # Convert amount to Decimal for consistency
            amount_decimal = self.validate_amount(amount)

            # Create or get payment object
            payment, created = Payment.objects.get_or_create(
                order=order,
                defaults={
                    "total_amount_due": amount_decimal,
                    "guest_session_key": request.session.session_key,
                },
            )

            # If payment already exists, update the amount
            if not created:
                payment.total_amount_due = amount_decimal
                payment.save(update_fields=["total_amount_due"])

            # Create Stripe Payment Intent
            import stripe
            from django.conf import settings

            stripe.api_key = settings.STRIPE_SECRET_KEY

            intent_data = {
                "amount": int(amount_decimal * 100),  # Convert to cents
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

            # Create the payment intent
            intent = stripe.PaymentIntent.create(**intent_data)

            # Store the payment intent ID in the payment
            payment.guest_payment_intent_id = intent.id
            payment.save(update_fields=["guest_payment_intent_id"])

            # Create a pending transaction record
            PaymentTransaction.objects.create(
                payment=payment,
                amount=amount_decimal,
                method=PaymentTransaction.PaymentMethod.CARD_ONLINE,
                status=PaymentTransaction.TransactionStatus.PENDING,
                transaction_id=intent.id,
            )

            return self.create_success_response(
                {
                    "client_secret": intent.client_secret,
                    "payment_intent_id": intent.id,
                    "payment_id": str(payment.id),
                },
                status.HTTP_201_CREATED,
            )

        except ValueError as e:
            return self.create_error_response(str(e))
        except Exception as e:
            logger.error(f"Error creating guest payment intent: {e}")
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

        # Validate required fields
        if not payment_intent_id:
            return self.create_error_response("payment_intent_id is required")

        try:
            # Get the order to verify access
            if order_id:
                order = self.get_order_or_404(order_id)
                # Validate order access using the mixin
                self.validate_order_access(order, request)

            # Complete the payment using the service
            from ..services import PaymentService

            completed_payment = PaymentService.complete_payment(payment_intent_id)

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
