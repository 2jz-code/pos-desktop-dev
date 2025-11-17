from rest_framework import serializers
from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier, OrderAdjustment
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin
from django.db import transaction



class UpdateOrderStatusSerializer(serializers.Serializer):
    """
    Serializer specifically for validating and updating an order's status.
    """

    status = serializers.ChoiceField(choices=Order.OrderStatus.choices)

    def validate_status(self, value):
        """
        Add any business logic for status transitions here.
        For example, a 'COMPLETED' order cannot be moved back to 'PENDING'.
        """
        # Example validation:
        # if self.instance and self.instance.status == Order.OrderStatus.COMPLETED:
        #     if value != Order.OrderStatus.VOID:
        #         raise serializers.ValidationError("A completed order cannot be changed, only voided.")
        return value

