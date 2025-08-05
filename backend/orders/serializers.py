from rest_framework import serializers
from .models import Order, OrderItem, OrderDiscount, OrderItemModifier
from users.serializers import UserSerializer
from discounts.models import Discount
from products.serializers import ProductSerializer
from .services import OrderService
from products.models import Product, ModifierOption
from django.db import transaction
from discounts.serializers import DiscountSerializer
from core_backend.base import BaseModelSerializer
from django.db.models import Prefetch


class OrderItemProductSerializer(BaseModelSerializer):
    """Lightweight product serializer for use within OrderItemSerializer"""

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "price",
            "description",
            "is_active",
            "barcode",
            "track_inventory",
        ]


class OrderItemModifierSerializer(BaseModelSerializer):
    class Meta:
        model = OrderItemModifier
        fields = ["modifier_set_name", "option_name", "price_at_sale", "quantity"]


class OrderItemSerializer(BaseModelSerializer):
    product = OrderItemProductSerializer(read_only=True)
    selected_modifiers_snapshot = OrderItemModifierSerializer(many=True, read_only=True)
    total_modifier_price = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = "__all__"
        select_related_fields = ["product", "order"]
        prefetch_related_fields = ["selected_modifiers_snapshot"]  # Fix: prefetch for modifier calculations

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


class OrderDiscountSerializer(BaseModelSerializer):
    discount = DiscountSerializer(read_only=True)

    class Meta:
        model = OrderDiscount
        fields = "__all__"


class SimpleOrderSerializer(BaseModelSerializer):
    """
    A lightweight, non-recursive serializer for an Order.
    Crucially, it does NOT include 'payment_details', breaking the circular import loop.
    """

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "order_type",
            "payment_status",
            "grand_total",
            "created_at",
            "updated_at",
        ]


class OrderSerializer(BaseModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    cashier = UserSerializer(read_only=True)
    customer = UserSerializer(read_only=True)
    applied_discounts = OrderDiscountSerializer(many=True, read_only=True)
    payment_details = serializers.SerializerMethodField()
    # Essential payment fields for frontend compatibility
    total_with_tip = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    total_tips = serializers.SerializerMethodField()
    total_surcharges = serializers.SerializerMethodField()
    total_collected = serializers.SerializerMethodField()
    is_guest_order = serializers.ReadOnlyField()
    customer_email = serializers.ReadOnlyField()
    customer_phone = serializers.ReadOnlyField()
    customer_display_name = serializers.ReadOnlyField()

    class Meta:
        model = Order
        fields = "__all__"
        read_only_fields = [
            "id",
            "order_number",
            "status",
            "payment_status",
            "subtotal",
            "total_discounts_amount",
            "tax_total",
            "grand_total",
            "created_at",
            "updated_at",
        ]
        select_related_fields = ["customer", "cashier", "payment_details"]  # Fix: add payment_details
        prefetch_related_fields = [
            Prefetch('items', queryset=OrderItem.objects.select_related('product').prefetch_related('selected_modifiers_snapshot')),
            Prefetch('applied_discounts', queryset=OrderDiscount.objects.select_related('discount')),
        ]

    def get_payment_details(self, obj):
        """
        Lazily import PaymentSerializer to avoid circular dependency.
        """
        from payments.serializers import PaymentSerializer

        if hasattr(obj, "payment_details") and obj.payment_details:
            return PaymentSerializer(obj.payment_details).data
        return None

    def get_total_with_tip(self, obj):
        """Get total with tip from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_amount_due + obj.payment_details.total_tips
        return obj.grand_total

    def get_amount_paid(self, obj):
        """Get amount paid from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.amount_paid
        return 0.00

    def get_total_tips(self, obj):
        """Get total tips from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_tips
        return 0.00

    def get_total_surcharges(self, obj):
        """Get total surcharges from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_surcharges
        return 0.00

    def get_total_collected(self, obj):
        """Get total collected from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_collected
        return 0.00


class OptimizedOrderSerializer(BaseModelSerializer):
    """
    A lightweight serializer for listing orders, providing essential details
    and a count of the items in each order.
    """

    item_count = serializers.IntegerField(source="items.count", read_only=True)
    cashier_name = serializers.CharField(source="cashier.get_full_name", read_only=True)
    customer_display_name = serializers.ReadOnlyField()
    total_with_tip = serializers.SerializerMethodField()
    total_collected = serializers.SerializerMethodField()
    payment_in_progress = serializers.ReadOnlyField(
        source="payment_in_progress_derived"
    )

    def get_total_with_tip(self, obj):
        """Get total with tip, fallback to grand_total if no payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_amount_due + obj.payment_details.total_tips
        return obj.grand_total

    def get_total_collected(self, obj):
        """Get total collected, fallback to 0.00 if no payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_collected
        return 0.00

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "order_type",
            "payment_status",
            "total_with_tip",
            "total_collected",
            "item_count",
            "cashier_name",
            "customer_display_name",
            "created_at",
            "updated_at",
            "payment_in_progress",
        ]
        select_related_fields = ["customer", "cashier", "payment_details"]
        prefetch_related_fields = ["items"]  # Fix: prefetch items for item_count


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


class OrderCreateSerializer(BaseModelSerializer):
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
            "order_type",
            "customer",
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
        return OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=self.validated_data["quantity"],
            selected_modifiers=self.validated_data.get("selected_modifiers", []),
            notes=self.validated_data.get("notes", ""),
        )


class UpdateOrderItemSerializer(BaseModelSerializer):
    """
    Serializer for updating just the quantity of an order item.
    """

    class Meta:
        model = OrderItem
        fields = ["quantity"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be a positive integer.")
        return value


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


class OrderListSerializer(serializers.ModelSerializer):
    """
    A lightweight serializer for listing orders, providing essential details
    and a count of the items in each order.
    """

    item_count = serializers.IntegerField(source="items.count", read_only=True)
    cashier_name = serializers.CharField(source="cashier.get_full_name", read_only=True)
    customer_display_name = serializers.ReadOnlyField()
    total_with_tip = serializers.SerializerMethodField()
    total_collected = serializers.SerializerMethodField()
    payment_in_progress = serializers.ReadOnlyField(
        source="payment_in_progress_derived"
    )

    def get_total_with_tip(self, obj):
        """Get total with tip, fallback to grand_total if no payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_amount_due + obj.payment_details.total_tips
        return obj.grand_total

    def get_total_collected(self, obj):
        """Get total collected, fallback to 0.00 if no payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_collected
        return 0.00

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "order_type",
            "payment_status",
            "total_with_tip",
            "total_collected",
            "item_count",
            "cashier_name",
            "customer_display_name",
            "created_at",
            "updated_at",
            "payment_in_progress",
        ]
        select_related_fields = ["customer", "cashier", "payment_details"]


class OrderCustomerInfoSerializer(serializers.ModelSerializer):
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


class OrderCreateSerializer(serializers.ModelSerializer):
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
            "order_type",
            "customer",
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
        return OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=self.validated_data["quantity"],
            selected_modifiers=self.validated_data.get("selected_modifiers", []),
            notes=self.validated_data.get("notes", ""),
        )


class UpdateOrderItemSerializer(serializers.ModelSerializer):
    """
    Serializer for updating just the quantity of an order item.
    """

    class Meta:
        model = OrderItem
        fields = ["quantity"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be a positive integer.")
        return value


class UpdateOrderStatusSerializer(serializers.Serializer):
    """
    Serializer specifically for validating and updating an order's status.
    """

    status = serializers.ChoiceField(choices=Order.OrderStatus.choices)
