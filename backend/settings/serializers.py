from rest_framework import serializers
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import (
    TenantFilteredSerializerMixin,
    FieldsetMixin,
)
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    Printer,
    KitchenZone,
    PrinterConfiguration,
    StockActionReasonConfig,
)
from terminals.models import TerminalRegistration


class NestedBusinessHoursSerializer(serializers.Serializer):
    """
    Lightweight serializer for business hours nested in StoreLocation.
    Shows just the essential info without full schedule details.
    """
    id = serializers.IntegerField()
    timezone = serializers.CharField()
    is_active = serializers.BooleanField()

    def to_representation(self, instance):
        if instance is None:
            return None
        return {
            'id': instance.id,
            'timezone': instance.timezone,
            'is_active': instance.is_active,
        }


class GlobalSettingsSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Serializer for GlobalSettings singleton model.
    Supports ?fields= query param for custom field selection.

    Note: Singleton model with no list variant - only has 'detail' fieldset.
    """
    web_order_defaults = serializers.SerializerMethodField()

    class Meta:
        model = GlobalSettings
        fields = [
            # Brand identity
            "brand_name",
            "brand_logo",
            "brand_primary_color",
            "brand_secondary_color",
            # Financial rules
            "surcharge_percentage",
            "currency",
            "allow_discount_stacking",
            # Payment processing
            "active_terminal_provider",
            # Receipt templates
            "brand_receipt_header",
            "brand_receipt_footer",
            # Web order notification defaults (tenant-wide, nested in response)
            "web_order_defaults",
            # Actual model fields (write-only, not shown in response)
            "default_enable_web_notifications",
            "default_play_web_notification_sound",
            "default_auto_print_web_receipt",
            "default_auto_print_web_kitchen",
        ]

        # Fieldset for singleton (only detail view)
        fieldsets = {
            'detail': '__all__',  # Default - all fields
        }

        # Make the actual model fields write-only so they don't appear in GET responses
        extra_kwargs = {
            'default_enable_web_notifications': {'write_only': True},
            'default_play_web_notification_sound': {'write_only': True},
            'default_auto_print_web_receipt': {'write_only': True},
            'default_auto_print_web_kitchen': {'write_only': True},
        }
        select_related_fields = []
        prefetch_related_fields = []
        required_fields = set()

    def get_web_order_defaults(self, obj):
        """
        Get tenant-wide web order notification defaults from GlobalSettings.
        These are fallback values used when locations don't have overrides.
        """
        return {
            "enable_notifications": obj.default_enable_web_notifications,
            "play_notification_sound": obj.default_play_web_notification_sound,
            "auto_print_receipt": obj.default_auto_print_web_receipt,
            "auto_print_kitchen": obj.default_auto_print_web_kitchen,
        }

    def update(self, instance, validated_data):
        """
        Handle updates including nested web_order_defaults structure.
        React Admin may send updates via the nested structure.
        """
        # Handle web_order_defaults if sent as nested object
        if "web_order_defaults" in self.initial_data:
            web_order_data = self.initial_data["web_order_defaults"]
            if "enable_notifications" in web_order_data:
                instance.default_enable_web_notifications = web_order_data["enable_notifications"]
            if "play_notification_sound" in web_order_data:
                instance.default_play_web_notification_sound = web_order_data["play_notification_sound"]
            if "auto_print_receipt" in web_order_data:
                instance.default_auto_print_web_receipt = web_order_data["auto_print_receipt"]
            if "auto_print_kitchen" in web_order_data:
                instance.default_auto_print_web_kitchen = web_order_data["auto_print_kitchen"]

        return super().update(instance, validated_data)


class PrinterSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Serializer for Printer model.
    Supports ?fields= query param for custom field selection.

    Note: Simple model with no list variant - only has 'detail' fieldset.
    """

    class Meta:
        model = Printer
        fields = [
            'id',
            'location',
            'name',
            'printer_type',
            'ip_address',
            'port',
            'is_active',
            'created_at',
            'updated_at',
        ]

        # Fieldset (only detail view - no list variant needed)
        fieldsets = {
            'detail': '__all__',  # Default - all fields
        }

        read_only_fields = ['tenant', 'created_at', 'updated_at']
        select_related_fields = ['location']
        prefetch_related_fields = []
        required_fields = {'id'}


class KitchenZoneSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Serializer for KitchenZone model.
    Returns printer details and category IDs for filtering.
    Supports ?fields= query param for custom field selection.

    Note: Simple model with no list variant - only has 'detail' fieldset.
    """
    printer_details = PrinterSerializer(source='printer', read_only=True)
    category_ids = serializers.SerializerMethodField()

    class Meta:
        model = KitchenZone
        fields = [
            'id',
            'location',
            'name',
            'printer',
            'printer_details',
            'categories',
            'category_ids',
            'print_all_items',
            'is_active',
            'created_at',
            'updated_at',
        ]

        # Fieldset (only detail view - no list variant needed)
        fieldsets = {
            'detail': '__all__',  # Default - all fields
        }

        read_only_fields = ['tenant', 'created_at', 'updated_at']
        select_related_fields = ['location', 'printer']
        prefetch_related_fields = ['categories']
        required_fields = {'id'}

    def get_category_ids(self, obj):
        """Return list of category IDs for frontend filtering."""
        if obj.print_all_items:
            return ["ALL"]
        return list(obj.categories.values_list('id', flat=True))


class PrinterConfigResponseSerializer(serializers.Serializer):
    """
    Serializer for backward-compatible printer config response.
    Matches the old JSON structure expected by Electron app.
    Sources data from relational Printer and KitchenZone models.
    """
    receipt_printers = serializers.SerializerMethodField()
    kitchen_printers = serializers.SerializerMethodField()
    kitchen_zones = serializers.SerializerMethodField()

    def get_receipt_printers(self, obj):
        """Return receipt printers in old format: [{name, ip, port}]"""
        location = obj.get('location')
        if not location:
            return []

        printers = Printer.objects.filter(
            location=location,
            printer_type='receipt',
            is_active=True
        )
        return [
            {
                'name': printer.name,
                'ip': printer.ip_address,
                'port': printer.port,
            }
            for printer in printers
        ]

    def get_kitchen_printers(self, obj):
        """Return kitchen printers in old format: [{name, ip, port}]"""
        location = obj.get('location')
        if not location:
            return []

        printers = Printer.objects.filter(
            location=location,
            printer_type='kitchen',
            is_active=True
        )
        return [
            {
                'name': printer.name,
                'ip': printer.ip_address,
                'port': printer.port,
            }
            for printer in printers
        ]

    def get_kitchen_zones(self, obj):
        """Return kitchen zones in old format: [{name, printer_name, categories, productTypes}]"""
        location = obj.get('location')
        if not location:
            return []

        zones = KitchenZone.objects.filter(
            location=location,
            is_active=True
        ).select_related('printer').prefetch_related('categories')

        result = []
        for zone in zones:
            # Get category IDs
            if zone.print_all_items:
                category_ids = ["ALL"]
            else:
                category_ids = list(zone.categories.values_list('id', flat=True))

            result.append({
                'name': zone.name,
                'printer_name': zone.printer.name,
                'categories': category_ids,
                'productTypes': [],  # Kept for backward compatibility, no longer used
            })

        return result


class TerminalLocationSerializer(BaseModelSerializer):
    """
    Serializer for the Stripe-specific location link.
    Phase 5: Removed default location concept and redundant nesting.
    """
    store_location_details = serializers.SerializerMethodField()

    class Meta:
        model = TerminalLocation
        fields = (
            "id",
            "stripe_id",
            "store_location",
            "store_location_details",
        )
        select_related_fields = ["store_location"]
        prefetch_related_fields = []

    def get_store_location_details(self, obj):
        """Return nested store location details for frontend"""
        if obj.store_location:
            return {
                "id": obj.store_location.id,
                "name": obj.store_location.name,
                "slug": obj.store_location.slug,
            }
        return None


class UnifiedStoreLocationSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for StoreLocation model with fieldset support.

    Supports multiple view modes via ?view= param:
    - reference: Minimal for FK references (id, name, slug, city, state)
    - list: Lightweight for location selection (guest checkout, admin lists)
    - detail: Full detail including receipt customization (default)

    Usage:
        # Guest checkout location list
        GET /api/settings/store-locations/?view=list

        # Admin location detail
        GET /api/settings/store-locations/123/  → detail mode

        # Orders app nested reference
        context={'view_mode': 'reference'}

    Replaces: StoreLocationSerializer, StoreLocationListSerializer

    IMPORTANT: web_order_settings returns different structure based on view_mode:
    - list mode: Effective values only (simplified for selection)
    - detail mode: Effective values + overrides structure (for admin editing)
    """

    stripe_config = TerminalLocationSerializer(
        source="terminallocation", read_only=True
    )
    business_hours = NestedBusinessHoursSerializer(read_only=True)
    web_order_settings = serializers.SerializerMethodField()

    class Meta:
        model = StoreLocation
        fields = (
            # Core identification
            "id",
            "name",
            "slug",

            # Structured address fields
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "country",

            # Contact information
            "phone",
            "email",

            # Location-specific settings
            "timezone",
            "tax_rate",

            # Web order configuration
            "accepts_web_orders",
            "web_order_lead_time_minutes",
            "web_order_settings",

            # Manager approvals
            "manager_approvals_enabled",

            # Receipt customization
            "receipt_header",
            "receipt_footer",

            # Inventory defaults
            "low_stock_threshold",
            "expiration_threshold",
            "default_inventory_location",

            # Integrations
            "google_place_id",
            "latitude",
            "longitude",

            # System fields
            "stripe_config",
            "business_hours",
        )

        # Fieldsets for different view modes
        fieldsets = {
            # Minimal for FK references (orders, etc.)
            'reference': [
                'id',
                'name',
                'slug',
                'city',
                'state',
            ],

            # Lightweight for location selection (guest checkout, admin lists)
            # Matches old StoreLocationListSerializer exactly
            'list': [
                'id',
                'name',
                'slug',
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
                'web_order_lead_time_minutes',
                'web_order_settings',  # Lightweight - effective values only
                'manager_approvals_enabled',
                'low_stock_threshold',
                'expiration_threshold',
                'default_inventory_location',
                'google_place_id',
                'latitude',
                'longitude',
                'stripe_config',
                'business_hours',
            ],

            # Full detail including receipt customization
            # Matches old StoreLocationSerializer exactly
            'detail': '__all__',
        }

        read_only_fields = ('slug',)  # Auto-generated from name
        select_related_fields = ["default_inventory_location"]
        prefetch_related_fields = ["terminallocation", "business_hours", "web_notification_terminals"]
        required_fields = {'id'}

    def get_web_order_settings(self, obj):
        """
        Return web order settings for this location.
        Structure changes based on view_mode:
        - list/reference: Effective values only (simplified)
        - detail: Effective values + overrides structure (for editing)
        """
        view_mode = self.context.get('view_mode', 'detail')
        effective_settings = obj.get_effective_web_order_settings()

        result = {
            'enable_notifications': effective_settings['enable_notifications'],
            'play_notification_sound': effective_settings['play_notification_sound'],
            'auto_print_receipt': effective_settings['auto_print_receipt'],
            'auto_print_kitchen': effective_settings['auto_print_kitchen'],
            'terminal_device_ids': [
                terminal.device_id
                for terminal in effective_settings['terminals']
            ]
        }

        # Only include overrides structure in detail mode
        if view_mode == 'detail':
            result['overrides'] = {
                'enable_web_notifications': obj.enable_web_notifications,
                'play_web_notification_sound': obj.play_web_notification_sound,
                'auto_print_web_receipt': obj.auto_print_web_receipt,
                'auto_print_web_kitchen': obj.auto_print_web_kitchen,
                'web_notification_terminals': [
                    terminal.device_id
                    for terminal in obj.web_notification_terminals.all()
                ]
            }

        return result

    def update(self, instance, validated_data):
        """Handle web order settings updates from web_order_settings.overrides structure"""
        if "web_order_settings" in self.initial_data and "overrides" in self.initial_data["web_order_settings"]:
            overrides = self.initial_data["web_order_settings"]["overrides"]

            # Update override fields
            if "enable_web_notifications" in overrides:
                instance.enable_web_notifications = overrides["enable_web_notifications"]
            if "play_web_notification_sound" in overrides:
                instance.play_web_notification_sound = overrides["play_web_notification_sound"]
            if "auto_print_web_receipt" in overrides:
                instance.auto_print_web_receipt = overrides["auto_print_web_receipt"]
            if "auto_print_web_kitchen" in overrides:
                instance.auto_print_web_kitchen = overrides["auto_print_web_kitchen"]

            # Handle terminals
            if "web_notification_terminals" in overrides:
                terminal_ids = overrides["web_notification_terminals"]
                instance.web_notification_terminals.clear()
                if terminal_ids:
                    terminals = TerminalRegistration.objects.filter(
                        device_id__in=terminal_ids,
                        tenant=instance.tenant,
                        store_location=instance
                    )
                    instance.web_notification_terminals.set(terminals)

        return super().update(instance, validated_data)


