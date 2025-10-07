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
        # Note: We still need to prevent duplicate accounts, but we'll use a generic message
        if Customer.objects.filter(email=email).exists():
            # Generic message that doesn't reveal if the account exists
            errors["email"] = ["Unable to create account with this email address."]

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
        Uses timing-consistent approach to prevent enumeration.
        """
        import time
        
        # Add consistent timing to prevent timing attacks
        start_time = time.time()
        customer = None
        
        try:
            customer = Customer.objects.get_by_email(email)
            
            # Check if customer is active and password is correct
            if customer.is_active and customer.check_password(password):
                # Update last login timestamp
                customer.update_last_login()
            else:
                customer = None
                
        except Customer.DoesNotExist:
            # Perform dummy password check to maintain consistent timing
            from django.contrib.auth.hashers import check_password
            check_password(password, 'dummy_hash_to_waste_time')
        
        # Ensure consistent response time (minimum 100ms to prevent timing attacks)
        elapsed = time.time() - start_time
        if elapsed < 0.1:
            time.sleep(0.1 - elapsed)
            
        return customer

    @staticmethod
    def generate_customer_tokens(customer):
        """
        Generate JWT tokens for customer authentication.
        Creates custom tokens with customer-specific claims including tenant.
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

        # CRITICAL: Add tenant claims for multi-tenancy
        refresh['tenant_id'] = str(customer.tenant.id)
        refresh['tenant_slug'] = customer.tenant.slug

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

    @staticmethod
    def request_password_reset(email):
        """
        Request a password reset token for a customer.
        Always returns success to prevent account enumeration.
        """
        from .models import CustomerPasswordResetToken
        from notifications.services import EmailService
        from django.core.cache import cache
        from django.utils import timezone
        
        # Rate limiting temporarily disabled for testing
        # cache_key = f"password_reset_requests:{email}"
        # requests_count = cache.get(cache_key, 0)
        # 
        # if requests_count >= 3:
        #     # Don't reveal rate limiting to prevent enumeration
        #     logger.warning("Password reset rate limit exceeded", extra={"email": email})
        #     return True  # Always return success
        #     
        # # Increment rate limit counter
        # cache.set(cache_key, requests_count + 1, 3600)  # 1 hour
        
        try:
            customer = Customer.objects.get_by_email(email)
            
            # Deactivate any existing valid tokens for security
            CustomerPasswordResetToken.objects.filter(
                customer=customer,
                used_at__isnull=True,
                expires_at__gt=timezone.now()
            ).update(used_at=timezone.now())

            # Create new token (tenant inherited from customer)
            token = CustomerPasswordResetToken.objects.create(
                customer=customer,
                tenant=customer.tenant
            )
            
            # Send password reset email
            email_service = EmailService()
            email_service.send_password_reset_email(customer, token.token)
            
            logger.info("Password reset requested", extra={"customer_id": str(customer.id)})
            
        except Customer.DoesNotExist:
            # Don't reveal that email doesn't exist
            logger.info("Password reset requested for non-existent email", extra={"email": email})
            pass
        
        return True  # Always return success to prevent enumeration

    @staticmethod
    def validate_reset_token(token):
        """
        Validate a password reset token.
        Returns the customer if valid, None if invalid.
        """
        from .models import CustomerPasswordResetToken
        
        try:
            reset_token = CustomerPasswordResetToken.objects.select_related('customer').get(
                token=token
            )
            
            if reset_token.is_valid:
                logger.info("Valid password reset token accessed", extra={
                    "customer_id": str(reset_token.customer.id)
                })
                return reset_token.customer
            else:
                logger.warning("Invalid password reset token accessed", extra={
                    "token": token[:8] + "...",
                    "expired": reset_token.is_expired,
                    "used": reset_token.is_used
                })
                return None
                
        except CustomerPasswordResetToken.DoesNotExist:
            logger.warning("Non-existent password reset token accessed", extra={
                "token": token[:8] + "..."
            })
            return None

    @staticmethod
    def reset_password(token, new_password):
        """
        Reset customer password using a valid token.
        Returns True if successful, raises ValueError with details if not.
        """
        from .models import CustomerPasswordResetToken
        
        try:
            reset_token = CustomerPasswordResetToken.objects.select_related('customer').get(
                token=token
            )
            
            if not reset_token.is_valid:
                # Generic error message to prevent token state enumeration
                raise ValueError("Invalid or expired password reset token. Please request a new one.")
            
            # Validate new password
            try:
                validate_password(new_password)
            except ValidationError as e:
                raise ValueError({"new_password": e.messages})
            
            # Reset password
            customer = reset_token.customer
            customer.set_password(new_password)
            customer.save(update_fields=['password', 'updated_at'])
            
            # Mark token as used
            reset_token.mark_as_used()
            
            logger.info("Password reset completed", extra={"customer_id": str(customer.id)})
            return True
            
        except CustomerPasswordResetToken.DoesNotExist:
            raise ValueError("Invalid or expired password reset token. Please request a new one.")

    @staticmethod
    def send_email_verification(customer):
        """
        Send email verification token to customer.
        """
        from .models import CustomerEmailVerificationToken  
        from notifications.services import EmailService
        from django.utils import timezone
        
        # Deactivate any existing valid tokens
        CustomerEmailVerificationToken.objects.filter(
            customer=customer,
            used_at__isnull=True,
            expires_at__gt=timezone.now()
        ).update(used_at=timezone.now())

        # Create new token (tenant inherited from customer)
        token = CustomerEmailVerificationToken.objects.create(
            customer=customer,
            tenant=customer.tenant
        )
        
        # Send verification email
        email_service = EmailService()
        email_service.send_email_verification(customer, token.token)
        
        logger.info("Email verification sent", extra={"customer_id": str(customer.id)})
        return True

    @staticmethod
    def verify_email_with_token(token):
        """
        Verify customer email using token.
        Returns True if successful, raises ValueError if not.
        """
        from .models import CustomerEmailVerificationToken
        
        try:
            verification_token = CustomerEmailVerificationToken.objects.select_related('customer').get(
                token=token
            )
            
            if not verification_token.is_valid:
                # Generic error message to prevent token state enumeration
                raise ValueError("Invalid or expired verification token. Please request a new one.")
            
            # Verify email
            customer = verification_token.customer
            customer.email_verified = True
            customer.save(update_fields=['email_verified', 'updated_at'])
            
            # Mark token as used
            verification_token.mark_as_used()
            
            logger.info("Email verified via token", extra={"customer_id": str(customer.id)})
            return True
            
        except CustomerEmailVerificationToken.DoesNotExist:
            raise ValueError("Invalid or expired verification token. Please request a new one.")