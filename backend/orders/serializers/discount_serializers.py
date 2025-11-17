from rest_framework import serializers
from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier, OrderAdjustment
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin
from django.db import transaction

from discounts.models import Discount
from discounts.serializers import DiscountSerializer
from orders.services import OrderDiscountService


class OrderDiscountSerializer(BaseModelSerializer):
    discount = DiscountSerializer(read_only=True)

    class Meta:
        model = OrderDiscount
        fields = "__all__"

class ApplyDiscountSerializer(serializers.Serializer):
    """
    Serializer for applying a discount to an order.
    """

    discount_code = serializers.CharField(max_length=100)

    def validate_discount_code(self, value):
        """
        Check if the discount code is valid and active.
        """
        try:
            discount = Discount.objects.get(code__iexact=value, is_active=True)
        except Discount.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive discount code.")
        return discount

    def save(self, **kwargs):
        """
        Custom save method to apply the discount to the order.
        """
        order = kwargs.get("order")
        discount = self.validated_data["discount_code"]
        return OrderService.apply_discount_to_order(order=order, discount=discount)

class RemoveDiscountSerializer(serializers.Serializer):
    """
    Serializer for removing a discount from an order.
    """

    discount_id = serializers.IntegerField()

    def validate_discount_id(self, value):
        """
        Check if the discount exists.
        """
        try:
            discount = Discount.objects.get(id=value)
        except Discount.DoesNotExist:
            raise serializers.ValidationError("Discount not found.")
        return discount

    def save(self, **kwargs):
        """
        Custom save method to remove the discount from the order.
        """
        order = kwargs.get("order")
        discount = self.validated_data["discount_id"]
        return OrderService.remove_discount_from_order(order=order, discount=discount)


# ===== ORDER ADJUSTMENT SERIALIZERS =====

