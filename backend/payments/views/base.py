"""
Base classes and utilities for payment views.

Contains shared functionality used across different payment view types.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from decimal import Decimal
import logging

from ..models import Payment, PaymentTransaction
from orders.models import Order

logger = logging.getLogger(__name__)


class BasePaymentView(APIView):
    """
    Base class for all payment views with common functionality.
    """

    def handle_exception(self, exc):
        """
        Centralized exception handling for payment views.
        """
        logger.error(f"Payment view error in {self.__class__.__name__}: {exc}")
        return super().handle_exception(exc)

    def validate_amount(self, amount_str):
        """
        Validates and converts amount string to Decimal.
        """
        if not amount_str:
            raise ValueError("Amount is required")

        try:
            amount = Decimal(str(amount_str))
            if amount <= 0:
                raise ValueError("Amount must be greater than 0")
            return amount
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid amount format: {amount_str}")

    def get_order_or_404(self, order_id):
        """
        Gets an order by ID with error handling.
        """
        return get_object_or_404(Order, id=order_id)

    def create_error_response(self, message, status_code=status.HTTP_400_BAD_REQUEST):
        """
        Creates a standardized error response.
        """
        return Response({"error": message}, status=status_code)

    def create_success_response(self, data, status_code=status.HTTP_200_OK):
        """
        Creates a standardized success response.
        """
        return Response(data, status=status_code)


class PaymentValidationMixin:
    """
    Mixin providing common payment validation methods.
    """

    def validate_payment_intent_id(self, payment_intent_id):
        """
        Validates payment intent ID format and existence.
        """
        if not payment_intent_id:
            raise ValueError("payment_intent_id is required")

        if not isinstance(payment_intent_id, str) or len(payment_intent_id) < 10:
            raise ValueError("Invalid payment_intent_id format")

        return payment_intent_id

    def check_order_payment_status(self, order):
        """
        Checks if order is in a valid state for payment processing.
        """
        if order.status == Order.OrderStatus.COMPLETED:
            raise ValueError("This order has already been completed and paid")

        if order.status in [Order.OrderStatus.CANCELLED, Order.OrderStatus.VOID]:
            raise ValueError(f"Cannot process payment for {order.status.lower()} order")

        return True


class OrderAccessMixin:
    """
    Mixin providing order access validation methods.
    """

    def validate_order_access(self, order, request):
        """
        Base method for order access validation.
        Override in subclasses for specific access patterns.
        """
        raise NotImplementedError("Subclasses must implement validate_order_access")


# Common response messages
PAYMENT_MESSAGES = {
    "INTENT_CREATED": "Payment intent created successfully",
    "PAYMENT_COMPLETED": "Payment completed successfully",
    "PAYMENT_CANCELLED": "Payment cancelled successfully",
    "PAYMENT_FAILED": "Payment processing failed",
    "ORDER_NOT_FOUND": "Order not found",
    "ACCESS_DENIED": "Order access denied",
    "INVALID_AMOUNT": "Invalid payment amount",
    "PAYMENT_IN_PROGRESS": "A payment is already in progress for this order",
}
