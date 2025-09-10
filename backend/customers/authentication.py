"""
Customer authentication classes for the separate Customer model.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.conf import settings
from .models import Customer


class CustomerCookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication for customer endpoints.
    Works with the separate Customer model instead of User model.
    Looks for customer-specific cookie names (access_token_customer, refresh_token_customer).
    """
    
    def authenticate(self, request):
        # Look for customer-specific cookie name
        customer_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE']}_customer"
        access_token = request.COOKIES.get(customer_cookie_name)
        
        if access_token is None:
            return None

        try:
            validated_token = self.get_validated_token(access_token)
            customer = self.get_customer(validated_token)
            return customer, validated_token
        except TokenError:
            return None
    
    def get_customer(self, validated_token):
        """
        Get customer from validated token.
        Expects customer_id in token payload.
        """
        try:
            customer_id = validated_token.get('customer_id')
            if not customer_id:
                raise InvalidToken('Token does not contain customer_id')
            
            customer = Customer.objects.get(id=customer_id, is_active=True)
            
            # Add DRF compatibility properties to customer object
            customer.is_authenticated = True
            customer.is_anonymous = False
            
            return customer
            
        except Customer.DoesNotExist:
            raise InvalidToken('Customer not found or inactive')
        except Exception:
            raise InvalidToken('Invalid customer token')


class CustomerJWTAuthenticationMixin:
    """
    Mixin to add customer-specific authentication methods to views.
    Use this instead of checking user.role since we're using Customer model.
    """
    
    def get_customer(self):
        """Get the authenticated customer from request."""
        if hasattr(self.request, 'user') and isinstance(self.request.user, Customer):
            return self.request.user
        return None
    
    def ensure_customer_authenticated(self):
        """Ensure request has authenticated customer."""
        customer = self.get_customer()
        if not customer:
            from rest_framework.exceptions import AuthenticationFailed
            raise AuthenticationFailed("Customer authentication required")
        return customer