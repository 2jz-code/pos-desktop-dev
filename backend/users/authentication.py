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
    Authentication for the sync service using API keys.
    Used by the Electron app's sync service for programmatic API access.
    """

    def authenticate(self, request):
        api_key = request.META.get("HTTP_X_API_KEY")
        if not api_key:
            return None
        
        # Create cache key for rate limiting
        client_ip = self.get_client_ip(request)
        cache_key = f"api_auth_attempts:{client_ip}"
        
        # Check rate limiting (5 attempts per minute)
        attempts = cache.get(cache_key, 0)
        if attempts >= 5:
            raise AuthenticationFailed("Too many authentication attempts. Try again later.")
        
        # Hash the API key for lookup (we'll need to update storage later)
        api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        try:
            # For now, still use plain text lookup (we'll migrate in Phase 4)
            user = User.objects.select_related().get(api_key=api_key, is_active=True)
            
            # Reset rate limiting on successful auth
            cache.delete(cache_key)
            return (user, None)
            
        except User.DoesNotExist:
            # Increment failed attempts
            cache.set(cache_key, attempts + 1, timeout=60)  # 1 minute timeout
            raise AuthenticationFailed("Invalid API key")

    def get_client_ip(self, request):
        """Get client IP address"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip