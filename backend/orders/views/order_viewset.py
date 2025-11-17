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



# Import action mixins
from .cart_actions import CartActionsMixin
from .status_actions import StatusActionsMixin
from .adjustment_actions import AdjustmentActionsMixin
from .customer_actions import CustomerActionsMixin


class OrderViewSet(
    CartActionsMixin,
    StatusActionsMixin,
    AdjustmentActionsMixin,
    CustomerActionsMixin,
    TenantScopedQuerysetMixin,
    FieldsetQueryParamsMixin,
    BaseViewSet
):
    """
    ViewSet for managing orders with support for various actions.

    This viewset combines multiple mixins to provide:
    - Cart operations (CartActionsMixin)
    - Status transitions (StatusActionsMixin)
    - Adjustments (AdjustmentActionsMixin)
    - Customer info (CustomerActionsMixin)
    """
    queryset = Order.objects.all()
    serializer_class = UnifiedOrderSerializer
    permission_classes = [IsAuthenticatedOrGuestOrder]


    def get_queryset(self):
        """
        Apply tenant filtering via BaseViewSet and add store_location filtering from middleware.
        """
        queryset = super().get_queryset()

        # Add store_location filter from middleware (set by StoreLocationMiddleware from X-Store-Location header)
        store_location_id = getattr(self.request, "store_location_id", None)
        if store_location_id:
            queryset = queryset.filter(store_location_id=store_location_id)

        return queryset


    def get_serializer_class(self):
        """
        Return the appropriate serializer class based on the request action.
        Only overrides for write operations - read operations use UnifiedOrderSerializer.
        """
        if self.action == "create":
            return OrderCreateSerializer
        if self.action == "update_status":
            return UpdateOrderStatusSerializer
        # Default: UnifiedOrderSerializer (handles list, retrieve, update, partial_update via fieldsets)
        return UnifiedOrderSerializer


    def perform_create(self, serializer):
        """Handle order creation for both authenticated users and guests."""
        user = self.request.user
        order_type = serializer.validated_data.get("order_type", "POS")
        store_location = serializer.validated_data.get("store_location")

        # Differentiate logic based on order type and user authentication
        if user and user.is_authenticated:
            if order_type == Order.OrderType.POS:
                # For POS orders, the authenticated user is the cashier
                serializer.save(
                    cashier=user,
                    tenant=self.request.tenant,
                    store_location=store_location,
                )
            else:  # For WEB, APP, etc.
                # For authenticated customers, check for an existing pending order at this location
                existing_order = (
                    Order.objects.filter(
                        customer=user,
                        status=Order.OrderStatus.PENDING,
                        store_location=store_location,
                    )
                    .order_by("-created_at")
                    .first()
                )

                if existing_order:
                    # If a pending order exists for this location, use it instead of creating a new one
                    serializer.instance = existing_order
                else:
                    # If no pending order, create a new one and set the customer
                    serializer.save(
                        customer=user,
                        tenant=self.request.tenant,
                        store_location=store_location,
                    )
        else:
            # For guest users, the service layer handles getting or creating
            guest_order = GuestSessionService.create_guest_order(
                self.request, order_type=order_type, store_location=store_location
            )
            # Return the existing guest order instead of creating a new one
            serializer.instance = guest_order


    def create(self, request, *args, **kwargs):
        """
        Custom create method to use UnifiedOrderSerializer for the response,
        ensuring the full order data (including ID) is returned.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        response_serializer = UnifiedOrderSerializer(
            serializer.instance, context={"request": request, "view_mode": "detail"}
        )
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )

