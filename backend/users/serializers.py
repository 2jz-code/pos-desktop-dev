from rest_framework import serializers
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import (
    TenantFilteredSerializerMixin,
    FieldsetMixin,
)
from .models import User
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)


class UnifiedUserSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for User model with fieldset support.

    Supports multiple view modes via ?view= param:
    - list: Lightweight for list endpoints (default for list action)
    - detail: Full representation (default for retrieve action)
    - reference: Minimal for nested serializers/FK references

    Usage:
        GET /api/users/              → list mode (lightweight)
        GET /api/users/?view=detail  → detail mode
        GET /api/users/1/            → detail mode (default for retrieve)
        GET /api/users/?fields=id,email → only specified fields

    Replaces: UserSerializer
    """

    class Meta:
        model = User
        fields = [
            # Core identification
            "id",
            "email",
            "username",

            # Personal info
            "first_name",
            "last_name",
            "phone_number",

            # Role & permissions
            "role",
            "is_pos_staff",
            "is_active",
            "is_staff",

            # Timestamps
            "date_joined",
            "updated_at",

            # Tenant (read-only, auto-set)
            "tenant",
        ]

        # Fieldsets for different view modes
        fieldsets = {
            # Minimal for FK references/dropdowns
            'reference': [
                'id',
                'first_name',
                'last_name',
                'email',
            ],

            # Lightweight list view
            'list': [
                'id',
                'email',
                'username',
                'first_name',
                'last_name',
                'role',
                'is_pos_staff',
                'is_active',
            ],

            # Full detail view
            'detail': [
                'id',
                'email',
                'username',
                'first_name',
                'last_name',
                'phone_number',
                'role',
                'is_pos_staff',
                'is_active',
                'is_staff',
                'date_joined',
                'updated_at',
                'tenant',
            ],
        }

        # No expandable relationships for User (no nested objects needed)
        expandable = {}

        # Optimization hints
        select_related_fields = ["tenant"]  # Fetch tenant data if needed
        prefetch_related_fields = []

        # Required fields (always included)
        required_fields = {'id'}

        # Read-only fields
        read_only_fields = ("id", "tenant", "date_joined", "updated_at")


class UserCreateSerializer(BaseModelSerializer):
    """
    SEPARATE WRITE SERIALIZER - DO NOT DELETE

    Kept separate from UnifiedUserSerializer because:
    - Handles password hashing via User.objects.create_user()
    - Different field requirements (password is write-only)
    - Password field not exposed in read operations

    For read operations, use UnifiedUserSerializer instead.

    Renamed from: UserRegistrationSerializer
    """
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ("id", "email", "username", "password", "first_name", "last_name", "role")
        read_only_fields = ("id",)
        # User model typically has no FK relationships to optimize
        select_related_fields = []
        prefetch_related_fields = []

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class SetPinSerializer(serializers.Serializer):
    pin = serializers.CharField(
        write_only=True,
        required=True,
        min_length=4,
        max_length=6,
        style={"input_type": "password"},
    )

    def validate_pin(self, value: str) -> str:
        # Numeric-only 4–6 digits, disallow trivial sequences
        if not value.isdigit():
            raise serializers.ValidationError("PIN must be numeric.")
        if not (4 <= len(value) <= 6):
            raise serializers.ValidationError("PIN must be 4 to 6 digits.")
        trivial = {"0000", "1111", "1234", "0123", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999"}
        if value in trivial:
            raise serializers.ValidationError("Choose a less guessable PIN.")
        return value

    def update(self, instance, validated_data):
        instance.set_pin(validated_data["pin"])
        return instance


class POSLoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    pin = serializers.CharField(
        required=True, write_only=True, style={"input_type": "password"}
    )
    device_id = serializers.CharField(
        required=True,
        help_text="Device ID from terminal registration - validates terminal and enforces tenant isolation"
    )


class AdminLoginSerializer(serializers.Serializer):
    """
    Email-first admin login serializer.
    Searches across all tenants and returns either:
    - User data (single tenant)
    - Tenant picker list (multiple tenants)
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True, style={"input_type": "password"})


class TenantSelectionSerializer(serializers.Serializer):
    """
    Serializer for selecting a tenant when user belongs to multiple tenants.
    Used after AdminLoginSerializer returns multiple_tenants response.
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True, style={"input_type": "password"})
    tenant_id = serializers.CharField(required=True, help_text="Selected tenant ID from tenant picker")


class WebLoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        # Add user data to the response using UnifiedUserSerializer with detail view
        data["user"] = UnifiedUserSerializer(
            self.user,
            context={'view_mode': 'detail'}
        ).data
        return data


class WebTokenRefreshSerializer(TokenRefreshSerializer):
    pass
