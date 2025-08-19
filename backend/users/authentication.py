from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings
from django.contrib.auth import get_user_model

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


