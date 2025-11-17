from rest_framework import serializers
from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier, OrderAdjustment
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin
from django.db import transaction

from orders.services import OrderAdjustmentService
from users.serializers import UnifiedUserSerializer
from decimal import Decimal


class OrderAdjustmentSerializer(BaseModelSerializer):
    """
    Serializer for reading OrderAdjustment instances.
    Used for listing adjustments applied to an order.
    """
    applied_by = UnifiedUserSerializer(read_only=True)
    approved_by = UnifiedUserSerializer(read_only=True)
    adjustment_type_display = serializers.CharField(source='get_adjustment_type_display', read_only=True)
    discount_type_display = serializers.CharField(source='get_discount_type_display', read_only=True)

    class Meta:
        model = OrderAdjustment
        fields = [
            'id',
            'adjustment_type',
            'adjustment_type_display',
            'discount_type',
            'discount_type_display',
            'discount_value',
            'original_price',
            'new_price',
            'amount',
            'reason',
            'applied_by',
            'approved_by',
            'created_at',
            'order_item',
        ]
        read_only_fields = fields

class ApplyOneOffDiscountSerializer(serializers.Serializer):
    """
    Serializer for applying a one-off discount to an order.
    Handles validation and calls OrderAdjustmentService.
    Can apply to entire order or specific item.
    """
    discount_type = serializers.ChoiceField(
        choices=OrderAdjustment.DiscountType.choices,
        help_text="Type of discount: PERCENTAGE or FIXED"
    )
    discount_value = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0.01,
        help_text="Discount value (percentage or fixed amount)"
    )
    reason = serializers.CharField(
        max_length=500,
        required=True,
        help_text="Reason for applying this discount (audit trail)"
    )
    order_item_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Optional: ID of specific order item to apply discount to. If not provided, applies to entire order."
    )

    def validate_discount_value(self, value):
        """
        Validate discount value based on type.
        """
        if value <= 0:
            raise serializers.ValidationError("Discount value must be positive.")
        return value

    def validate(self, data):
        """
        Cross-field validation.
        """
        discount_type = data.get('discount_type')
        discount_value = data.get('discount_value')

        # Validate percentage discount
        if discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
            if discount_value > 100:
                raise serializers.ValidationError({
                    'discount_value': 'Percentage discount cannot exceed 100%.'
                })

        # Validate fixed discount against order subtotal (done in service layer)

        return data

    def save(self, **kwargs):
        """
        Apply one-off discount using the service layer.

        Expected kwargs:
        - order: Order instance
        - user: User applying the discount
        """
        from orders.services import OrderAdjustmentService
        from orders.models import OrderItem
        from django.core.exceptions import ValidationError as DjangoValidationError

        order = kwargs.get('order')
        user = kwargs.get('user')

        if not order:
            raise serializers.ValidationError("Order is required.")
        if not user:
            raise serializers.ValidationError("User is required.")

        # Get order_item if specified
        order_item = None
        order_item_id = self.validated_data.get('order_item_id')
        if order_item_id:
            try:
                order_item = OrderItem.objects.get(id=order_item_id, order=order)
            except OrderItem.DoesNotExist:
                raise serializers.ValidationError({"order_item_id": "Order item not found in this order."})

        try:
            result = OrderAdjustmentService.apply_one_off_discount_with_approval_check(
                order=order,
                discount_type=self.validated_data['discount_type'],
                discount_value=self.validated_data['discount_value'],
                reason=self.validated_data['reason'],
                applied_by=user,
                order_item=order_item,  # Pass the order_item (or None for order-level)
            )
            return result
        except DjangoValidationError as e:
            # Convert Django ValidationError to DRF ValidationError
            raise serializers.ValidationError(str(e))

class ApplyPriceOverrideSerializer(serializers.Serializer):
    """
    Serializer for applying a price override to an order item.
    Handles validation and calls OrderAdjustmentService.
    """
    order_item_id = serializers.UUIDField(
        help_text="ID of the order item to override price for"
    )
    new_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0.00,
        help_text="New price for the item"
    )
    reason = serializers.CharField(
        max_length=500,
        required=True,
        help_text="Reason for the price override (audit trail)"
    )

    def validate_order_item_id(self, value):
        """
        Validate that the order item exists.
        """
        try:
            order_item = OrderItem.objects.get(id=value)
        except OrderItem.DoesNotExist:
            raise serializers.ValidationError("Order item not found.")
        return value

    def validate_new_price(self, value):
        """
        Validate new price.
        """
        if value < 0:
            raise serializers.ValidationError("New price cannot be negative.")
        return value

    def save(self, **kwargs):
        """
        Apply price override using the service layer.

        Expected kwargs:
        - order: Order instance
        - user: User applying the price override
        """
        from orders.services import OrderAdjustmentService
        from django.core.exceptions import ValidationError as DjangoValidationError

        order = kwargs.get('order')
        user = kwargs.get('user')

        if not order:
            raise serializers.ValidationError("Order is required.")
        if not user:
            raise serializers.ValidationError("User is required.")

        # Fetch the order item
        try:
            order_item = OrderItem.objects.get(
                id=self.validated_data['order_item_id'],
                order=order
            )
        except OrderItem.DoesNotExist:
            raise serializers.ValidationError("Order item not found or does not belong to this order.")

        try:
            result = OrderAdjustmentService.apply_price_override_with_approval_check(
                order_item=order_item,
                new_price=self.validated_data['new_price'],
                reason=self.validated_data['reason'],
                applied_by=user,
                order=order,
            )
            return result
        except DjangoValidationError as e:
            # Convert Django ValidationError to DRF ValidationError
            raise serializers.ValidationError(str(e))

