from rest_framework import serializers
from core_backend.base import BaseModelSerializer
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    PrinterConfiguration,
    WebOrderSettings,
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
            # Web order notification defaults (tenant-wide)
            "web_order_defaults",
        ]
        select_related_fields = []
        prefetch_related_fields = []

    def get_web_order_defaults(self, obj):
        """
        Get tenant-wide web order notification defaults.
        These are fallback values used when locations don't have overrides.
        """
        try:
            web_settings = obj.tenant.web_order_settings
            return {
                "enable_notifications": web_settings.enable_notifications,
                "play_notification_sound": web_settings.play_notification_sound,
                "auto_print_receipt": web_settings.auto_print_receipt,
                "auto_print_kitchen": web_settings.auto_print_kitchen,
            }
        except AttributeError:
            # Fallback if WebOrderSettings doesn't exist yet
            return {
                "enable_notifications": True,
                "play_notification_sound": True,
                "auto_print_receipt": True,
                "auto_print_kitchen": True,
            }


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

    class Meta:
        model = TerminalLocation
        fields = (
            "id",
            "stripe_id",
            "store_location",
        )
        select_related_fields = ["store_location"]
        prefetch_related_fields = []


class StoreLocationListSerializer(BaseModelSerializer):
    """
    Lightweight serializer for listing store locations.
    Used in dropdowns and simple lists for better performance.
    """

    stripe_config = TerminalLocationSerializer(
        source="terminallocation", read_only=True
    )
    business_hours = NestedBusinessHoursSerializer(read_only=True)
    web_notification_terminals = serializers.SerializerMethodField()

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
            # Web order notification overrides (Phase 5)
            "enable_web_notifications",
            "play_web_notification_sound",
            "auto_print_web_receipt",
            "auto_print_web_kitchen",
            "web_notification_terminals",
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

    def get_web_notification_terminals(self, obj):
        """Return list of terminal device_ids for this location"""
        return [terminal.device_id for terminal in obj.web_notification_terminals.all()]


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
    web_notification_terminals = serializers.SerializerMethodField()

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
            # Web order notification overrides (Phase 5)
            "enable_web_notifications",
            "play_web_notification_sound",
            "auto_print_web_receipt",
            "auto_print_web_kitchen",
            "web_notification_terminals",
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

    def get_web_notification_terminals(self, obj):
        """Return list of terminal device_ids for this location"""
        return [terminal.device_id for terminal in obj.web_notification_terminals.all()]

    def update(self, instance, validated_data):
        # Handle web_notification_terminals update separately since it's a ManyToMany field
        if "web_notification_terminals" in self.initial_data:
            terminal_ids = self.initial_data.get("web_notification_terminals", [])
            # Clear existing and set new terminals
            instance.web_notification_terminals.clear()
            if terminal_ids:
                terminals = TerminalRegistration.objects.filter(
                    device_id__in=terminal_ids,
                    tenant=instance.tenant,
                    store_location=instance  # Only terminals at this location
                )
                instance.web_notification_terminals.set(terminals)

        return super().update(instance, validated_data)


class WebOrderSettingsSerializer(BaseModelSerializer):
    """
    Serializer for WebOrderSettings model.
    Handles tenant-wide web order notification defaults.
    Terminal selection is managed per-location on StoreLocation model.
    """

    class Meta:
        model = WebOrderSettings
        fields = [
            "enable_notifications",
            "play_notification_sound",
            "auto_print_receipt",
            "auto_print_kitchen",
        ]
        select_related_fields = []
        prefetch_related_fields = []


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
