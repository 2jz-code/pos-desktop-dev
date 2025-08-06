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

    def update(self, instance, validated_data):
        instance.set_pin(validated_data["pin"])
        return instance


class POSLoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    pin = serializers.CharField(
        required=True, write_only=True, style={"input_type": "password"}
    )


class WebLoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        # Add user data to the response
        data["user"] = UserSerializer(self.user).data
        return data


class WebTokenRefreshSerializer(TokenRefreshSerializer):
    pass
