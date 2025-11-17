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




class CustomerActionsMixin:
    """
    Mixin for customer-related actions

    This mixin provides action methods for OrderViewSet.
    """

    def update_customer_info(self, request, pk=None):
        """
        Updates the customer information for an order, supporting both
        guest and authenticated users.
        """
        order = self.get_object()
        serializer = OrderCustomerInfoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_order = OrderService.update_customer_info(
                order, serializer.validated_data
            )
            response_serializer = UnifiedOrderSerializer(
                updated_order, context={"request": request, "view_mode": "detail"}
            )
            return Response(response_serializer.data)
        except Exception as e:
            logger.error(f"Error updating customer info for order {pk}: {e}")
            return Response(
                {"error": "An error occurred while updating customer information."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


    def resend_confirmation(self, request: Request, pk=None) -> Response:
        """
        Resends the order confirmation email to the customer.
        """
        order = self.get_object()
        email_service = EmailService()

        # Check if there's an email to send to
        if not order.customer_email:
            return Response(
                {"error": "No customer email associated with this order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        success = email_service.send_order_confirmation_email(order)

        if success:
            return Response(
                {"message": f"Confirmation email sent to {order.customer_email}."},
                status=status.HTTP_200_OK,
            )
        else:
            return Response(
                {"error": "Failed to send confirmation email."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

