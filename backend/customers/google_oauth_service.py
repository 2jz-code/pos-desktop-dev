"""
Google OAuth service for customer authentication.
Integrates with the existing CustomerAuthService.
"""

import logging
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from core_backend.utils.pii import get_pii_safe_logger

from .models import Customer
from .services import CustomerAuthService

logger = get_pii_safe_logger(__name__)


class GoogleOAuthService:
    """
    Service for handling Google OAuth authentication for customers.
    Integrates with the existing customer authentication system.
    """
    
    @staticmethod
    def _get_google_client_id():
        """Get Google OAuth client ID from settings."""
        client_id = getattr(settings, 'GOOGLE_OAUTH2_CLIENT_ID', None)
        if not client_id:
            raise ImproperlyConfigured("GOOGLE_OAUTH2_CLIENT_ID must be set in environment variables")
        return client_id
    
    @staticmethod
    def verify_google_id_token(id_token_str):
        """
        Verify Google ID token and return user info.
        
        Args:
            id_token_str: The Google ID token string
            
        Returns:
            dict: User info from Google if valid, None if invalid
        """
        try:
            client_id = GoogleOAuthService._get_google_client_id()
            
            # Verify the token with Google
            idinfo = id_token.verify_oauth2_token(
                id_token_str,
                google_requests.Request(),
                client_id
            )
            
            # Check if the token is for our application
            if idinfo['aud'] != client_id:
                logger.warning("Google OAuth token has wrong audience", extra={
                    "expected_aud": client_id,
                    "received_aud": idinfo.get('aud')
                })
                return None
            
            # Log successful verification (without sensitive data)
            logger.info("Google ID token verified successfully", extra={
                "email": idinfo.get('email', 'unknown'),
                "email_verified": idinfo.get('email_verified', False)
            })
            
            return idinfo
            
        except ValueError as e:
            logger.warning("Google ID token verification failed", extra={
                "error": str(e)
            })
            return None
        except Exception as e:
            logger.error("Unexpected error during Google token verification", extra={
                "error": str(e),
                "error_type": type(e).__name__
            })
            return None
    
    @staticmethod
    def authenticate_or_create_customer(google_user_info):
        """
        Authenticate existing customer or create new one from Google user info.
        
        Args:
            google_user_info: User info from Google OAuth
            
        Returns:
            Customer: The authenticated or newly created customer
            bool: True if customer was created, False if existing customer
        """
        email = google_user_info.get('email')
        if not email:
            logger.error("Google user info missing email")
            raise ValueError("Google account must have a verified email address")
        
        # Check if email is verified by Google
        email_verified = google_user_info.get('email_verified', False)
        if not email_verified:
            logger.warning("Google account email not verified", extra={"email": email})
            raise ValueError("Google account email must be verified")
        
        try:
            # Try to find existing customer
            customer = Customer.objects.get_by_email(email)
            
            # Update customer info from Google if needed
            updated_fields = []
            
            # Update first name if not set or if Google provides more info
            google_first_name = google_user_info.get('given_name', '')
            if google_first_name and not customer.first_name:
                customer.first_name = google_first_name
                updated_fields.append('first_name')
            
            # Update last name if not set
            google_last_name = google_user_info.get('family_name', '')
            if google_last_name and not customer.last_name:
                customer.last_name = google_last_name
                updated_fields.append('last_name')
            
            # Mark email as verified since it's verified by Google
            if not customer.email_verified:
                customer.email_verified = True
                updated_fields.append('email_verified')
            
            # Update last login
            customer.update_last_login()
            updated_fields.append('last_login')
            
            if updated_fields:
                customer.save(update_fields=updated_fields + ['updated_at'])
                logger.info("Existing customer updated from Google OAuth", extra={
                    "customer_id": str(customer.id),
                    "updated_fields": updated_fields
                })
            
            logger.info("Existing customer authenticated via Google OAuth", extra={
                "customer_id": str(customer.id)
            })
            
            return customer, False  # Existing customer
            
        except Customer.DoesNotExist:
            # Create new customer
            customer_data = {
                'email': email,
                'first_name': google_user_info.get('given_name', ''),
                'last_name': google_user_info.get('family_name', ''),
                'email_verified': True,  # Already verified by Google
                'password': None,  # OAuth users don't need a password initially
            }
            
            # Create customer using the existing service
            # Note: We need to handle the password requirement
            try:
                # Generate a random password for OAuth users
                import secrets
                import string
                random_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
                customer_data['password'] = random_password
                
                customer = CustomerAuthService.register_customer(**customer_data)
                
                logger.info("New customer created via Google OAuth", extra={
                    "customer_id": str(customer.id),
                    "email": email
                })
                
                return customer, True  # New customer created
                
            except ValueError as e:
                logger.error("Failed to create customer via Google OAuth", extra={
                    "error": str(e),
                    "email": email
                })
                raise ValueError("Unable to create customer account")
    
    @staticmethod
    def google_oauth_login(id_token_str):
        """
        Complete Google OAuth login flow.
        
        Args:
            id_token_str: Google ID token string
            
        Returns:
            tuple: (customer, tokens, is_new_customer)
        """
        # Verify Google token
        google_user_info = GoogleOAuthService.verify_google_id_token(id_token_str)
        if not google_user_info:
            raise ValueError("Invalid Google token")
        
        # Authenticate or create customer
        customer, is_new_customer = GoogleOAuthService.authenticate_or_create_customer(google_user_info)
        
        if not customer.is_active:
            logger.warning("Inactive customer attempted Google OAuth login", extra={
                "customer_id": str(customer.id)
            })
            raise ValueError("Customer account is inactive")
        
        # Generate JWT tokens using existing service
        tokens = CustomerAuthService.generate_customer_tokens(customer)
        
        logger.info("Google OAuth login completed", extra={
            "customer_id": str(customer.id),
            "is_new_customer": is_new_customer
        })
        
        return customer, tokens, is_new_customer
    
    @staticmethod
    def link_google_account(customer, id_token_str):
        """
        Link a Google account to an existing customer account.
        This can be used for customers who signed up with email/password first.
        
        Args:
            customer: Existing customer instance
            id_token_str: Google ID token string
            
        Returns:
            bool: True if linking successful
        """
        # Verify Google token
        google_user_info = GoogleOAuthService.verify_google_id_token(id_token_str)
        if not google_user_info:
            raise ValueError("Invalid Google token")
        
        google_email = google_user_info.get('email')
        if not google_email:
            raise ValueError("Google account must have a verified email address")
        
        # Check if Google email matches customer email
        if google_email.lower() != customer.email.lower():
            logger.warning("Google account email mismatch during linking", extra={
                "customer_id": str(customer.id),
                "customer_email": customer.email,
                "google_email": google_email
            })
            raise ValueError("Google account email must match your account email")
        
        # Check if another customer is already using this Google account
        if Customer.objects.filter(email=google_email).exclude(id=customer.id).exists():
            raise ValueError("This Google account is already linked to another customer account")
        
        # Update customer with Google info and mark email as verified
        updated_fields = []
        
        # Update names if not set
        google_first_name = google_user_info.get('given_name', '')
        if google_first_name and not customer.first_name:
            customer.first_name = google_first_name
            updated_fields.append('first_name')
        
        google_last_name = google_user_info.get('family_name', '')
        if google_last_name and not customer.last_name:
            customer.last_name = google_last_name
            updated_fields.append('last_name')
        
        # Mark email as verified
        if not customer.email_verified:
            customer.email_verified = True
            updated_fields.append('email_verified')
        
        if updated_fields:
            customer.save(update_fields=updated_fields + ['updated_at'])
        
        logger.info("Google account linked to customer", extra={
            "customer_id": str(customer.id),
            "updated_fields": updated_fields
        })
        
        return True