"""
Authenticated user payment views.

Handles payment processing for authenticated users with enhanced features
like saved payment methods, payment history, and user-specific settings.
"""

from rest_framework.views import APIView
from rest_framework import status, viewsets, generics
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import models
from decimal import Decimal
import logging
import stripe
import django_filters

from orders.serializers import OrderSerializer
from orders.models import Order
from customers.authentication import CustomerCookieJWTAuthentication
from core_backend.base import BaseViewSet
from core_backend.pagination import StandardPagination
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
    SurchargeCalculationSerializer,
    GiftCardSerializer,
    GiftCardValidationSerializer,
    GiftCardPaymentSerializer,
)
from ..services import PaymentService

logger = logging.getLogger(__name__)


class PaymentFilter(django_filters.FilterSet):
    """Custom filter for payments with support for filtering by payment method."""

    method = django_filters.CharFilter(method="filter_by_method")

    class Meta:
        model = Payment
        fields = ["status", "method"]

    def filter_by_method(self, queryset, name, value):
        """Filter payments by the method of their transactions."""
        if not value:
            return queryset

        # Handle special case for split payments
        if value.upper() == "SPLIT":
            # Split payments have more than one SUCCESSFUL transaction (refunded doesn't count for split)
            return queryset.annotate(
                successful_transaction_count=models.Count(
                    "transactions",
                    filter=models.Q(transactions__status=PaymentTransaction.TransactionStatus.SUCCESSFUL)
                )
            ).filter(successful_transaction_count__gt=1)
        else:
            # Single method payments - include both successful and refunded transactions
            return (
                queryset.filter(
                    transactions__method=value.upper(),
                    transactions__status__in=[
                        PaymentTransaction.TransactionStatus.SUCCESSFUL,
                        PaymentTransaction.TransactionStatus.REFUNDED
                    ]
                )
                .annotate(
                    successful_transaction_count=models.Count(
                        "transactions",
                        filter=models.Q(transactions__status=PaymentTransaction.TransactionStatus.SUCCESSFUL)
                    ),
                    processed_transaction_count=models.Count(
                        "transactions",
                        filter=models.Q(
                            transactions__status__in=[
                                PaymentTransaction.TransactionStatus.SUCCESSFUL,
                                PaymentTransaction.TransactionStatus.REFUNDED
                            ]
                        )
                    )
                )
                .filter(
                    successful_transaction_count__lte=1,  # At most 1 successful (not split)
                    processed_transaction_count__gte=1     # At least 1 processed payment
                )
            )


class SurchargeCalculationView(APIView):
    """
    Calculates the surcharge for a given amount or a list of amounts.
    """

    permission_classes = [AllowAny]
    serializer_class = SurchargeCalculationSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        amounts = serializer.validated_data.get("amounts")

        if amounts:
            surcharges = [
                PaymentService.calculate_surcharge(amount) for amount in amounts
            ]
            return Response({"surcharges": surcharges}, status=status.HTTP_200_OK)
        else:
            amount = serializer.validated_data["amount"]
            surcharge = PaymentService.calculate_surcharge(amount)
            return Response({"surcharge": surcharge}, status=status.HTTP_200_OK)




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
            and not request.user.is_pos_staff
        ):
            raise ValueError(PAYMENT_MESSAGES["ACCESS_DENIED"])
        return True


