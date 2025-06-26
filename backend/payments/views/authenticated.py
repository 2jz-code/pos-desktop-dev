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

logger = logging.getLogger(__name__)


class AuthenticatedOrderAccessMixin(OrderAccessMixin):
    """
    Mixin for validating authenticated user order access.
    """

    def validate_order_access(self, order, request):
        """
        Validates that an authenticated user can access the given order.
        Checks user ownership and permissions.
        """
        if not request.user.is_authenticated:
            raise ValueError("Authentication required")

        # Check if user owns the order or has permission to access it
        if order.customer and order.customer != request.user:
            # TODO: Add staff/admin permission check
            if not request.user.is_staff:
                raise ValueError(PAYMENT_MESSAGES["ACCESS_DENIED"])

        return True


class PaymentViewSet(TerminalPaymentViewSet, viewsets.ModelViewSet):
    """
    ViewSet for handling authenticated user payments.
    Provides list, retrieve, and other standard actions with user-specific filtering.
    Includes terminal payment functionality via TerminalPaymentViewSet mixin.
    """

    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Filter payments based on user permissions.
        Regular users see only their payments, staff see all.
        """
        if self.request.user.is_staff:
            return Payment.objects.all().order_by("-created_at")
        else:
            return Payment.objects.filter(order__customer=self.request.user).order_by(
                "-created_at"
            )

    @action(detail=False, methods=["post"], url_path="cancel-intent")
    def cancel_intent(self, request):
        """Cancels a payment intent for authenticated users."""
        # The frontend sends a field called 'payment_intent_id', which we know is the transaction_id
        intent_to_cancel = request.data.get("payment_intent_id")
        if not intent_to_cancel:
            return Response(
                {"error": "payment_intent_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            stripe.PaymentIntent.cancel(intent_to_cancel)

            # --- FIX: Filter on the correct 'transaction_id' field ---
            transaction = PaymentTransaction.objects.filter(
                transaction_id=intent_to_cancel
            ).first()

            if transaction and transaction.payment.order:
                order = transaction.payment.order
                order.payment_in_progress = False
                order.save(update_fields=["payment_in_progress"])

            return Response(
                {"message": "PaymentIntent canceled successfully."},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            logger.error(f"Error canceling intent {intent_to_cancel}: {e}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

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
        """
        Initiates a refund for a specific PaymentTransaction associated with this Payment.
        `pk` is the payment_id. The transaction_id, amount, and reason are passed in the request body.
        """
        payment = get_object_or_404(Payment, pk=pk)

        serializer = RefundTransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transaction_id = serializer.validated_data.get("transaction_id")
        amount = serializer.validated_data["amount"]
        reason = serializer.validated_data.get("reason")

        try:
            # Ensure the transaction belongs to this payment
            transaction_to_refund = payment.transactions.get(id=transaction_id)

            # Use the PaymentService instance method for refunding a specific transaction
            payment_service_instance = PaymentService(
                payment=payment
            )  # Initialize with the payment object
            updated_transaction = payment_service_instance.refund_transaction_with_provider(
                transaction_id=transaction_to_refund.id,  # Pass the actual transaction ID
                amount_to_refund=amount,
                reason=reason,
            )

            # Return the updated payment details
            response_serializer = PaymentSerializer(updated_transaction.payment)
            return Response(response_serializer.data, status=status.HTTP_200_OK)

        except PaymentTransaction.DoesNotExist:
            return Response(
                {
                    "error": f"Transaction with ID {transaction_id} not found for this payment."
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotImplementedError as e:
            return Response({"error": str(e)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        except Exception as e:
            logger.error(
                f"Error initiating refund for payment {pk}, transaction {transaction_id}: {e}"
            )
            return Response(
                {"error": f"An unexpected error occurred during refund: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CreateUserPaymentIntentView(
    BasePaymentView, PaymentValidationMixin, AuthenticatedOrderAccessMixin
):
    """
    Creates a Stripe Payment Intent for authenticated users.

    Enhanced with user-specific features like:
    - Link to Stripe Customer
    - Support for saved payment methods
    - Enhanced security and fraud detection
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Creates a payment intent for authenticated user checkout.

        Expected payload:
        {
            "order_id": "uuid",
            "amount": "decimal_string",
            "currency": "usd",  # optional
            "save_payment_method": true,  # optional
            "payment_method_id": "pm_xxx"  # optional, for saved methods
        }
        """
        order_id = request.data.get("order_id")
        amount = request.data.get("amount")
        currency = request.data.get("currency", "usd")

        # Validate required fields
        if not order_id:
            return self.create_error_response("order_id is required")

        if not amount:
            return self.create_error_response("amount is required")

        try:
            # Get the order and validate access
            order = self.get_order_or_404(order_id)
            self.validate_order_access(order, request)

            # Convert amount to Decimal for consistency
            amount_decimal = self.validate_amount(amount)

            # Create or get payment object
            payment, created = Payment.objects.get_or_create(
                order=order,
                defaults={
                    "total_amount_due": amount_decimal,
                    "status": Payment.PaymentStatus.PENDING,
                },
            )

            # If payment already exists, update the amount
            if not created:
                payment.total_amount_due = amount_decimal
                payment.save(update_fields=["total_amount_due"])

            # Create Stripe Payment Intent
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
                    "customer_type": "authenticated",
                    "user_id": str(request.user.id),
                },
            }

            # Add customer info from authenticated user
            if request.user.email:
                intent_data["receipt_email"] = request.user.email

            # Set description with user info
            user_name = f"{request.user.first_name} {request.user.last_name}".strip()
            if not user_name:
                user_name = request.user.username
            intent_data["description"] = f"Order payment for {user_name}"

            # TODO: Future enhancement - create/link Stripe Customer
            # if request.data.get("save_payment_method"):
            #     customer = self._get_or_create_stripe_customer(request.user)
            #     intent_data["customer"] = customer.id

            # Create the payment intent
            intent = stripe.PaymentIntent.create(**intent_data)

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
            logger.error(f"Error creating authenticated payment intent: {e}")
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CompleteUserPaymentView(
    BasePaymentView, PaymentValidationMixin, AuthenticatedOrderAccessMixin
):
    """
    Completes an authenticated user payment with enhanced features.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Completes an authenticated user payment.

        Expected payload:
        {
            "payment_intent_id": "stripe_pi_id",
            "order_id": "uuid",  # optional for verification
            "save_payment_method": true  # optional
        }
        """
        payment_intent_id = request.data.get("payment_intent_id")
        order_id = request.data.get("order_id")

        # Validate required fields
        if not payment_intent_id:
            return self.create_error_response("payment_intent_id is required")

        try:
            # Get the payment intent from Stripe to verify it succeeded
            import stripe
            from django.conf import settings

            stripe.api_key = settings.STRIPE_SECRET_KEY
            intent = stripe.PaymentIntent.retrieve(payment_intent_id)

            if intent.status != "succeeded":
                return self.create_error_response(
                    f"Payment intent status is {intent.status}, expected 'succeeded'"
                )

            # Get order ID from intent metadata if not provided
            if not order_id:
                order_id = intent.metadata.get("order_id")

            if not order_id:
                return self.create_error_response(
                    "order_id not found in request or payment intent metadata"
                )

            # Get the order and validate access
            order = self.get_order_or_404(order_id)
            self.validate_order_access(order, request)

            # Find the existing transaction
            try:
                transaction = PaymentTransaction.objects.get(
                    transaction_id=payment_intent_id
                )
            except PaymentTransaction.DoesNotExist:
                return self.create_error_response(
                    "Payment transaction not found for this payment intent"
                )

            # Update the transaction with successful status
            transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
            transaction.provider_response = intent.to_dict()

            # Extract card information if available
            if intent.charges and intent.charges.data:
                charge = intent.charges.data[0]
                if charge.payment_method_details and charge.payment_method_details.card:
                    card_details = charge.payment_method_details.card
                    transaction.card_last_four = card_details.last4
                    transaction.card_brand = card_details.brand.upper()

            transaction.save()

            # Update payment status using the service
            from ..services import PaymentService

            PaymentService._update_payment_status(transaction.payment)

            # Mark order as completed if fully paid
            if transaction.payment.status == Payment.PaymentStatus.PAID:
                from orders.services import OrderService

                OrderService.update_order_status(order, Order.OrderStatus.COMPLETED)
                OrderService.update_payment_status(order, Order.PaymentStatus.PAID)

            return self.create_success_response(
                {
                    "message": "Payment completed successfully",
                    "payment_id": str(transaction.payment.id),
                    "transaction_id": str(transaction.id),
                    "order_status": order.status,
                    "payment_status": order.payment_status,
                }
            )

        except ValueError as e:
            return self.create_error_response(str(e))
        except Exception as e:
            logger.error(f"Error completing authenticated payment: {e}")
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
