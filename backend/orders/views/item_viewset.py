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



class OrderItemViewSet(TenantScopedQuerysetMixin, BaseViewSet):
    """
    A ViewSet for managing a specific item within an order.
    """

    queryset = OrderItem.objects.all()
    serializer_class = OrderItemSerializer
    authentication_classes = [CustomerCookieJWTAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticatedOrGuestOrder]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return AddItemSerializer
        if self.action == "partial_update":
            return UpdateOrderItemSerializer
        return OrderItemSerializer

    def get_queryset(self):
        """
        Filter items based on the order_pk provided in the URL.
        Tenant context and archiving handled by super().
        """
        queryset = super().get_queryset()
        return queryset.filter(order__pk=self.kwargs["order_pk"])

    def get_object(self):
        """
        Overridden to fetch the object based on order_pk and item pk.
        """
        queryset = self.get_queryset()
        obj = get_object_or_404(queryset, pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, obj.order)
        return obj

    def perform_update(self, serializer):
        """Saves the item and recalculates order totals."""
        item = serializer.save()
        OrderService.recalculate_order_totals(item.order)

    def perform_destroy(self, instance):
        """Deletes the item and recalculates order totals."""
        order = instance.order
        instance.delete()

        # If no items left in the cart, remove order-level discounts and adjustments
        if not order.items.exists():
            # Remove order-level discounts (not item-level)
            order.discounts.all().delete()

            # Remove order-level adjustments (not item-level)
            order.adjustments.filter(order_item__isnull=True).delete()

        OrderService.recalculate_order_totals(order)

    def create(self, request, *args, **kwargs):
        """
        Adds an item to an order. If the item already exists, it updates the quantity.
        Returns the entire updated order object upon success.
        """
        order_pk = self.kwargs["order_pk"]
        order = get_object_or_404(Order, pk=order_pk)
        self.check_object_permissions(request, order)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data["product_id"]
        product = get_object_or_404(Product, pk=product_id)

        # Use the service to add or update the item
        OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=serializer.validated_data.get("quantity", 1),
            selected_modifiers=serializer.validated_data.get("selected_modifiers", []),
            notes=serializer.validated_data.get("notes", ""),
        )

        # Serialize the parent order and return it
        order_serializer = UnifiedOrderSerializer(
            order, context={"request": request, "view_mode": "detail"}
        )
        return Response(order_serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["delete"], url_path="clear")
    def clear_all_items(self, request, order_pk=None):
        order = get_object_or_404(Order, pk=order_pk)
        if order.status not in [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.HOLD,
        ]:
            return Response(
                {"error": "Cannot modify a completed or cancelled order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.items.all().delete()

        # Remove order-level discounts and adjustments since cart is now empty
        order.discounts.all().delete()
        order.adjustments.filter(order_item__isnull=True).delete()

        OrderService.recalculate_order_totals(order)
        return Response(status=status.HTTP_204_NO_CONTENT)
