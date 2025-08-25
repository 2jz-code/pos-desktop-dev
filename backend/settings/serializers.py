from rest_framework import serializers
from core_backend.base import BaseModelSerializer
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    TerminalRegistration,
    PrinterConfiguration,
    WebOrderSettings,
)


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


class TerminalRegistrationSerializer(BaseModelSerializer):
    store_location = NestedStoreLocationSerializer(read_only=True)
    store_location_id = serializers.PrimaryKeyRelatedField(
        queryset=StoreLocation.objects.all(),
        source='store_location',
        write_only=True,
        required=False,
        allow_null=True
    )

    class Meta:
        model = TerminalRegistration
        fields = [
            "device_id",
            "nickname",
            "store_location",
            "store_location_id",
            "is_active",
            "last_seen",
            "reader_id",
        ]
        select_related_fields = ["store_location"]
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

    web_receipt_terminals = TerminalRegistrationSerializer(many=True, read_only=True)

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

    def update(self, instance, validated_data):
        # Handle web_receipt_terminals update separately since it's a ManyToMany field
        if "web_receipt_terminals" in self.initial_data:
            terminal_ids = self.initial_data.get("web_receipt_terminals", [])
            # Clear existing and set new terminals
            instance.web_receipt_terminals.clear()
            if terminal_ids:
                from .models import TerminalRegistration

                terminals = TerminalRegistration.objects.filter(
                    device_id__in=terminal_ids
                )
                instance.web_receipt_terminals.set(terminals)

        return super().update(instance, validated_data)
