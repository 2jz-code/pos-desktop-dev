"""
Customer services.
"""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from core_backend.utils.pii import get_pii_safe_logger

from .models import Customer

logger = get_pii_safe_logger(__name__)


class CustomerAuthService:
    """
    Service for handling customer authentication and registration.
    Separates customer-specific logic from POS staff authentication.
    """

    @staticmethod
    def register_customer(
        email, password, first_name="", last_name="", 
        phone_number="", is_rewards_opted_in=False, **extra_fields
    ):
        """
        Register a new customer account with comprehensive validation.
        """
        # Enhanced validation with detailed error handling
        errors = {}

        # Validate password strength
        try:
            validate_password(password)
        except ValidationError as e:
            errors["password"] = e.messages

        # Check if email already exists
        if Customer.objects.filter(email=email).exists():
            errors["email"] = ["A customer with this email already exists."]

        # Validate email format (basic check)
        if email and "@" not in email:
            errors["email"] = ["Enter a valid email address."]

        # Validate required fields
        if not email:
            errors["email"] = ["Email is required."]

        if errors:
            logger.warning("Customer registration failed", extra={"errors": errors, "email": email})
            raise ValueError(errors)

        # Create customer
        customer = Customer.objects.create_customer(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            phone_number=phone_number,
            **extra_fields
        )

        # Store rewards opt-in preference (can be extended later)
        if is_rewards_opted_in:
            # TODO: Create customer rewards profile when rewards app is added
            pass

        logger.info("Customer registered successfully", extra={"customer_id": str(customer.id)})
        return customer

    @staticmethod
    def register_customer_with_tokens(user_data: dict) -> tuple:
        """
        Register customer and immediately generate tokens.
        Used by registration endpoints.
        """
        customer = CustomerAuthService.register_customer(**user_data)
        tokens = CustomerAuthService.generate_customer_tokens(customer)
        return customer, tokens

    @staticmethod
    def login_customer_with_tokens(email_or_username: str, password: str) -> tuple:
        """
        Authenticate customer and generate tokens.
        Used by login endpoints.
        """
        customer = CustomerAuthService.authenticate_customer(email_or_username, password)
        if not customer:
            logger.warning("Customer login failed", extra={"email": email_or_username})
            raise ValueError("Invalid credentials")
        
        tokens = CustomerAuthService.generate_customer_tokens(customer)
        logger.info("Customer logged in successfully", extra={"customer_id": str(customer.id)})
        return customer, tokens

    @staticmethod
    def authenticate_customer(email, password):
        """
        Authenticate a customer using email and password.
        """
        try:
            customer = Customer.objects.get_by_email(email)
        except Customer.DoesNotExist:
            return None

        # Check if customer is active
        if not customer.is_active:
            return None

        # Verify password
        if customer.check_password(password):
            # Update last login
            customer.update_last_login()
            return customer

        return None

    @staticmethod
    def generate_customer_tokens(customer):
        """
        Generate JWT tokens for customer authentication.
        Creates custom tokens with customer-specific claims.
        """
        if not isinstance(customer, Customer):
            raise ValueError("Invalid customer object")

        # Create custom refresh token manually
        refresh = RefreshToken()
        
        # Add customer-specific claims
        refresh['user_type'] = 'customer'
        refresh['customer_id'] = str(customer.id)
        refresh['email'] = customer.email
        refresh['is_active'] = customer.is_active
        
        # Generate access token from refresh
        access = refresh.access_token
        
        return {
            "refresh": str(refresh),
            "access": str(access),
        }

    @staticmethod
    def set_customer_auth_cookies(response, access_token, refresh_token):
        """
        Set authentication cookies for customer session.
        
        DEPRECATED: Use core_backend.auth.cookies.AuthCookieService.set_customer_auth_cookies instead
        """
        from core_backend.auth.cookies import AuthCookieService
        return AuthCookieService.set_customer_auth_cookies(response, access_token, refresh_token)

    @staticmethod
    def clear_customer_auth_cookies(response):
        """
        Clear customer authentication cookies.
        
        DEPRECATED: Use core_backend.auth.cookies.AuthCookieService.clear_customer_auth_cookies instead
        """
        from core_backend.auth.cookies import AuthCookieService
        return AuthCookieService.clear_customer_auth_cookies(response)

    @staticmethod
    def get_customer_profile(customer):
        """
        Get customer profile information.
        Returns safe customer data for API responses.
        """
        if not isinstance(customer, Customer):
            return None

        return {
            "id": str(customer.id),
            "email": customer.email,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "phone_number": customer.phone_number,
            "date_joined": customer.date_joined,
            "is_active": customer.is_active,
            "email_verified": customer.email_verified,
            "phone_verified": customer.phone_verified,
            "preferred_contact_method": customer.preferred_contact_method,
            "marketing_opt_in": customer.marketing_opt_in,
            "newsletter_subscribed": customer.newsletter_subscribed,
        }

    @staticmethod
    def update_customer_profile(customer, **kwargs):
        """
        Update customer profile information.
        """
        if not isinstance(customer, Customer):
            raise ValueError("Invalid customer object")

        allowed_fields = [
            "first_name", "last_name", "phone_number", 
            "preferred_contact_method", "marketing_opt_in", 
            "newsletter_subscribed", "birth_date"
        ]
        
        updated_fields = []
        for field, value in kwargs.items():
            if field in allowed_fields:
                setattr(customer, field, value)
                updated_fields.append(field)

        if updated_fields:
            customer.save(update_fields=updated_fields + ['updated_at'])
            logger.info("Customer profile updated", extra={
                "customer_id": str(customer.id),
                "updated_fields": updated_fields
            })
        
        return customer

    @staticmethod
    def change_customer_password(customer, old_password, new_password):
        """
        Change customer password with validation.
        """
        if not isinstance(customer, Customer):
            raise ValueError("Invalid customer object")

        # Verify old password
        if not customer.check_password(old_password):
            raise ValueError("Current password is incorrect")

        # Validate new password
        try:
            validate_password(new_password)
        except ValidationError as e:
            raise ValueError({"new_password": e.messages})

        # Set new password
        customer.set_password(new_password)
        customer.save(update_fields=['password', 'updated_at'])
        
        logger.info("Customer password changed", extra={"customer_id": str(customer.id)})
        return customer

    @staticmethod
    def deactivate_customer(customer):
        """
        Deactivate a customer account.
        """
        if not isinstance(customer, Customer):
            raise ValueError("Invalid customer object")
        
        customer.is_active = False
        customer.save(update_fields=['is_active', 'updated_at'])
        
        logger.info("Customer account deactivated", extra={"customer_id": str(customer.id)})
        return customer

    @staticmethod
    def verify_customer_email(customer):
        """
        Mark customer email as verified.
        """
        if not isinstance(customer, Customer):
            raise ValueError("Invalid customer object")
        
        customer.email_verified = True
        customer.save(update_fields=['email_verified', 'updated_at'])
        
        logger.info("Customer email verified", extra={"customer_id": str(customer.id)})
        return customer

    @staticmethod
    def verify_customer_phone(customer):
        """
        Mark customer phone as verified.
        """
        if not isinstance(customer, Customer):
            raise ValueError("Invalid customer object")
        
        customer.phone_verified = True
        customer.save(update_fields=['phone_verified', 'updated_at'])
        
        logger.info("Customer phone verified", extra={"customer_id": str(customer.id)})
        return customer