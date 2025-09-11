"""
Customer serializers with PII protection.
"""
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from core_backend.base import BaseModelSerializer
from core_backend.utils.pii import PIISerializerMixin

from .models import Customer, CustomerAddress


class CustomerRegistrationSerializer(BaseModelSerializer, PIISerializerMixin):
    """
    Serializer for customer registration.
    Includes all necessary fields for customer account creation.
    """

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    is_rewards_opted_in = serializers.BooleanField(default=False)

    class Meta:
        model = Customer
        fields = [
            "email",
            "password",
            "confirm_password",
            "first_name",
            "last_name",
            "phone_number",
            "preferred_contact_method",
            "marketing_opt_in",
            "newsletter_subscribed",
            "is_rewards_opted_in",
        ]
        extra_kwargs = {
            "email": {"required": True},
            "first_name": {"required": True},
            "last_name": {"required": True},
        }
        # Customer model has no FK relationships to optimize
        select_related_fields = []
        prefetch_related_fields = []
        # PII fields that should be masked for non-owners
        pii_mask_fields = ["email", "phone_number"]

    def validate_email(self, value):
        """Validate email uniqueness"""
        if Customer.objects.filter(email=value).exists():
            raise serializers.ValidationError("A customer with this email already exists.")
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
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )
        return attrs

    def create(self, validated_data):
        """Create customer account"""
        # Remove fields that aren't part of the Customer model
        validated_data.pop("confirm_password")
        is_rewards_opted_in = validated_data.pop("is_rewards_opted_in", False)

        # Create customer
        customer = Customer.objects.create_customer(**validated_data)

        # Store rewards opt-in preference (extend later if needed)
        # For now, we'll just note it was captured

        return customer


class CustomerLoginSerializer(serializers.Serializer):
    """
    Serializer for customer login.
    Accepts email with password.
    """

    email = serializers.EmailField()
    password = serializers.CharField()
    remember_me = serializers.BooleanField(default=False)

    def validate(self, attrs):
        """Validate customer credentials"""
        from .services import CustomerAuthService

        email = attrs.get("email")
        password = attrs.get("password")

        if email and password:
            customer = CustomerAuthService.authenticate_customer(email, password)
            if not customer:
                raise serializers.ValidationError("Invalid email or password.")

            if not customer.is_active:
                raise serializers.ValidationError("Customer account is disabled.")

            attrs["user"] = customer
        else:
            raise serializers.ValidationError("Must include email and password.")

        return attrs


class CustomerProfileSerializer(BaseModelSerializer, PIISerializerMixin):
    """
    Serializer for customer profile management.
    Handles both read and update operations.
    """

    class Meta:
        model = Customer
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "preferred_contact_method",
            "marketing_opt_in",
            "newsletter_subscribed",
            "birth_date",
            "date_joined",
            "last_login",
            "is_active",
            "email_verified",
            "phone_verified",
        ]
        read_only_fields = [
            "id",
            "date_joined",
            "last_login",
            "is_active",
            "email_verified",
            "phone_verified",
        ]
        # Customer model has no FK relationships to optimize
        select_related_fields = []
        prefetch_related_fields = []
        # PII fields that should be masked for non-owners
        pii_mask_fields = ["email", "phone_number"]

    def validate_email(self, value):
        """Validate email uniqueness (if being changed)"""
        if self.instance and self.instance.email != value:
            if Customer.objects.filter(email=value).exists():
                raise serializers.ValidationError("A customer with this email already exists.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    """
    Serializer for changing customer password.
    """

    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
    confirm_password = serializers.CharField()

    def validate_new_password(self, value):
        """Validate new password strength"""
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate(self, attrs):
        """Validate password confirmation"""
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New passwords do not match."}
            )
        return attrs


class CustomerTokenRefreshSerializer(serializers.Serializer):
    """
    Serializer for refreshing customer tokens.
    Used with cookie-based refresh tokens.
    """

    refresh = serializers.CharField()

    def validate(self, attrs):
        """Validate refresh token"""
        # This will be handled by the view using SimpleJWT's TokenRefreshSerializer
        return attrs


class CustomerAddressSerializer(BaseModelSerializer, PIISerializerMixin):
    """
    Serializer for customer addresses.
    """

    class Meta:
        model = CustomerAddress
        fields = [
            "id",
            "address_type",
            "is_default",
            "street_address",
            "apartment",
            "city",
            "state",
            "postal_code",
            "country",
            "delivery_instructions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        # No FK relationships to optimize for address
        select_related_fields = []
        prefetch_related_fields = []
        # PII fields that should be masked for non-owners
        pii_mask_fields = ["street_address", "apartment", "delivery_instructions"]

    def create(self, validated_data):
        """Create address and link to customer"""
        # Get customer from request context
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            raise serializers.ValidationError("No authenticated customer found.")

        # Assuming we have a way to get customer from request
        # This will need to be implemented based on your authentication setup
        customer = getattr(request, "customer", None)
        if not customer:
            raise serializers.ValidationError("No authenticated customer found.")

        validated_data["customer"] = customer
        return super().create(validated_data)


class CustomerSummarySerializer(BaseModelSerializer, PIISerializerMixin):
    """
    Lightweight serializer for customer summaries (lists, etc.).
    Only includes essential information with PII masking.
    """

    full_name = serializers.CharField(source="get_full_name", read_only=True)
    total_orders = serializers.IntegerField(read_only=True)
    total_spent = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "email",
            "full_name",
            "date_joined",
            "last_login",
            "is_active",
            "total_orders",
            "total_spent",
        ]
        read_only_fields = fields
        # No FK relationships to optimize
        select_related_fields = []
        prefetch_related_fields = []
        # PII fields that should be masked for non-owners
        pii_mask_fields = ["email"]


class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Serializer for password reset requests.
    """
    email = serializers.EmailField(
        help_text="Email address to send password reset link to"
    )
    
    def validate_email(self, value):
        """Normalize email address"""
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Serializer for password reset confirmation.
    """
    token = serializers.CharField(
        max_length=40,
        help_text="Password reset token from email"
    )
    new_password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
        help_text="New password"
    )
    
    def validate_new_password(self, value):
        """Validate new password strength"""
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        
        return value


class EmailVerificationRequestSerializer(serializers.Serializer):
    """
    Serializer for email verification requests (resend verification).
    """
    pass  # No fields needed for authenticated requests


class EmailVerificationConfirmSerializer(serializers.Serializer):
    """
    Serializer for email verification confirmation.
    """
    token = serializers.CharField(
        max_length=40,
        help_text="Email verification token from email"
    )