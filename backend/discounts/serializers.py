from rest_framework import serializers
from .models import Discount
from orders.models import Order
from products.serializers import (
    BasicProductSerializer,
    BasicCategorySerializer,
    Product,
    Category,
)


class DiscountSerializer(serializers.ModelSerializer):
    """
    Serializes Discount objects, including details about what they apply to.
    """

    # --- FIX: Use nested serializers for readable names on the frontend ---
    applicable_products = BasicProductSerializer(many=True, read_only=True)
    applicable_categories = BasicCategorySerializer(many=True, read_only=True)

    # These fields are for writing data back from the frontend
    # They accept a list of IDs.
    write_applicable_products = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        many=True,
        write_only=True,
        source="applicable_products",
        required=False,
    )
    write_applicable_categories = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        many=True,
        write_only=True,
        source="applicable_categories",
        required=False,
    )

    class Meta:
        model = Discount
        fields = [
            "id",
            "name",
            "code",
            "type",
            "scope",
            "value",
            "min_purchase_amount",
            "is_active",
            "start_date",
            "end_date",
            "applicable_products",
            "applicable_categories",
            "write_applicable_products",
            "write_applicable_categories",
            "buy_quantity",
            "get_quantity",
        ]
        prefetch_related_fields = [
            'applicable_products',
            'applicable_categories'
        ]

    def validate(self, data):
        scope = data.get("scope")
        # When creating, the field might not be in `data` if not provided.
        # `validated_data` from the serializer instance would contain it after initial processing.
        # Here, we use `.get` which is safer. `applicable_products` is the `source`.
        products = data.get("applicable_products")
        categories = data.get("applicable_categories")

        if scope == Discount.DiscountScope.PRODUCT and not products:
            raise serializers.ValidationError(
                {"write_applicable_products": "At least one product must be selected for a product-specific discount."}
            )

        if scope == Discount.DiscountScope.CATEGORY and not categories:
            raise serializers.ValidationError(
                {"write_applicable_categories": "At least one category must be selected for a category-specific discount."}
            )
        
        return data


# Sync-specific serializer that sends simple field values instead of nested objects
class DiscountSyncSerializer(serializers.ModelSerializer):
    """
    Sync-specific serializer for discounts that only includes basic fields
    suitable for SQLite storage without nested objects.
    """

    class Meta:
        model = Discount
        fields = [
            "id",
            "name",
            "type",
            "scope",
            "value",
            "min_purchase_amount",
            "buy_quantity",
            "get_quantity",
            "is_active",
            "start_date",
            "end_date",
        ]


class DiscountApplySerializer(serializers.Serializer):
    """
    Serializer for applying a discount to an order.
    Requires the ID of the discount to be applied. The order is typically
    inferred from the URL.
    """

    discount_id = serializers.PrimaryKeyRelatedField(
        queryset=Discount.objects.filter(is_active=True),
        help_text="The ID of the discount to apply.",
    )

    def validate(self, data):
        """
        The view will pass the order from the URL context.
        """
        order = self.context.get("order")
        if not order:
            raise serializers.ValidationError("Order context not provided.")

        # You could add more validation here, e.g., checking if the order
        # is in a state that can accept discounts.

        return data
