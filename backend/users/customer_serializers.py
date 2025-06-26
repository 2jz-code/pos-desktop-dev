from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .models import User


class CustomerRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for customer registration.
    Includes all necessary fields for customer account creation.
    """
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    is_rewards_opted_in = serializers.BooleanField(default=False)

    class Meta:
        model = User
        fields = [
            "username",
            "email", 
            "password",
            "confirm_password",
            "first_name",
            "last_name",
            "is_rewards_opted_in"
        ]
        extra_kwargs = {
            "email": {"required": True},
            "first_name": {"required": True},
            "last_name": {"required": True},
        }

    def validate_email(self, value):
        """Validate email uniqueness"""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_username(self, value):
        """Validate username uniqueness and format"""
        if value and User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        
        # Username format validation
        if value and not value.replace("_", "").replace("-", "").isalnum():
            raise serializers.ValidationError(
                "Username can only contain letters, numbers, underscores, and hyphens."
            )
        
        return value

    def validate_password(self, value):
        """Validate password strength"""
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate(self, attrs):
        """Validate password confirmation"""
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        """Create customer user account"""
        # Remove fields that aren't part of the User model
        validated_data.pop("confirm_password")
        is_rewards_opted_in = validated_data.pop("is_rewards_opted_in", False)
        
        # Create customer user
        user = User.objects.create_user(
            role=User.Role.CUSTOMER,
            is_staff=False,
            **validated_data
        )
        
        # Store rewards opt-in preference (extend later if needed)
        # For now, we'll just note it was captured
        
        return user


class CustomerLoginSerializer(serializers.Serializer):
    """
    Serializer for customer login.
    Accepts either email or username with password.
    """
    email_or_username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    remember_me = serializers.BooleanField(default=False)

    def validate(self, attrs):
        """Validate login credentials"""
        from .customer_services import CustomerAuthService
        
        email_or_username = attrs.get("email_or_username")
        password = attrs.get("password")
        
        if not email_or_username or not password:
            raise serializers.ValidationError("Email/username and password are required.")
        
        user = CustomerAuthService.authenticate_customer(email_or_username, password)
        
        if not user:
            raise serializers.ValidationError("Invalid credentials or account not found.")
        
        if not user.is_active:
            raise serializers.ValidationError("Account is deactivated.")
        
        attrs["user"] = user
        return attrs


class CustomerProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for customer profile information.
    Read-only fields for sensitive data.
    """
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "full_name",
            "date_joined",
            "is_active"
        ]
        read_only_fields = ["id", "email", "date_joined", "is_active"]

    def get_full_name(self, obj):
        """Return full name"""
        return f"{obj.first_name} {obj.last_name}".strip()

    def validate_username(self, value):
        """Validate username uniqueness for updates"""
        user = self.instance
        if value and value != user.username:
            if User.objects.filter(username=value).exists():
                raise serializers.ValidationError("A user with this username already exists.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    """
    Serializer for changing customer password.
    """
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        """Validate new password strength"""
        try:
            validate_password(value, self.context["request"].user)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate(self, attrs):
        """Validate password confirmation"""
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "Passwords do not match."})
        return attrs


class CustomerTokenRefreshSerializer(serializers.Serializer):
    """
    Serializer for refreshing customer authentication tokens.
    """
    refresh = serializers.CharField()

    def validate(self, attrs):
        """Validate refresh token"""
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.exceptions import TokenError
        
        try:
            refresh = RefreshToken(attrs["refresh"])
            # Verify this is a customer token
            user_id = refresh.payload.get("user_id")
            if user_id:
                user = User.objects.get(id=user_id)
                if user.role != User.Role.CUSTOMER:
                    raise serializers.ValidationError("Invalid token for customer access.")
        except (TokenError, User.DoesNotExist):
            raise serializers.ValidationError("Invalid or expired refresh token.")
        
        return attrs 