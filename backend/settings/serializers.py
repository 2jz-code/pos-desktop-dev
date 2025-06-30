from rest_framework import serializers
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    TerminalRegistration,
    PrinterConfiguration
)


class GlobalSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlobalSettings
        fields = [
            'store_name', 'tax_rate', 'surcharge_percentage', 'currency',
            'opening_time', 'closing_time', 'receipt_header', 'receipt_footer',
            'enable_web_order_notifications', 'web_order_notification_sound',
            'default_inventory_location'
        ]


class PrinterConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrinterConfiguration
        fields = "__all__"


class TerminalRegistrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminalRegistration
        fields = "__all__"


class NestedStoreLocationSerializer(serializers.ModelSerializer):
    """
    A simplified serializer for StoreLocation used for nesting.
    """
    class Meta:
        model = StoreLocation
        fields = ('id', 'name')


class TerminalLocationSerializer(serializers.ModelSerializer):
    """
    Serializer for the Stripe-specific location link.
    """
    store_location_details = NestedStoreLocationSerializer(source='store_location', read_only=True)
    is_default = serializers.SerializerMethodField()

    class Meta:
        model = TerminalLocation
        fields = ('id', 'stripe_id', 'store_location', 'store_location_details', 'is_default')

    def get_is_default(self, obj):
        return obj.store_location.is_default


class StoreLocationSerializer(serializers.ModelSerializer):
    """
    Serializer for the primary StoreLocation model.
    Includes a nested representation of the linked Stripe configuration.
    """
    # Use the serializer above for the nested representation. 'source' points to the reverse relationship
    stripe_config = TerminalLocationSerializer(source='terminallocation', read_only=True)

    class Meta:
        model = StoreLocation
        fields = ('id', 'name', 'address', 'is_default', 'stripe_config')
