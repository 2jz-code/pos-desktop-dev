from rest_framework import serializers
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin
from .models import Discount
from orders.models import Order
from products.models import Product, Category


class UnifiedDiscountSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for Discount model.

    Supports multiple view modes via ?view= param:
    - list: Lightweight for list endpoints
    - detail: Full representation (default)
    - sync: Flat fields for Electron sync
    - reference: Minimal for nested usage

    Supports expansion via ?expand= param:
    - applicable_products: Nests full product objects
    - applicable_categories: Nests full category objects

    Usage:
        GET /api/discounts/              → list mode
        GET /api/discounts/?view=detail  → detail mode
        GET /api/discounts/1/            → detail mode (default for retrieve)
        GET /api/discounts/1/?expand=applicable_products → detail + nested products
        GET /api/discounts/?view=sync    → sync mode (flat fields only)
    """

    # Read-only ID fields (default behavior - IDs only, no nesting)
    applicable_product_ids = serializers.PrimaryKeyRelatedField(
        source="applicable_products",
        many=True,
        read_only=True
    )
    applicable_category_ids = serializers.PrimaryKeyRelatedField(
        source="applicable_categories",
        many=True,
        read_only=True
    )

    # Nested representations (only used when ?expand= is requested)
    applicable_products = serializers.SerializerMethodField()
    applicable_categories = serializers.SerializerMethodField()

    # Write-only fields for mutations
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
        fields = '__all__'

        fieldsets = {
            # Lightweight list view
            'list': [
                'id', 'name', 'code', 'type', 'scope', 'value',
                'is_active', 'start_date', 'end_date',
                'applicable_product_ids', 'applicable_category_ids'
            ],

            # Full detail view (default)
            'detail': [
                'id', 'name', 'code', 'type', 'scope', 'value',
                'min_purchase_amount', 'buy_quantity', 'get_quantity',
                'is_active', 'archived_at', 'archived_by',
                'start_date', 'end_date',
                'applicable_product_ids', 'applicable_category_ids',
                'write_applicable_products', 'write_applicable_categories'
            ],

            # Sync view (flat fields for Electron)
            'sync': [
                'id', 'name', 'type', 'scope', 'value',
                'min_purchase_amount', 'buy_quantity', 'get_quantity',
                'is_active', 'archived_at', 'start_date', 'end_date'
            ],

            # Reference view (minimal for nested usage)
            'reference': [
                'id', 'name', 'code', 'type', 'value'
            ],
        }

        # Expandable relationships (?expand=applicable_products,applicable_categories)
        expandable = {
            'applicable_products': (None, {'source': 'applicable_products', 'many': True}),  # Uses SerializerMethodField
            'applicable_categories': (None, {'source': 'applicable_categories', 'many': True}),  # Uses SerializerMethodField
        }

        # Optimization hints
        select_related_fields = []
        prefetch_related_fields = [
            'applicable_products',
            'applicable_categories'
        ]

        # Required fields (always included even if not in fieldset)
        required_fields = {'id'}

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

        # Convert empty string to None for code field to avoid unique constraint issues
        # The unique constraint only applies when code is not NULL, so empty strings
        # should be stored as NULL to allow multiple discounts without codes
        if 'code' in data and data['code'] == '':
            data['code'] = None

        return data

    def get_applicable_products(self, obj):
        """
        Return minimal product info using unified ProductSerializer with 'reference' fieldset.
        Returns: id, name, barcode only
        Only called when ?expand=applicable_products is used.
        """
        from products.serializers import ProductSerializer
        products = obj.applicable_products.all()
        return ProductSerializer(
            products,
            many=True,
            context={'view_mode': 'reference'}
        ).data

    def get_applicable_categories(self, obj):
        """
        Return minimal category info.
        Returns: id, name, order
        Only called when ?expand=applicable_categories is used.
        """
        from products.serializers import CategorySerializer
        categories = obj.applicable_categories.all()
        # CategorySerializer doesn't have fieldsets yet, but we can use it directly
        # It returns more fields than BasicCategorySerializer, but that's acceptable
        return CategorySerializer(categories, many=True, context=self.context).data


# Legacy alias for backward compatibility during migration
DiscountSerializer = UnifiedDiscountSerializer


class DiscountApplySerializer(TenantFilteredSerializerMixin, serializers.Serializer):
    """
    Serializer for applying a discount to an order.
    Requires the ID of the discount to be applied. The order is typically
    inferred from the URL.
    """

    discount_id = serializers.PrimaryKeyRelatedField(
        queryset=Discount.objects.all(),  # Mixin will auto-filter by tenant
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