# Backward compatibility alias - orders app imports this
StoreLocationSerializer = UnifiedStoreLocationSerializer


# WebOrderSettingsSerializer REMOVED - settings now managed directly on StoreLocation


class UnifiedStockActionReasonConfigSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for StockActionReasonConfig model with fieldset support.

    Supports multiple view modes via ?view= param:
    - reference: Minimal for FK references (id, name, category)
    - list: Lightweight for dropdowns and lists
    - detail: Full detail with validation info (default)

    Usage:
        # Dropdown for stock action forms
        GET /api/settings/stock-reasons/?view=list

        # Admin detail view
        GET /api/settings/stock-reasons/123/  → detail mode

        # Inventory app nested reference
        context={'view_mode': 'reference'}

    Replaces: StockActionReasonConfigSerializer, StockActionReasonConfigListSerializer

    IMPORTANT: Preserves custom validation for system reason protection.
    System reasons (tenant=NULL) can only have is_active modified.
    """

    usage_count = serializers.ReadOnlyField()
    can_be_deleted = serializers.ReadOnlyField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = StockActionReasonConfig
        fields = [
            'id',
            'name',
            'description',
            'category',
            'category_display',
            'is_system_reason',
            'is_active',
            'usage_count',
            'can_be_deleted',
            'created_at',
            'updated_at',
        ]

        # Fieldsets for different view modes
        fieldsets = {
            # Minimal for FK references (stock actions, etc.)
            'reference': [
                'id',
                'name',
                'category',
            ],

            # Lightweight for dropdowns and simple lists
            # Matches old StockActionReasonConfigListSerializer exactly
            'list': [
                'id',
                'name',
                'category',
                'category_display',
                'is_system_reason',
                'is_active',
                'usage_count',
            ],

            # Full detail with validation info
            # Matches old StockActionReasonConfigSerializer exactly
            'detail': '__all__',
        }

        read_only_fields = ['is_system_reason', 'created_at', 'updated_at']
        select_related_fields = []
        prefetch_related_fields = []
        required_fields = {'id'}

    def validate(self, data):
        """Custom validation for system reason protection"""
        instance = getattr(self, 'instance', None)

        if instance and instance.is_system_reason:
            # For system reasons, only allow is_active to be changed
            allowed_fields = {'is_active'}
            changed_fields = set(data.keys())

            if changed_fields - allowed_fields:
                forbidden_fields = changed_fields - allowed_fields
                raise serializers.ValidationError(
                    f"System reasons can only have 'is_active' modified. "
                    f"Cannot change: {', '.join(forbidden_fields)}"
                )

        return data

    def validate_name(self, value):
        """Ensure name uniqueness among active reasons"""
        # Get the current instance if updating
        instance = getattr(self, 'instance', None)

        # Check for duplicates among active reasons
        existing = StockActionReasonConfig.objects.filter(
            name=value,
            is_active=True
        )

        if instance:
            existing = existing.exclude(pk=instance.pk)

        if existing.exists():
            raise serializers.ValidationError(
                f"An active reason with the name '{value}' already exists."
            )

        return value
