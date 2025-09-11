from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        # Try admin-specific cookie name first, then base name
        admin_name = getattr(settings, 'SIMPLE_JWT_ADMIN', {}).get('AUTH_COOKIE')
        access_token = None
        if admin_name:
            access_token = request.COOKIES.get(admin_name)
        if not access_token:
            access_token = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE"])  # POS/base
        if not access_token:
            return None

        validated_token = self.get_validated_token(access_token)
        return self.get_user(validated_token), validated_token



