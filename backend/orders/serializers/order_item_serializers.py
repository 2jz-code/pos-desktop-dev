from rest_framework import serializers
from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier, OrderAdjustment
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin
from django.db import transaction

from products.serializers import ProductSerializer
from products.models import Product, ModifierOption


class OrderItemModifierSerializer(BaseModelSerializer):
    class Meta:
        model = OrderItemModifier
        fields = ["modifier_set_name", "option_name", "price_at_sale", "quantity"]

class OrderItemSerializer(BaseModelSerializer):
    # Use unified ProductSerializer with 'order_item' fieldset
    product = serializers.SerializerMethodField()
    selected_modifiers_snapshot = OrderItemModifierSerializer(many=True, read_only=True)
    total_modifier_price = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    display_price = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = "__all__"
        select_related_fields = ["product", "order"]
        prefetch_related_fields = [
            "selected_modifiers_snapshot"
        ]  # Fix: prefetch for modifier calculations

    def get_product(self, obj):
        """
        Return product using unified ProductSerializer with appropriate fieldset.
        This replaces the old OrderItemProductSerializer.

        For websocket context, uses 'websocket_item' fieldset with minimal fields
        needed by frontend: id, name, price, image_url, modifier_groups.
        """
        if obj.product:
            # Use unified ProductSerializer with appropriate view mode
            context = self.context.copy() if self.context else {}

            # Optimize for websocket: use minimal fieldset with only frontend-needed fields
            parent_view_mode = self.context.get("view_mode")
            if parent_view_mode == "websocket":
                # Lightweight: id, name, price, image_url, modifier_groups (frontend needs these)
                context["view_mode"] = "websocket_item"
            else:
                # Full representation with all fields
                context["view_mode"] = "order_item"

            return ProductSerializer(obj.product, context=context).data
        return None

    def get_display_name(self, obj):
        """Return the item name, handling both product and custom items"""
        if obj.product:
            return obj.product.name
        return obj.custom_name or "Custom Item"

    def get_display_price(self, obj):
        """Return the item price, handling both product and custom items"""
        return str(obj.price_at_sale)

    def get_total_modifier_price(self, obj):
        """Calculate total price impact from modifiers using prefetched data"""
        # Use prefetched data to avoid N+1 queries
        if (
            hasattr(obj, "_prefetched_objects_cache")
            and "selected_modifiers_snapshot" in obj._prefetched_objects_cache
        ):
            # Use the prefetched data
            modifiers = obj._prefetched_objects_cache["selected_modifiers_snapshot"]
            return sum(
                modifier.price_at_sale * modifier.quantity for modifier in modifiers
            )
        elif hasattr(obj, "selected_modifiers_snapshot"):
            # Fallback to direct query if prefetch not available
            return sum(
                modifier.price_at_sale * modifier.quantity
                for modifier in obj.selected_modifiers_snapshot.all()
            )
        return 0

class UpdateOrderItemSerializer(BaseModelSerializer):
    """
    Serializer for updating just the quantity of an order item with policy-aware stock validation.
    """

    class Meta:
        model = OrderItem
        fields = ["quantity"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be a positive integer.")
        return value

    def update(self, instance, validated_data):
        """
        Update the order item quantity using the service layer for consistent stock validation.
        """
        new_quantity = validated_data.get("quantity", instance.quantity)

        try:
            from orders.services import OrderService

            OrderItemService.update_item_quantity(instance, new_quantity)
            return instance
        except ValueError as e:
            raise serializers.ValidationError(str(e))

