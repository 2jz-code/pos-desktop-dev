from rest_framework import serializers
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    TerminalRegistration,
    PrinterConfiguration,
    WebOrderSettings,
)


class GlobalSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlobalSettings
        fields = [
            "store_name",
            "tax_rate",
            "surcharge_percentage",
            "currency",
            "opening_time",
            "closing_time",
            "receipt_header",
            "receipt_footer",
            "active_terminal_provider",
            "default_inventory_location",
            "allow_discount_stacking",
        ]


class PrinterConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrinterConfiguration
        fields = "__all__"


class NestedStoreLocationSerializer(serializers.ModelSerializer):
    """
    A simplified serializer for StoreLocation used for nesting.
    """

    class Meta:
        model = StoreLocation
        fields = ("id", "name")


class TerminalRegistrationSerializer(serializers.ModelSerializer):
    store_location = NestedStoreLocationSerializer(read_only=True)

    class Meta:
        model = TerminalRegistration
        fields = [
            "device_id",
            "nickname",
            "store_location",
            "is_active",
            "last_seen",
            "reader_id",
        ]


class TerminalLocationSerializer(serializers.ModelSerializer):
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

    def get_is_default(self, obj):
        return obj.store_location.is_default


class StoreLocationSerializer(serializers.ModelSerializer):
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


class WebOrderSettingsSerializer(serializers.ModelSerializer):
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
