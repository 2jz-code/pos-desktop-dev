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

    # Fleet monitoring status fields (computed properties)
    display_status = serializers.CharField(read_only=True)
    needs_attention = serializers.BooleanField(read_only=True)
    offline_duration_seconds = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TerminalRegistration
        fields = [
            'id',
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
            # Heartbeat/sync status fields
            'last_heartbeat_at',
            'sync_status',
            'pending_orders_count',
            'pending_operations_count',
            'last_sync_success_at',
            'last_flush_success_at',
            'exposure_amount',
            # Daily offline metrics
            'daily_offline_revenue',
            'daily_offline_order_count',
            # Computed status fields
            'display_status',
            'needs_attention',
            'offline_duration_seconds',
        ]
        read_only_fields = [
            'id',
            'device_id',
            'last_seen',
            'device_fingerprint',
            'last_authenticated_at',
            'authentication_failures',
            'tenant',
            'pairing_code',  # Pairing code should not be changed after initial pairing
            'last_heartbeat_at',
            'sync_status',
            'pending_orders_count',
            'pending_operations_count',
            'last_sync_success_at',
            'last_flush_success_at',
            'exposure_amount',
            'daily_offline_revenue',
            'daily_offline_order_count',
        ]

    def get_offline_duration_seconds(self, obj):
        """Convert offline_duration timedelta to seconds for frontend consumption."""
        duration = obj.offline_duration
        if duration is None:
            return None
        return int(duration.total_seconds())
