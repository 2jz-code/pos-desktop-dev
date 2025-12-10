from django.db import models
from rest_framework import viewsets, status, generics
from core_backend.base import BaseViewSet
from rest_framework.exceptions import NotFound
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from rest_framework.request import Request
import stripe
import logging

from orders.models import Order, OrderItem
from orders.serializers import (
    UnifiedOrderSerializer,
    OrderCreateSerializer,
    AddItemSerializer,
    UpdateOrderItemSerializer,
    UpdateOrderStatusSerializer,
    OrderItemSerializer,
    OrderCustomerInfoSerializer,
    OrderAdjustmentSerializer,
    ApplyOneOffDiscountSerializer,
    ApplyPriceOverrideSerializer,
)
from orders.services import OrderService, GuestSessionService  # Re-exported from services/__init__.py
from orders.filters import OrderFilter
from core_backend.base.mixins import FieldsetQueryParamsMixin, TenantScopedQuerysetMixin
from orders.permissions import (
    IsAuthenticatedOrGuestOrder,
    IsGuestOrAuthenticated,
)
from rest_framework.permissions import AllowAny
from users.permissions import IsAdminOrHigher
from customers.authentication import CustomerCookieJWTAuthentication
from users.authentication import CookieJWTAuthentication
from products.models import Product
from payments.models import Payment
from payments.strategies import StripeTerminalStrategy
from notifications.services import EmailService

logger = logging.getLogger(__name__)




class StatusActionsMixin:
    """
    Mixin for order status transition actions

    This mixin provides action methods for OrderViewSet.
    """

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request: Request, pk=None) -> Response:
        """
        Voids the order with manager approval check.

        Returns either:
        - 200: Order voided successfully
        - 202: Approval required (returns approval request info)
        - 400: Validation error
        """
        order = self.get_object()
        try:
            result = OrderService.void_order_with_approval_check(
                order=order,
                user=request.user
            )

            # Check if approval is required
            if isinstance(result, dict) and result.get('status') == 'pending_approval':
                return Response(result, status=status.HTTP_202_ACCEPTED)

            # Order voided successfully - return serialized order
            serializer = self.get_serializer(result)
            return Response(serializer.data)

        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request: Request, pk=None) -> Response:
        """Cancels the order."""
        return self._handle_status_change(request, OrderService.cancel_order)


    @action(detail=True, methods=["post"], url_path="resume")
    def resume(self, request: Request, pk=None) -> Response:
        """Resumes a held order by setting its status to PENDING."""
        return self._handle_status_change(request, OrderService.resume_order)


    @action(detail=True, methods=["post"], url_path="hold")
    def hold(self, request: Request, pk=None) -> Response:
        """Holds the order by setting its status to HOLD."""
        return self._handle_status_change(request, OrderService.hold_order)


    def update_status(self, request, pk=None):
        """
        Updates the status of an order, ensuring valid transitions via OrderService.
        """
        order = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        try:
            OrderService.update_order_status(order=order, new_status=new_status)
            response_serializer = UnifiedOrderSerializer(
                order, context={"request": request, "view_mode": "detail"}
            )
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


    def _handle_status_change(self, request: Request, service_method) -> Response:
        """Generic handler for status-changing actions."""
        order = self.get_object()
        try:
            service_method(order)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


    @action(detail=True, methods=["post"], url_path="force-cancel-payments")
    def force_cancel_payments(self, request, pk=None):
        """
        Finds any 'PENDING' payments for an order, cancels the associated
        Stripe Payment Intents using the strategy, and resets the order's progress flag.
        """
        order = self.get_object()
        if not order.payment_in_progress_derived:
            return Response(
                {"message": "No active payment to cancel."}, status=status.HTTP_200_OK
            )

        # --- UPDATED LOGIC ---
        # Instantiate the strategy to ensure the API key is set
        terminal_strategy = StripeTerminalStrategy()

        pending_payments = Payment.objects.filter(order=order, status="PENDING")
        for payment in pending_payments:
            for transaction in payment.transactions.all():
                # Use the strategy to cancel the payment intent
                terminal_strategy.cancel_payment_intent(transaction.transaction_id)

        # Payment progress status is now managed automatically by the state machine

        return Response(
            {"status": "active payments cancelled"}, status=status.HTTP_200_OK
        )

