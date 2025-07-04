"""
Authenticated user payment views.

Handles payment processing for authenticated users with enhanced features
like saved payment methods, payment history, and user-specific settings.
"""

from rest_framework import status, viewsets, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from decimal import Decimal
import logging
import stripe
from orders.serializers import OrderSerializer
from .base import (
    BasePaymentView,
    PaymentValidationMixin,
    OrderAccessMixin,
    PAYMENT_MESSAGES,
)
from .terminal import TerminalPaymentViewSet
from ..models import Payment, PaymentTransaction
from ..serializers import (
    PaymentSerializer,
    ProcessPaymentSerializer,
    RefundTransactionSerializer,
)
from ..services import PaymentService
from orders.models import Order
from users.authentication import CustomerCookieJWTAuthentication
from core_backend.mixins import OptimizedQuerysetMixin

logger = logging.getLogger(__name__)


class AuthenticatedOrderAccessMixin(OrderAccessMixin):
    """Mixin for validating authenticated user order access."""

    def get_order(self, request):
        """Retrieves the active order for the authenticated user."""
        if not request.user.is_authenticated:
            raise ValueError("Authentication required.")
        try:
            order = Order.objects.get(customer=request.user, status="PENDING")
            return order
        except Order.DoesNotExist:
            raise ValueError("No active order found for the current user.")
        except Order.MultipleObjectsReturned:
            raise ValueError("Multiple active orders found. Please resolve.")

    def validate_order_access(self, order, request):
        """Validates that an authenticated user can access the given order."""
        if not request.user.is_authenticated:
            raise ValueError("Authentication required")
        if (
            order.customer
            and order.customer != request.user
            and not request.user.is_staff
        ):
            raise ValueError(PAYMENT_MESSAGES["ACCESS_DENIED"])
        return True


