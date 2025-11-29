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
from settings.models import GlobalSettings, StoreLocation, Printer, KitchenZone
from terminals.models import TerminalRegistration
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

    # Timestamp fields
    created_at = serializers.DateTimeField(format='iso-8601')
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
            'created_at',
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
    """Global settings serializer for offline sync - extended for full operations"""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = GlobalSettings
        fields = [
            'brand_name',
            'brand_logo',
            'brand_primary_color',
            'brand_secondary_color',
            'currency',
            'surcharge_percentage',
            'allow_discount_stacking',
            'active_terminal_provider',
            # Receipt templates (brand defaults)
            'brand_receipt_header',
            'brand_receipt_footer',
            # Web order notification defaults
            'default_enable_web_notifications',
            'default_play_web_notification_sound',
            'default_auto_print_web_receipt',
            'default_auto_print_web_kitchen',
            'updated_at',
        ]


class SyncStoreLocationSerializer(serializers.ModelSerializer):
    """Store location serializer for offline sync - extended for full operations"""

    updated_at = serializers.DateTimeField(format='iso-8601')
    # Include web order settings for display
    web_order_settings = serializers.SerializerMethodField()

    class Meta:
        model = StoreLocation
        fields = [
            'id',
            'name',
            'address_line1',
            'address_line2',
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
            # Receipt customization
            'receipt_header',
            'receipt_footer',
            # Web order notification settings
            'web_order_settings',
            'updated_at',
        ]

    def get_web_order_settings(self, obj):
        """Return computed web order settings with tenant defaults applied"""
        effective = obj.get_effective_web_order_settings()
        return {
            'enable_notifications': effective['enable_notifications'],
            'play_notification_sound': effective['play_notification_sound'],
            'auto_print_receipt': effective['auto_print_receipt'],
            'auto_print_kitchen': effective['auto_print_kitchen'],
            # Also include the raw overrides so client knows what's local vs inherited
            'overrides': {
                'enable_web_notifications': obj.enable_web_notifications,
                'play_web_notification_sound': obj.play_web_notification_sound,
                'auto_print_web_receipt': obj.auto_print_web_receipt,
                'auto_print_web_kitchen': obj.auto_print_web_kitchen,
            }
        }


class SyncPrinterSerializer(serializers.ModelSerializer):
    """Printer serializer for offline sync"""

    updated_at = serializers.DateTimeField(format='iso-8601')

    class Meta:
        model = Printer
        fields = [
            'id',
            'name',
            'printer_type',
            'ip_address',
            'port',
            'is_active',
            'location',  # FK field - returns ID, matches regular API
            'updated_at',
        ]


class SyncKitchenZoneSerializer(serializers.ModelSerializer):
    """Kitchen zone serializer for offline sync"""

    updated_at = serializers.DateTimeField(format='iso-8601')
    category_ids = serializers.SerializerMethodField()
    printer_details = serializers.SerializerMethodField()

    class Meta:
        model = KitchenZone
        fields = [
            'id',
            'name',
            'printer',  # FK field - returns ID, matches regular API
            'printer_details',
            'print_all_items',
            'category_ids',
            'is_active',
            'location',  # FK field - returns ID, matches regular API
            'updated_at',
        ]

    def get_category_ids(self, obj):
        """Return list of category IDs for this zone"""
        return [str(c.id) for c in obj.categories.all()]

    def get_printer_details(self, obj):
        """Return basic printer info for display"""
        if obj.printer:
            return {
                'id': str(obj.printer.id),
                'name': obj.printer.name,
            }
        return None


class SyncTerminalRegistrationSerializer(serializers.ModelSerializer):
    """Terminal registration serializer for offline sync"""

    class Meta:
        model = TerminalRegistration
        fields = [
            'id',
            'device_id',
            'nickname',
            'store_location',  # FK field - returns ID, matches regular API
            'reader_id',
            'is_active',
            # Offline mode settings
            'offline_enabled',
            'offline_transaction_limit',
            'offline_daily_limit',
            'offline_transaction_count_limit',
            'offline_capture_window_hours',
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
