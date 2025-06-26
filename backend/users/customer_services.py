from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from .models import User


class CustomerAuthService:
    """
    Service for handling customer authentication and registration.
    Separates customer-specific logic from POS staff authentication.
    """

    @staticmethod
    def register_customer(
        username, email, password, first_name="", last_name="", 
        is_rewards_opted_in=False
    ):
        """
        Register a new customer account with validation.
        """
        # Validate password strength
        try:
            validate_password(password)
        except ValidationError as e:
            raise ValueError({"password": e.messages})

        # Check if email already exists
        if User.objects.filter(email=email).exists():
            raise ValueError({"email": ["A user with this email already exists."]})

        # Check if username already exists (if provided)
        if username and User.objects.filter(username=username).exists():
            raise ValueError({"username": ["A user with this username already exists."]})

        # Create customer user
        user = User.objects.create_user(
            email=email,
            password=password,
            username=username,
            first_name=first_name,
            last_name=last_name,
            role=User.Role.CUSTOMER,
            is_staff=False,
            is_active=True
        )

        # Store rewards opt-in preference (can be extended later)
        # For now, we'll just log it or store in user profile if needed
        if is_rewards_opted_in:
            # TODO: Create customer profile model for storing preferences
            pass

        return user

    @staticmethod
    def authenticate_customer(email_or_username, password):
        """
        Authenticate a customer using email or username and password.
        Only allows customers to login, not POS staff.
        """
        # Try to find user by email first, then username
        user = None
        
        if "@" in email_or_username:
            # Looks like an email
            try:
                user = User.objects.get(email=email_or_username)
            except User.DoesNotExist:
                pass
        else:
            # Looks like a username
            try:
                user = User.objects.get(username=email_or_username)
            except User.DoesNotExist:
                pass

        if not user:
            return None

        # Only allow customers to login through this method
        if user.role != User.Role.CUSTOMER:
            return None

        # Check if user is active
        if not user.is_active:
            return None

        # Verify password
        if user.check_password(password):
            return user

        return None

    @staticmethod
    def generate_customer_tokens(user):
        """
        Generate JWT tokens for customer authentication.
        """
        if user.role != User.Role.CUSTOMER:
            raise ValueError("Only customers can use customer tokens")

        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

    @staticmethod
    def set_customer_auth_cookies(response, access_token, refresh_token):
        """
        Set authentication cookies for customer session.
        Uses different cookie names from POS to avoid conflicts.
        """
        # Use customer-specific cookie names
        access_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE']}_customer"
        refresh_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']}_customer"

        # Determine secure/samesite settings
        is_secure = not settings.DEBUG  # Secure in production
        samesite_policy = "Lax"  # More permissive for customer site

        response.set_cookie(
            key=access_cookie_name,
            value=access_token,
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
        
        response.set_cookie(
            key=refresh_cookie_name,
            value=refresh_token,
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )

    @staticmethod
    def clear_customer_auth_cookies(response):
        """
        Clear customer authentication cookies.
        """
        access_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE']}_customer"
        refresh_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']}_customer"
        
        response.delete_cookie(access_cookie_name, path="/")
        response.delete_cookie(refresh_cookie_name, path="/")

    @staticmethod
    def get_customer_profile(user):
        """
        Get customer profile information.
        Can be extended to include customer-specific data.
        """
        if user.role != User.Role.CUSTOMER:
            return None

        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "date_joined": user.date_joined,
            "is_active": user.is_active,
            # Add customer-specific fields here
        }

    @staticmethod
    def update_customer_profile(user, **kwargs):
        """
        Update customer profile information.
        """
        if user.role != User.Role.CUSTOMER:
            raise ValueError("Only customer profiles can be updated through this method")

        allowed_fields = ["first_name", "last_name", "username"]
        
        for field, value in kwargs.items():
            if field in allowed_fields:
                setattr(user, field, value)

        user.save(update_fields=list(kwargs.keys()))
        return user

    @staticmethod
    def change_customer_password(user, old_password, new_password):
        """
        Change customer password with validation.
        """
        if user.role != User.Role.CUSTOMER:
            raise ValueError("Only customer passwords can be changed through this method")

        # Verify old password
        if not user.check_password(old_password):
            raise ValueError("Current password is incorrect")

        # Validate new password
        try:
            validate_password(new_password, user)
        except ValidationError as e:
            raise ValueError({"new_password": e.messages})

        # Set new password
        user.set_password(new_password)
        user.save()
        
        return user 