class PaymentViewSet(
    OptimizedQuerysetMixin, TerminalPaymentViewSet, viewsets.ModelViewSet
):
    """
    ViewSet for handling authenticated user payments.
    Provides list, retrieve, and other standard actions with user-specific filtering.
    Includes terminal payment functionality via TerminalPaymentViewSet mixin.
    (Now with automated query optimization)
    """

    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    queryset = Payment.objects.all()

    def get_queryset(self):
        """Filter payments based on user permissions."""
        # The base queryset is now optimized by the mixin
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_staff:
            return queryset.order_by("-created_at")
        return queryset.filter(order__customer=user).order_by("-created_at")

    @action(detail=False, methods=["post"], url_path="cancel-intent")
    def cancel_intent(self, request):
        """Cancels a payment intent using the PaymentService."""
        intent_to_cancel = request.data.get("payment_intent_id")
        if not intent_to_cancel:
            return self.create_error_response("payment_intent_id is required.")

        try:
            # Delegate cancellation to the PaymentService
            result = PaymentService.cancel_payment_intent(intent_to_cancel)
            return Response(
                {"message": "PaymentIntent action processed.", "details": result}
            )
        except ValueError as e:
            return self.create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error canceling intent {intent_to_cancel}: {e}")
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["post"], url_path="add-payment")
    def add_payment(self, request, pk=None):
        """Adds a payment to an order for authenticated users."""
        order = get_object_or_404(Order, pk=pk)
        try:
            payment_service = PaymentService()
            payment = payment_service.add_payment_to_order(
                order=order,
                amount=Decimal(request.data.get("amount")),
                method=request.data.get("method"),
            )

            serializer = PaymentSerializer(payment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error adding payment to order {pk}: {e}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="force-cancel-payments")
    def force_cancel_payments(self, request, pk=None):
        """
        Finds any 'PENDING' payments for an order, cancels the associated
        Stripe Payment Intents, and resets the order's progress flag.
        """
        order = get_object_or_404(Order, pk=pk)
        if not order.payment_in_progress_derived:
            return Response(
                {"message": "No active payment to cancel."}, status=status.HTTP_200_OK
            )

        pending_payments = Payment.objects.filter(order=order, status="PENDING")
        for payment in pending_payments:
            for transaction in payment.transactions.all():
                if (
                    hasattr(transaction, "payment_intent_id")
                    and transaction.payment_intent_id
                ):
                    try:
                        stripe.PaymentIntent.cancel(transaction.payment_intent_id)
                        logger.info(
                            f"Force-cancelled Stripe PI: {transaction.payment_intent_id}"
                        )
                    except stripe.error.InvalidRequestError as e:
                        # Ignore errors for intents that can't be canceled (already processed/canceled)
                        logger.warning(
                            f"Could not force-cancel Stripe PI {transaction.payment_intent_id}: {e}"
                        )
                        pass

        return Response(
            {"status": "active payments cancelled"}, status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"], url_path="refund-transaction")
    def refund_transaction_action(self, request, pk=None):
        """Initiates a refund for a specific PaymentTransaction."""
        payment = self.get_object()
        serializer = RefundTransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transaction_id = serializer.validated_data["transaction_id"]
        amount = serializer.validated_data["amount"]
        reason = serializer.validated_data.get("reason")

        try:
            # Use the instance-based service method for refunds
            payment_service_instance = PaymentService(payment=payment)
            updated_transaction = (
                payment_service_instance.refund_transaction_with_provider(
                    transaction_id=transaction_id,
                    amount_to_refund=amount,
                    reason=reason,
                )
            )
            response_serializer = PaymentSerializer(updated_transaction.payment)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        except PaymentTransaction.DoesNotExist:
            return self.create_error_response(
                f"Transaction with ID {transaction_id} not found for this payment.",
                status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.error(f"Error on refund for payment {pk}, txn {transaction_id}: {e}")
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CreateUserPaymentIntentView(
    BasePaymentView, PaymentValidationMixin, AuthenticatedOrderAccessMixin
):
    """Creates a Stripe Payment Intent for authenticated users by calling the PaymentService."""

    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """Handles the creation of a payment intent."""
        order_id = request.data.get("order_id")
        amount = request.data.get("amount")
        currency = request.data.get("currency", "usd")

        if not all([order_id, amount]):
            return self.create_error_response("order_id and amount are required")

        try:
            order = self.get_order_or_404(order_id)
            self.validate_order_access(order, request)
            amount_decimal = self.validate_amount(amount)

            # Delegate creation to the PaymentService
            intent_details = PaymentService.create_online_payment_intent(
                order=order, amount=amount_decimal, currency=currency, user=request.user
            )

            return self.create_success_response(intent_details, status.HTTP_201_CREATED)

        except ValueError as e:
            return self.create_error_response(str(e))
        except Exception as e:
            logger.error(f"Error creating authenticated payment intent: {e}")
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CompleteUserPaymentView(BasePaymentView, AuthenticatedOrderAccessMixin):
    """Completes a payment after successful provider confirmation by calling the PaymentService."""

    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """Handles the completion of a payment."""
        payment_intent_id = request.data.get("payment_intent_id")

        if not payment_intent_id:
            return self.create_error_response("payment_intent_id is required.")

        try:
            # Delegate completion logic to the PaymentService
            # This service method handles everything: transaction status, payment status, and order status.
            completed_payment = PaymentService.complete_payment(payment_intent_id)

            # Get the completed order data for the confirmation page
            completed_order = completed_payment.order

            # Serialize both payment and order data
            payment_serializer = PaymentSerializer(completed_payment)
            order_serializer = OrderSerializer(
                completed_order, context={"request": request}
            )

            return Response(
                {"payment": payment_serializer.data, "order": order_serializer.data},
                status=status.HTTP_200_OK,
            )

        except PaymentTransaction.DoesNotExist:
            return self.create_error_response(
                "Payment transaction not found.", status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(
                f"Error completing user payment for intent {payment_intent_id}: {e}"
            )
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PaymentProcessView(generics.GenericAPIView):
    """
    Main endpoint for processing authenticated user payments.
    Takes an order_id, a payment method, and an amount.
    Orchestrates the payment via the PaymentService.
    """

    serializer_class = ProcessPaymentSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Process a payment transaction for authenticated users.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # The serializer's `create` method now returns the full Payment object
            payment = serializer.save()
            response_serializer = PaymentSerializer(payment)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CreatePaymentView(BasePaymentView):
    """
    Creates a new Payment object for authenticated users.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        order_id = request.data.get("order_id")
        if not order_id:
            return self.create_error_response("order_id is required.")

        try:
            order = self.get_order_or_404(order_id)
        except Exception:
            return self.create_error_response(
                "Order not found.", status.HTTP_404_NOT_FOUND
            )

        # Use get_or_create to be idempotent.
        payment, created = Payment.objects.get_or_create(
            order=order,
            defaults={
                "total_amount_due": order.grand_total,
                "status": Payment.PaymentStatus.PENDING,
            },
        )

        serializer = PaymentSerializer(payment)
        # Return 201 if created, 200 if it already existed.
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return self.create_success_response(serializer.data, status_code)


class PaymentDetailView(generics.RetrieveAPIView):
    """
    Retrieves payment details for authenticated users.
    """

    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "order__id"  # Look up payments by the order ID


# Export all authenticated views
__all__ = [
    "PaymentViewSet",
    "CreateUserPaymentIntentView",
    "CompleteUserPaymentView",
    "PaymentProcessView",
    "CreatePaymentView",
    "PaymentDetailView",
    "AuthenticatedOrderAccessMixin",
]
