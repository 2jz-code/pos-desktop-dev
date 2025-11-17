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



class GetPendingOrderView(generics.RetrieveAPIView):
    """
    A view to get the current user's (guest or authenticated) pending order.
    Returns 404 if no pending order exists, without creating one.
    Customer-site only endpoint.
    """

    serializer_class = UnifiedOrderSerializer  # NEW: uses unified serializer (defaults to 'detail' mode)
    authentication_classes = [
        CustomerCookieJWTAuthentication
    ]  # Customer auth only to prevent admin cookie interference
    permission_classes = [AllowAny]  # Let the service layer handle guest/auth logic

    def get_object(self):
        """
        Retrieves the pending order for the current session/user.
        """
        order = GuestSessionService.get_guest_order(self.request)

        if not order:
            # Explicitly check for an authenticated user's pending order
            if self.request.user and self.request.user.is_authenticated:
                order = (
                    Order.objects.select_related("customer", "cashier")
                    .prefetch_related(
                        "items__product",
                        "items__product__category",
                        "applied_discounts__discount",
                    )
                    .filter(
                        customer=self.request.user, status=Order.OrderStatus.PENDING
                    )
                    .order_by("-created_at")
                    .first()
                )

        if not order:
            raise NotFound("No pending order found.")

        return order

