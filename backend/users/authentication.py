from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.conf import settings
from django.contrib.auth import get_user_model
import secrets
from django.core.cache import cache
from django.contrib.auth.hashers import check_password
import hashlib
import time

User = get_user_model()


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        access_token = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE"])
        if access_token is None:
            return None

        validated_token = self.get_validated_token(access_token)
        return self.get_user(validated_token), validated_token


class CustomerCookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication for customer endpoints.
    Looks for customer-specific cookie names (access_token_customer, refresh_token_customer).
    """
    def authenticate(self, request):
        # Look for customer-specific cookie name
        customer_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE']}_customer"
        access_token = request.COOKIES.get(customer_cookie_name)
        
        if access_token is None:
            return None

        validated_token = self.get_validated_token(access_token)
        user = self.get_user(validated_token)
        
        # Ensure this is a customer user
        if user and hasattr(user, 'role') and user.role != User.Role.CUSTOMER:
            return None
            
        return user, validated_token


class APIKeyAuthentication(BaseAuthentication):
    """
    Secure API key authentication for sync service and programmatic access.
    Supports both hashed (new) and plaintext (legacy) API keys during transition.
    """

    def authenticate(self, request):
        api_key = request.META.get("HTTP_X_API_KEY")
        if not api_key:
            return None
        
        # Create cache key for rate limiting
        client_ip = self.get_client_ip(request)
        cache_key = f"api_auth_attempts:{client_ip}"
        
        # Check rate limiting (10 attempts per 5 minutes, more lenient during transition)
        attempts = cache.get(cache_key, 0)
        if attempts >= 10:
            raise AuthenticationFailed("Too many authentication attempts. Try again later.")
        
        # Log authentication attempt start time for timing attack prevention
        start_time = time.time()
        
        try:
            user = self._authenticate_with_api_key(api_key)
            if user:
                # Reset rate limiting on successful auth
                cache.delete(cache_key)
                
                # Ensure constant time for security (minimum 50ms)
                self._ensure_constant_time(start_time, min_time=0.05)
                return (user, None)
            else:
                raise User.DoesNotExist("Invalid API key")
                
        except User.DoesNotExist:
            # Ensure constant time even for failures
            self._ensure_constant_time(start_time, min_time=0.05)
            
            # Increment failed attempts
            cache.set(cache_key, attempts + 1, timeout=300)  # 5 minute timeout
            raise AuthenticationFailed("Invalid API key")

    def _authenticate_with_api_key(self, api_key):
        """
        Authenticate using API key with support for both hashed and plaintext keys.
        Prioritizes hashed keys for security.
        """
        # Step 1: Try to find user by hashed API key (new secure method)
        api_key_hash = hashlib.sha256(api_key.encode('utf-8')).hexdigest()
        
        try:
            user = User.objects.select_related().get(
                api_key_hash=api_key_hash, 
                is_active=True
            )
            # Found user with hashed key - most secure path
            return user
        except User.DoesNotExist:
            pass
        
        # Step 2: Fallback to plaintext lookup for backward compatibility
        # This will be removed in a future version
        try:
            user = User.objects.select_related().get(
                api_key=api_key, 
                is_active=True
            )
            # Found user with plaintext key - schedule for migration
            self._schedule_key_migration(user)
            return user
        except User.DoesNotExist:
            pass
        
        return None

    def _schedule_key_migration(self, user):
        """
        Schedule migration of plaintext API key to hashed format.
        This is done asynchronously to avoid blocking authentication.
        """
        # For now, just log that migration is needed
        # In production, this could trigger a background task
        cache_key = f"api_key_migration_needed:{user.id}"
        cache.set(cache_key, True, timeout=86400)  # 24 hours

    def _ensure_constant_time(self, start_time, min_time=0.05):
        """
        Ensure authentication takes at least min_time seconds to prevent timing attacks.
        """
        elapsed = time.time() - start_time
        if elapsed < min_time:
            time.sleep(min_time - elapsed)

    def get_client_ip(self, request):
        """Get client IP address with proper header handling"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # Take the first IP in the chain
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR', 'unknown')
        return ip