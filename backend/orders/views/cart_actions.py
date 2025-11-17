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




class CartActionsMixin:
    """
    Mixin for cart-related actions

    This mixin provides action methods for OrderViewSet.
    """

    def add_item_to_cart(self, request, *args, **kwargs):
        """
        A dedicated endpoint to add an item to the current user's cart.
        Handles getting or creating the order and adding the item in one step.

        Required POST data:
            - store_location: ID of the store location (REQUIRED for creating new orders)
            - product_id: ID of the product to add
            - quantity: Quantity to add
            - selected_modifiers (optional): List of modifier options
            - notes (optional): Special instructions
        """
        store_location_id = request.data.get("store_location")
        if not store_location_id:
            return Response(
                {"error": "store_location is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # First, get or create the order instance.
        # We can reuse the logic from the main create method.
        # We pass the store_location to the serializer
        create_serializer = OrderCreateSerializer(
            data={"order_type": "WEB", "store_location": store_location_id},
            context={"request": request},
        )
        create_serializer.is_valid(raise_exception=True)
        self.perform_create(create_serializer)
        order = create_serializer.instance

        # Now, validate the item data and add it to the order.
        item_serializer = AddItemSerializer(data=request.data)
        item_serializer.is_valid(raise_exception=True)

        product_id = item_serializer.validated_data["product_id"]
        product = get_object_or_404(Product, pk=product_id)

        try:
            OrderService.add_item_to_order(
                order=order,
                product=product,
                quantity=item_serializer.validated_data.get("quantity", 1),
                selected_modifiers=item_serializer.validated_data.get(
                    "selected_modifiers", []
                ),
                notes=item_serializer.validated_data.get("notes", ""),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Return the entire updated order.
        response_serializer = UnifiedOrderSerializer(
            order, context={"request": request, "view_mode": "detail"}
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)

