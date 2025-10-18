from rest_framework import serializers
from core_backend.base import BaseModelSerializer
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
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


class GlobalSettingsSerializer(BaseModelSerializer):
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
        # Make the actual model fields write-only so they don't appear in GET responses
        extra_kwargs = {
            'default_enable_web_notifications': {'write_only': True},
            'default_play_web_notification_sound': {'write_only': True},
            'default_auto_print_web_receipt': {'write_only': True},
            'default_auto_print_web_kitchen': {'write_only': True},
        }
        select_related_fields = []
        prefetch_related_fields = []

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


class PrinterConfigurationSerializer(BaseModelSerializer):
    class Meta:
        model = PrinterConfiguration
        fields = "__all__"
        read_only_fields = ['tenant']
        select_related_fields = []
        prefetch_related_fields = []


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


class StoreLocationListSerializer(BaseModelSerializer):
    """
    Lightweight serializer for listing store locations.
    Used in dropdowns and simple lists for better performance.

    Returns effective web order settings (location overrides OR tenant defaults).
    """

    stripe_config = TerminalLocationSerializer(
        source="terminallocation", read_only=True
    )
    business_hours = NestedBusinessHoursSerializer(read_only=True)
    web_order_settings = serializers.SerializerMethodField()

    class Meta:
        model = StoreLocation
        fields = (
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
            # Contact info
            "phone",
            "email",
            # Settings
            "timezone",
            "tax_rate",
            "accepts_web_orders",
            "web_order_lead_time_minutes",
            # Web order settings (effective values - location overrides OR tenant defaults)
            "web_order_settings",
            # Inventory defaults (Phase 5)
            "low_stock_threshold",
            "expiration_threshold",
            "default_inventory_location",
            "stripe_config",
            "business_hours",
        )
        read_only_fields = ('slug',)
        select_related_fields = ["default_inventory_location"]
        prefetch_related_fields = ["terminallocation", "business_hours", "web_notification_terminals"]

    def get_web_order_settings(self, obj):
        """
        Return effective web order settings for this location.
        Location-specific overrides take precedence over tenant-wide defaults.
        """
        effective_settings = obj.get_effective_web_order_settings()
        return {
            'enable_notifications': effective_settings['enable_notifications'],
            'play_notification_sound': effective_settings['play_notification_sound'],
            'auto_print_receipt': effective_settings['auto_print_receipt'],
            'auto_print_kitchen': effective_settings['auto_print_kitchen'],
            'terminal_device_ids': [
                terminal.device_id
                for terminal in effective_settings['terminals']
            ]
        }


class StoreLocationSerializer(BaseModelSerializer):
    """
    Serializer for the primary StoreLocation model.
    Includes a nested representation of the linked Stripe configuration.

    Phase 5 Enhancement: Now includes all location-centric settings fields.
    No default location concept - all locations are explicit.
    """

    # Use the serializer above for the nested representation. 'source' points to the reverse relationship
    stripe_config = TerminalLocationSerializer(
        source="terminallocation", read_only=True
    )
    business_hours = NestedBusinessHoursSerializer(read_only=True)
    web_order_settings = serializers.SerializerMethodField()

    class Meta:
        model = StoreLocation
        fields = (
            "id",
            "name",
            "slug",
            # Structured address fields (Phase 5)
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
            # Web order settings (includes both effective values and raw overrides)
            "web_order_settings",
            # Receipt customization
            "receipt_header",
            "receipt_footer",
            # Inventory defaults (Phase 5)
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
        read_only_fields = ('slug',)  # Auto-generated from name
        select_related_fields = ["default_inventory_location"]
        prefetch_related_fields = ["terminallocation", "business_hours", "web_notification_terminals"]

    def get_web_order_settings(self, obj):
        """
        Return web order settings for this location.
        Includes both effective values (for display) and raw override values (for editing).
        """
        effective_settings = obj.get_effective_web_order_settings()
        return {
            # Effective values (location overrides OR tenant defaults)
            'enable_notifications': effective_settings['enable_notifications'],
            'play_notification_sound': effective_settings['play_notification_sound'],
            'auto_print_receipt': effective_settings['auto_print_receipt'],
            'auto_print_kitchen': effective_settings['auto_print_kitchen'],
            'terminal_device_ids': [
                terminal.device_id
                for terminal in effective_settings['terminals']
            ],
            # Raw override values (null means use tenant default)
            'overrides': {
                'enable_web_notifications': obj.enable_web_notifications,
                'play_web_notification_sound': obj.play_web_notification_sound,
                'auto_print_web_receipt': obj.auto_print_web_receipt,
                'auto_print_web_kitchen': obj.auto_print_web_kitchen,
                'web_notification_terminals': [
                    terminal.device_id
                    for terminal in obj.web_notification_terminals.all()
                ]
            }
        }

    def update(self, instance, validated_data):
        # Handle web order settings updates from web_order_settings.overrides structure
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


# WebOrderSettingsSerializer REMOVED - settings now managed directly on StoreLocation


class StockActionReasonConfigSerializer(BaseModelSerializer):
    """
    Serializer for StockActionReasonConfig model.
    Handles validation for system reason protection.
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
        read_only_fields = ['is_system_reason', 'created_at', 'updated_at']
    
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


class StockActionReasonConfigListSerializer(BaseModelSerializer):
    """
    Lightweight serializer for listing stock action reasons.
    Used in dropdowns and simple lists.
    """
    
    usage_count = serializers.ReadOnlyField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    
    class Meta:
        model = StockActionReasonConfig
        fields = [
            'id',
            'name',
            'category',
            'category_display',
            'is_system_reason',
            'is_active',
            'usage_count',
        ]
