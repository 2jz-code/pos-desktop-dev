from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from core_backend.cache_utils import cache_session_data, cache_static_data


class UserService:
    @staticmethod
    @cache_session_data(timeout=900)  # 15 minutes - balance security vs performance
    def get_pos_staff_users():
        """Cache POS staff users for authentication lookups"""
        return list(User.objects.filter(
            role__in=[
                User.Role.CASHIER,
                User.Role.MANAGER,
                User.Role.ADMIN,
                User.Role.OWNER,
            ],
            is_active=True
        ).select_related().values(
            'id', 'username', 'role', 'first_name', 'last_name', 
            'email', 'pin', 'password', 'is_active'
        ))
    
    @staticmethod
    @cache_static_data(timeout=3600*4)  # 4 hours - roles don't change often
    def get_user_permissions_by_role():
        """Cache role-based permissions mapping"""
        return {
            User.Role.CASHIER: [
                'orders.add', 'orders.view', 'payments.add', 'payments.view'
            ],
            User.Role.MANAGER: [
                'orders.add', 'orders.view', 'orders.change', 'orders.delete',
                'payments.add', 'payments.view', 'reports.view',
                'inventory.view', 'products.view'
            ],
            User.Role.ADMIN: ['*'],  # All permissions
            User.Role.OWNER: ['*']   # All permissions
        }
    
    @staticmethod
    def authenticate_pos_user(username: str, pin: str) -> User | None:
        """Enhanced authentication using cached staff data"""
        try:
            # First try to get from cache
            cached_staff = UserService.get_pos_staff_users()
            
            # Find user in cached data
            cached_user_data = None
            for user_data in cached_staff:
                if user_data['username'].lower() == username.lower():
                    cached_user_data = user_data
                    break
            
            if not cached_user_data:
                return None
            
            # Get the full user object for PIN verification
            user = User.objects.get(id=cached_user_data['id'])
            if user.check_pin(pin) and user.is_active:
                return user
                
        except (User.DoesNotExist, KeyError):
            # Fallback to direct database query if cache fails
            try:
                user = User.objects.get(
                    username__iexact=username,
                    role__in=[
                        User.Role.CASHIER,
                        User.Role.MANAGER,
                        User.Role.ADMIN,
                        User.Role.OWNER,
                    ],
                    is_active=True
                )
                if user.check_pin(pin):
                    return user
            except User.DoesNotExist:
                return None
        return None

    @staticmethod
    def generate_tokens_for_user(user: User) -> dict:
        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

    @staticmethod
    def set_auth_cookies(response, access_token, refresh_token):
        """
        Set authentication cookies for staff/admin users.
        """
        # Use settings from environment/settings.py instead of hardcoded values
        is_secure = getattr(settings, 'SESSION_COOKIE_SECURE', not settings.DEBUG)
        samesite_policy = getattr(settings, 'SESSION_COOKIE_SAMESITE', 'Lax')

        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value=access_token,
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            domain=None,  # Allow cookies to be sent from any origin
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            value=refresh_token,
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            domain=None,  # Allow cookies to be sent from any origin
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