class PaymentViewSet(TerminalPaymentViewSet, BaseViewSet):
    """
    ViewSet for handling authenticated user payments.
    Provides list, retrieve, and other standard actions with user-specific filtering.
    Includes terminal payment functionality via TerminalPaymentViewSet mixin.
    (Now with automated query optimization via BaseViewSet)
    """

    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    queryset = Payment.objects.all()

    # Custom filtering and search configuration (BaseViewSet provides the rest)
    filterset_class = PaymentFilter
    search_fields = ["payment_number", "order__order_number"]
    ordering_fields = ["created_at", "status", "total_collected", "payment_number"]
    ordering = ["-created_at"]  # Override BaseViewSet default to show newest payments first

    def get_queryset(self):
        """Optimized queryset for payment operations"""
        user = self.request.user
        queryset = Payment.objects.select_related(
            'order',
            'order__customer',
            'order__cashier'
        ).prefetch_related(
            'transactions',
            'order__items__product'
        )

        if user.is_pos_staff:
            return queryset

        return queryset.filter(order__customer=user)

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
        tip = request.data.get("tip", 0)
        currency = request.data.get("currency", "usd")

        if not all([order_id, amount]):
            return self.create_error_response("order_id and amount are required")

        try:
            order = self.get_order_or_404(order_id)
            self.validate_order_access(order, request)
            amount_decimal = self.validate_amount(amount)
            tip_decimal = self.validate_amount(tip) if tip else Decimal("0.00")

            # Delegate creation to the PaymentService
            intent_details = PaymentService.create_online_payment_intent(
                order=order, amount=amount_decimal, currency=currency, user=request.user, tip=tip_decimal
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
        tip_amount = request.data.get("tip", 0)

        if not payment_intent_id:
            return self.create_error_response("payment_intent_id is required.")

        try:
            # Delegate completion logic to the PaymentService with tip amount
            from decimal import Decimal
            
            # Convert tip to Decimal for precise calculation
            tip_decimal = Decimal(str(tip_amount)) if tip_amount else Decimal('0.00')
            
            completed_payment = PaymentService.complete_payment(payment_intent_id, tip=tip_decimal)

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


class GiftCardValidationView(APIView):
    """
    Validates a gift card code and returns balance information.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Validate a gift card code and return its status and balance.
        """
        serializer = GiftCardValidationSerializer(data=request.data)

        if serializer.is_valid():
            # The serializer already validated and populated the response data
            response_data = {
                "code": serializer.validated_data["code"],
                "is_valid": serializer.validated_data["is_valid"],
                "current_balance": serializer.validated_data["current_balance"],
                "status": serializer.validated_data["status"],
            }

            # Add error message if card is not valid
            if "error_message" in serializer.validated_data:
                response_data["error_message"] = serializer.validated_data[
                    "error_message"
                ]

            return Response(response_data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class GiftCardPaymentView(generics.GenericAPIView):
    """
    Processes a payment using a gift card.
    """

    serializer_class = GiftCardPaymentSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Process a gift card payment for an order.
        """
        serializer = self.get_serializer(data=request.data)

        if serializer.is_valid():
            try:
                # The serializer's create method handles the payment processing
                # It returns a Payment object, not a PaymentTransaction
                payment = serializer.save()

                # Return the payment details
                payment_serializer = PaymentSerializer(payment)
                return Response(payment_serializer.data, status=status.HTTP_201_CREATED)

            except ValueError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as e:
                logger.error(f"Gift card payment error: {e}")
                return Response(
                    {
                        "error": "An error occurred while processing the gift card payment"
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class GiftCardListView(generics.ListAPIView):
    """
    Lists all gift cards (admin only).
    """

    serializer_class = GiftCardSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        """Only allow POS staff to view gift cards."""
        if self.request.user and self.request.user.is_authenticated and self.request.user.is_pos_staff:
            from ..models import GiftCard

            return GiftCard.objects.all().order_by("-created_at")
        from ..models import GiftCard

        return GiftCard.objects.none()


class DeliveryPaymentView(BasePaymentView):
    """
    Creates a delivery payment for manual entry of delivery platform orders.
    Marks the order as paid and completed.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Process a delivery payment for an order.
        """
        order_id = request.data.get("order_id")
        platform_id = request.data.get("platform_id")

        if not all([order_id, platform_id]):
            return self.create_error_response("order_id and platform_id are required.")

        # Validate platform_id
        from ..models import PaymentTransaction
        valid_platforms = [PaymentTransaction.PaymentMethod.DOORDASH, PaymentTransaction.PaymentMethod.UBER_EATS]
        if platform_id not in valid_platforms:
            return self.create_error_response(f"Invalid platform_id. Must be one of {valid_platforms}")

        try:
            order = self.get_order_or_404(order_id)
            
            # Create delivery payment using the service
            from ..services import PaymentService
            payment = PaymentService.create_delivery_payment(order, platform_id)

            # Return the payment details
            from ..serializers import PaymentSerializer
            payment_serializer = PaymentSerializer(payment)
            return Response(payment_serializer.data, status=status.HTTP_201_CREATED)

        except ValueError as e:
            return self.create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Delivery payment error for order {order_id}: {e}")
            return self.create_error_response(
                "An error occurred while processing the delivery payment",
                status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# Export all authenticated views
__all__ = [
    "PaymentViewSet",
    "CreateUserPaymentIntentView",
    "CompleteUserPaymentView",
    "PaymentProcessView",
    "CreatePaymentView",
    "PaymentDetailView",
    "GiftCardValidationView",
    "GiftCardPaymentView",
    "GiftCardListView",
    "DeliveryPaymentView",
    "AuthenticatedOrderAccessMixin",
]
