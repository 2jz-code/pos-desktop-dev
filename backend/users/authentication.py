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

    def get_user(self, validated_token):
        """
        Override to use all_objects manager to bypass tenant filtering.

        CRITICAL: JWT authentication happens BEFORE tenant middleware sets context.
        Must use User.all_objects to find user across all tenants.

        Security: This is safe because:
        - JWT contains specific user_id (e.g., user_id=24)
        - That ID maps to ONE specific user record (e.g., User(id=24, tenant=jimmy's-pizza))
        - The loaded user.tenant is then used by middleware to set tenant context
        - All subsequent queries are scoped to that tenant

        Even if john@example.com exists in multiple tenants:
        - Jimmy's Pizza: User(id=24, tenant=A)
        - Maria's Cafe: User(id=25, tenant=B)

        The JWT for Jimmy's Pizza contains user_id=24, which ALWAYS loads the
        Jimmy's Pizza user record, never Maria's Cafe.
        """
        try:
            user_id = validated_token[settings.SIMPLE_JWT.get('USER_ID_CLAIM', 'user_id')]
        except KeyError:
            from rest_framework_simplejwt.exceptions import InvalidToken
            raise InvalidToken('Token contained no recognizable user identification')

        try:
            # Use all_objects to bypass tenant filtering during authentication
            # IMPORTANT: select_related('tenant') to eagerly load tenant for middleware
            user = User.all_objects.select_related('tenant').get(**{settings.SIMPLE_JWT.get('USER_ID_FIELD', 'id'): user_id})
        except User.DoesNotExist:
            from rest_framework_simplejwt.exceptions import AuthenticationFailed
            raise AuthenticationFailed('User not found', code='user_not_found')

        if not user.is_active:
            from rest_framework_simplejwt.exceptions import AuthenticationFailed
            raise AuthenticationFailed('User is inactive', code='user_inactive')

        return user



