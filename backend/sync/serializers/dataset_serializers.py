"""
Serializers for dataset sync endpoints.

These serializers are optimized for offline sync:
- Include only fields needed for POS operations
- Denormalize related data to reduce round trips
- Include version tokens for conflict detection
- Exclude legacy/internal fields
"""
from django.utils import timezone
from rest_framework import serializers
from products.models import (
    Product, Category, ModifierSet, ModifierOption,
    ProductModifierSet, Tax, ProductType
)
from discounts.models import Discount
from inventory.models import Location, InventoryStock
from settings.models import GlobalSettings, StoreLocation
from users.models import User


class SyncModifierOptionSerializer(serializers.ModelSerializer):
    """Nested modifier option for sync (no tenant field needed - parent handles it)"""

    class Meta:
        model = ModifierOption
        fields = [
            'id',
            'name',
            'price_delta',
            'display_order',
            'is_product_specific',
        ]


class SyncModifierSetSerializer(serializers.ModelSerializer):
    """ModifierSet with nested options for offline sync"""

    options = SyncModifierOptionSerializer(many=True, read_only=True)
    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = ModifierSet
        fields = [
            'id',
            'name',
            'internal_name',
            'selection_type',
            'min_selections',
            'max_selections',
            'triggered_by_option_id',
            'updated_at',
            'options',
        ]


class SyncProductModifierSetSerializer(serializers.ModelSerializer):
    """Product-ModifierSet relationship for sync"""

    modifier_set_id = serializers.UUIDField(source='modifier_set.id')

    class Meta:
        model = ProductModifierSet
        fields = [
            'modifier_set_id',
            'display_order',
            'is_required_override',
        ]


class SyncProductSerializer(serializers.ModelSerializer):
    """
    Product serializer for offline sync.

    Includes all fields needed for POS operations:
    - Basic product info (name, price, image)
    - Category and type relationships
    - Tax IDs for calculation
    - Modifier sets with display order
    - Inventory tracking flag
    - Active/public status
    """

    # Denormalize tax IDs for quick lookup
    tax_ids = serializers.SerializerMethodField()

    # Denormalize modifier sets
    modifier_sets = SyncProductModifierSetSerializer(
        source='product_modifier_sets',
        many=True,
        read_only=True
    )

    # Version token
    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'description',
            'price',
            'category_id',
            'product_type_id',
            'image',
            'track_inventory',
            'barcode',
            'has_modifiers',
            'is_active',
            'is_public',
            'tax_ids',
            'modifier_sets',
            'updated_at',
        ]

    def get_tax_ids(self, obj):
        """Return list of tax IDs for this product"""
        return [str(tax.id) for tax in obj.taxes.all()]


class SyncCategorySerializer(serializers.ModelSerializer):
    """
    Category serializer for offline sync.

    Includes MPTT fields to reconstruct tree locally.
    """

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = Category
        fields = [
            'id',
            'name',
            'description',
            'parent_id',
            'lft',
            'rght',
            'tree_id',
            'level',
            'order',
            'is_active',
            'is_public',
            'updated_at',
        ]


class SyncTaxSerializer(serializers.ModelSerializer):
    """Tax serializer for offline sync"""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = Tax
        fields = [
            'id',
            'name',
            'rate',
            'updated_at',
        ]


class SyncProductTypeSerializer(serializers.ModelSerializer):
    """ProductType serializer for offline sync"""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = ProductType
        fields = [
            'id',
            'name',
            'description',
            'inventory_behavior',
            'stock_enforcement',
            'allow_negative_stock',
            'tax_inclusive',
            'pricing_method',
            'exclude_from_discounts',
            'max_quantity_per_item',
            'is_active',
            'updated_at',
        ]


class SyncDiscountSerializer(serializers.ModelSerializer):
    """
    Discount serializer for offline sync.

    Includes applicable products/categories for client-side validation.
    """

    applicable_product_ids = serializers.SerializerMethodField()
    applicable_category_ids = serializers.SerializerMethodField()
    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = Discount
        fields = [
            'id',
            'name',
            'code',
            'type',
            'scope',
            'value',
            'min_purchase_amount',
            'buy_quantity',
            'get_quantity',
            'start_date',
            'end_date',
            'is_active',
            'applicable_product_ids',
            'applicable_category_ids',
            'updated_at',
        ]

    def get_applicable_product_ids(self, obj):
        """Return list of applicable product IDs"""
        return [str(p.id) for p in obj.applicable_products.all()]

    def get_applicable_category_ids(self, obj):
        """Return list of applicable category IDs"""
        return [str(c.id) for c in obj.applicable_categories.all()]


class SyncInventoryLocationSerializer(serializers.ModelSerializer):
    """Inventory location serializer for offline sync."""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = Location
        fields = [
            'id',
            'store_location_id',
            'name',
            'description',
            'low_stock_threshold',
            'is_active',
            'updated_at',
        ]


class SyncInventoryStockSerializer(serializers.ModelSerializer):
    """Inventory stock serializer for offline sync."""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = InventoryStock
        fields = [
            'id',
            'store_location_id',
            'product_id',
            'location_id',
            'quantity',
            'expiration_date',
            'low_stock_threshold',
            'is_active',
            'updated_at',
        ]


class SyncGlobalSettingsSerializer(serializers.ModelSerializer):
    """Global settings serializer for offline sync"""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = GlobalSettings
        fields = [
            'brand_name',
            'currency',
            'surcharge_percentage',
            'allow_discount_stacking',
            'active_terminal_provider',
            'updated_at',
        ]


class SyncStoreLocationSerializer(serializers.ModelSerializer):
    """Store location serializer for offline sync"""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = StoreLocation
        fields = [
            'id',
            'name',
            'address_line1',
            'city',
            'state',
            'postal_code',
            'country',
            'phone',
            'email',
            'timezone',
            'tax_rate',
            'accepts_web_orders',
            'manager_approvals_enabled',
            'low_stock_threshold',
            'default_inventory_location_id',
            'updated_at',
        ]


class SyncUserSerializer(serializers.ModelSerializer):
    """
    User serializer for offline sync.

    Includes hashed PIN for offline authentication.
    Only syncs POS staff (is_pos_staff=True, is_active=True).
    """

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'role',
            'is_pos_staff',
            'pin',  # Hashed PIN for offline validation
            'is_active',
            'updated_at',
        ]


class SyncResponseSerializer(serializers.Serializer):
    """
    Standard sync response format.

    Includes:
    - data: List of records
    - next_version: Token for next sync
    - deleted_ids: IDs of soft-deleted records
    """

    data = serializers.ListField()
    next_version = serializers.CharField()
    deleted_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    dataset = serializers.CharField()
    synced_at = serializers.DateTimeField(format='iso-8601')
