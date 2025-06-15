from rest_framework import serializers
from .models import GlobalSettings, POSDevice, TerminalLocation


class GlobalSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlobalSettings
        fields = "__all__"


class POSDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = POSDevice
        fields = ["device_id", "reader_id", "nickname"]


class TerminalLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminalLocation
        fields = ["id", "name", "stripe_id", "is_default"]
