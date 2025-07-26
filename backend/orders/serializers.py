from rest_framework import serializers
from .models import Order, OrderItem, OrderDiscount
from users.serializers import UserSerializer
from products.serializers import ProductSerializer
from .services import OrderService
from products.models import Product
from django.db import transaction
from discounts.serializers import DiscountSerializer


class OrderItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)

    class Meta:
        model = OrderItem
        fields = "__all__"


class OrderDiscountSerializer(serializers.ModelSerializer):
    discount = DiscountSerializer(read_only=True)

    class Meta:
        model = OrderDiscount
        fields = "__all__"


class SimpleOrderSerializer(serializers.ModelSerializer):
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


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    cashier = UserSerializer(read_only=True)
    customer = UserSerializer(read_only=True)
    applied_discounts = OrderDiscountSerializer(many=True, read_only=True)
    payment_details = serializers.SerializerMethodField()
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
        select_related_fields = ["customer", "cashier", "payment_details"]
        prefetch_related_fields = [
            "items",
            "items__product",
            "applied_discounts",
            "applied_discounts__discount",
        ]

    def get_payment_details(self, obj):
        """
        Lazily import PaymentSerializer to avoid circular dependency.
        """
        from payments.serializers import PaymentSerializer

        if hasattr(obj, "payment_details"):
            return PaymentSerializer(obj.payment_details).data
        return None

    def get_total_with_tip(self, obj):
        """
        Calculate the grand total including the tip from the associated payment.
        """
        total = obj.grand_total
        # Check if the payment_details object exists and has total_tips
        if (
            hasattr(obj, "payment_details")
            and obj.payment_details
            and obj.payment_details.total_tips
        ):
            total += obj.payment_details.total_tips
        return total

    def get_amount_paid(self, obj):
        """
        Returns the amount paid (excluding tips and surcharges) from the Payment model.
        """
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.amount_paid
        return 0.00

    def get_total_tips(self, obj):
        """
        Returns the cumulative tip total from the Payment model.
        """
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_tips
        return 0.00

    def get_total_surcharges(self, obj):
        """
        Returns the total surcharges collected from the Payment model.
        """
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_surcharges
        return 0.00

    def get_total_collected(self, obj):
        """
        Returns the total amount collected from the Payment model (amount + tips + surcharges).
        """
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_collected
        return 0.00


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
    payment_in_progress = serializers.SerializerMethodField()

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

    def get_total_with_tip(self, obj):
        """
        Calculate the grand total including the tip from the associated payment.
        """
        total = obj.grand_total
        if (
            hasattr(obj, "payment_details")
            and obj.payment_details
            and obj.payment_details.total_tips
        ):
            total += obj.payment_details.total_tips
        return total

    def get_total_collected(self, obj):
        """
        Returns the total amount collected from the Payment model (amount + tips + surcharges).
        """
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_collected
        return 0.00

    def get_payment_in_progress(self, obj):
        """
        NEW: Uses derived property based on Payment.status instead of deprecated field.
        Returns True if a payment exists and is in PENDING status.
        """
        return obj.payment_in_progress_derived


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
    selected_options = serializers.ListField(
        child=serializers.IntegerField(), required=False
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
            selected_option_ids=self.validated_data.get("selected_options", []),
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
