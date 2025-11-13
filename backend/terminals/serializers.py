from rest_framework import serializers
from .models import TerminalPairingCode, TerminalRegistration


class DeviceAuthorizationSerializer(serializers.Serializer):
    """Serializer for device authorization request (RFC 8628)"""
    client_id = serializers.CharField(required=True)
    device_fingerprint = serializers.CharField(required=True, max_length=255)


class TokenRequestSerializer(serializers.Serializer):
    """Serializer for token polling request (RFC 8628)"""
    grant_type = serializers.CharField(required=True)
    device_code = serializers.CharField(required=True)
    client_id = serializers.CharField(required=True)

    def validate_grant_type(self, value):
        expected = 'urn:ietf:params:oauth:grant-type:device_code'
        if value != expected:
            raise serializers.ValidationError(f'Expected: {expected}')
        return value


class ApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval request"""
    user_code = serializers.CharField(required=True, max_length=9)
    location_id = serializers.IntegerField(required=True)
    nickname = serializers.CharField(required=False, max_length=100, allow_blank=True)


class TerminalPairingCodeSerializer(serializers.ModelSerializer):
    """Serializer for TerminalPairingCode (for admin viewing)"""
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = TerminalPairingCode
        fields = [
            'device_code',
            'user_code',
            'device_fingerprint',
            'status',
            'expires_at',
            'interval',
            'nickname',
            'tenant',
            'tenant_slug',
            'location',
            'location_name',
            'created_by',
            'created_by_username',
            'approved_at',
            'consumed_at',
            'created_at',
            'ip_address',
        ]
        read_only_fields = [
            'device_code',
            'user_code',
            'device_fingerprint',
            'status',
            'expires_at',
            'interval',
            'tenant',
            'location',
            'created_by',
            'approved_at',
            'consumed_at',
            'created_at',
            'ip_address',
        ]


class TerminalRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for TerminalRegistration"""
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)
    location_name = serializers.CharField(source='store_location.name', read_only=True, allow_null=True)
    pairing_code_user_code = serializers.CharField(source='pairing_code.user_code', read_only=True, allow_null=True)

    class Meta:
        model = TerminalRegistration
        fields = [
            'device_id',
            'nickname',
            'last_seen',
            'is_active',
            'reader_id',
            'device_fingerprint',
            'last_authenticated_at',
            'authentication_failures',
            'is_locked',
            'pairing_code',
            'pairing_code_user_code',
            'store_location',
            'location_name',
            'tenant',
            'tenant_slug',
        ]
        read_only_fields = [
            'device_id',
            'last_seen',
            'device_fingerprint',
            'last_authenticated_at',
            'authentication_failures',
            'tenant',
            'pairing_code',  # Pairing code should not be changed after initial pairing
        ]
