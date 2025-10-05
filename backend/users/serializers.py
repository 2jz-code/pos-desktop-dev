from rest_framework import serializers
from core_backend.base import BaseModelSerializer
from .models import User
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)


class UserSerializer(BaseModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "is_pos_staff",
            "is_active",
        )
        read_only_fields = ("id",)
        # User model typically has no FK relationships to optimize
        select_related_fields = []
        prefetch_related_fields = []


class UserRegistrationSerializer(BaseModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ("email", "username", "password", "first_name", "last_name", "role")
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
    tenant_id = serializers.CharField(required=False, help_text="Optional tenant ID from POS device configuration")


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
        # Add user data to the response
        data["user"] = UserSerializer(self.user).data
        return data


class WebTokenRefreshSerializer(TokenRefreshSerializer):
    pass
