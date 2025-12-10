from rest_framework import serializers
from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier, OrderAdjustment
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin
from django.db import transaction

from products.models import Product, ModifierOption
from orders.services import OrderItemService


class OrderCustomerInfoSerializer(BaseModelSerializer):
    """
    Serializer specifically for updating an order's customer information,
    for both guest and authenticated users.
    """

    guest_first_name = serializers.CharField(
        required=False, allow_blank=True, max_length=150
    )
    guest_last_name = serializers.CharField(
        required=False, allow_blank=True, max_length=150
    )
    guest_email = serializers.EmailField(required=False, allow_blank=True)
    guest_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)

    class Meta:
        model = Order
        fields = [
            "guest_first_name",
            "guest_last_name",
            "guest_email",
            "guest_phone",
        ]


# --- Service-driven Serializers ---

class OrderCreateSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
    from settings.models import StoreLocation

    guest_first_name = serializers.CharField(
        required=False, allow_blank=True, max_length=150
    )
    guest_last_name = serializers.CharField(
        required=False, allow_blank=True, max_length=150
    )
    guest_email = serializers.EmailField(required=False, allow_blank=True)
    guest_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)

    # TenantFilteredSerializerMixin will automatically filter this queryset by tenant
    store_location = serializers.PrimaryKeyRelatedField(
        queryset=StoreLocation.objects.all(),  # Mixin auto-filters by tenant
        required=True,
        help_text="Store location where this order is placed (REQUIRED)",
    )

    class Meta:
        model = Order
        fields = [
            "order_type",
            "dining_preference",
            "customer",
            "store_location",
            "guest_first_name",
            "guest_last_name",
            "guest_email",
            "guest_phone",
        ]

class AddItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True)
    selected_modifiers = serializers.ListField(
        child=serializers.DictField(), required=False, default=list
    )

    def validate_product_id(self, value):
        """
        Check that the product exists and is active.
        """
        try:
            product = Product.objects.get(id=value)
            if not product.is_active:
                raise serializers.ValidationError(
                    "This product is not available for sale."
                )
        except Product.DoesNotExist:
            raise serializers.ValidationError("Product not found.")
        return value

    def save(self, **kwargs):
        """
        Custom save method to pass the order context to the service.
        The 'order' is passed in the kwargs from the view.
        """
        order = kwargs.get("order")
        if not order:
            raise TypeError("The 'order' keyword argument is required.")

        product = Product.objects.get(id=self.validated_data["product_id"])
        return OrderItemService.add_item_to_order(
            order=order,
            product=product,
            quantity=self.validated_data["quantity"],
            selected_modifiers=self.validated_data.get("selected_modifiers", []),
            notes=self.validated_data.get("notes", ""),
        )

