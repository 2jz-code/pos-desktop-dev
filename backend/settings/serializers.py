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


class GlobalSettingsSerializer(BaseModelSerializer):
    class Meta:
        model = GlobalSettings
        fields = [
            "store_name",
            "store_address",
            "store_phone",
            "store_email",
            "tax_rate",
            "surcharge_percentage",
            "currency",
            "opening_time",
            "closing_time",
            "timezone",
            "receipt_header",
            "receipt_footer",
            "active_terminal_provider",
            "default_inventory_location",
            "default_store_location",
            "allow_discount_stacking",
            "default_low_stock_threshold",
            "default_expiration_threshold",
        ]
        select_related_fields = ["default_inventory_location", "default_store_location"]
        prefetch_related_fields = []


class PrinterConfigurationSerializer(BaseModelSerializer):
    class Meta:
        model = PrinterConfiguration
        fields = "__all__"
        select_related_fields = []
        prefetch_related_fields = []


class NestedStoreLocationSerializer(BaseModelSerializer):
    """
    A simplified serializer for StoreLocation used for nesting.
    """

    class Meta:
        model = StoreLocation
        fields = ("id", "name")
        select_related_fields = []
        prefetch_related_fields = []


class TerminalLocationSerializer(BaseModelSerializer):
    """
    Serializer for the Stripe-specific location link.
    """

    store_location_details = NestedStoreLocationSerializer(
        source="store_location", read_only=True
    )
    is_default = serializers.SerializerMethodField()

    class Meta:
        model = TerminalLocation
        fields = (
            "id",
            "stripe_id",
            "store_location",
            "store_location_details",
            "is_default",
        )
        select_related_fields = ["store_location"]
        prefetch_related_fields = []

    def get_is_default(self, obj):
        return obj.store_location.is_default


class StoreLocationSerializer(BaseModelSerializer):
    """
    Serializer for the primary StoreLocation model.
    Includes a nested representation of the linked Stripe configuration.
    """

    # Use the serializer above for the nested representation. 'source' points to the reverse relationship
    stripe_config = TerminalLocationSerializer(
        source="terminallocation", read_only=True
    )

    class Meta:
        model = StoreLocation
        fields = ("id", "name", "address", "is_default", "stripe_config")
        select_related_fields = []
        prefetch_related_fields = ["terminallocation"]


class WebOrderSettingsSerializer(BaseModelSerializer):
    """
    Serializer for WebOrderSettings model.
    Handles the web order notification configuration including terminal selection.
    """

    # Simple representation - detailed terminal info available via separate endpoint
    web_receipt_terminals = serializers.SerializerMethodField()

    class Meta:
        model = WebOrderSettings
        fields = [
            "enable_notifications",
            "play_notification_sound",
            "auto_print_receipt",
            "auto_print_kitchen",
            "web_receipt_terminals",
        ]
        select_related_fields = []
        prefetch_related_fields = ["web_receipt_terminals"]

    def get_web_receipt_terminals(self, obj):
        """Return list of terminal device_ids"""
        return [terminal.device_id for terminal in obj.web_receipt_terminals.all()]

    def update(self, instance, validated_data):
        # Handle web_receipt_terminals update separately since it's a ManyToMany field
        if "web_receipt_terminals" in self.initial_data:
            terminal_ids = self.initial_data.get("web_receipt_terminals", [])
            # Clear existing and set new terminals
            instance.web_receipt_terminals.clear()
            if terminal_ids:
                from terminals.models import TerminalRegistration

                terminals = TerminalRegistration.objects.filter(
                    device_id__in=terminal_ids
                )
                instance.web_receipt_terminals.set(terminals)

        return super().update(instance, validated_data)


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
