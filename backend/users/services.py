from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from .models import User
from core_backend.infrastructure.cache_utils import cache_session_data, cache_static_data


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
                if user_data['username'] and user_data['username'].lower() == username.lower():
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
    def set_auth_cookies(response, access_token, refresh_token, cookie_path="/api"):
        """
        Set authentication cookies for staff/admin users.
        Uses /api path by default to separate from customer cookies.
        """
        # Use settings from environment/settings.py instead of hardcoded values
        is_secure = getattr(settings, 'SESSION_COOKIE_SECURE', not settings.DEBUG)
        samesite_policy = getattr(settings, 'SESSION_COOKIE_SAMESITE', 'Lax')

        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value=access_token,
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            domain=None,  # Allow cookies to be sent from any origin
            path=cookie_path,  # Use specific path to avoid conflicts with customer cookies
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            value=refresh_token,
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            domain=None,  # Allow cookies to be sent from any origin
            path=cookie_path,  # Use specific path to avoid conflicts with customer cookies
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )

    @staticmethod
    def set_user_pin(user_id: int, pin: str, current_user: User) -> dict:
        """
        Set a user's PIN with proper authorization and validation.
        Extracted from SetPinView business logic.
        """
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise ValueError("User not found.")

        # Authorization check: user can change their own PIN or manager+ can change others'
        if not (
            current_user.pk == user.pk
            or current_user.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
        ):
            raise PermissionError("You do not have permission to perform this action.")

        # Validate PIN (basic validation - can be enhanced)
        if not pin or len(pin) < 4:
            raise ValueError("PIN must be at least 4 characters long.")

        # Set the PIN
        user.set_pin(pin)
        user.save(update_fields=['pin'])

        return {"message": "PIN updated successfully.", "user_id": user.id}

    @staticmethod
    def get_filtered_users(filters=None, base_queryset=None):
        """
        Get filtered users based on query parameters.
        General method for user list filtering.
        """
        if base_queryset is not None:
            queryset = base_queryset
        else:
            queryset = User.objects.all().order_by("email")
        
        if not filters:
            return queryset
            
        # Handle modified_since for delta sync
        modified_since = filters.get('modified_since')
        if modified_since:
            try:
                from django.utils.dateparse import parse_datetime
                modified_since_dt = parse_datetime(modified_since[0] if isinstance(modified_since, list) else modified_since)
                if modified_since_dt:
                    queryset = queryset.filter(updated_at__gte=modified_since_dt)
            except (ValueError, TypeError):
                pass
        
        # Handle role filtering
        role = filters.get('role')
        if role:
            role_value = role[0] if isinstance(role, list) else role
            queryset = queryset.filter(role=role_value)
        
        # Handle is_pos_staff filtering
        is_pos_staff = filters.get('is_pos_staff')
        if is_pos_staff:
            is_pos_staff_value = is_pos_staff[0] if isinstance(is_pos_staff, list) else is_pos_staff
            if is_pos_staff_value.lower() in ['true', '1', 'yes']:
                queryset = queryset.filter(is_pos_staff=True)
            elif is_pos_staff_value.lower() in ['false', '0', 'no']:
                queryset = queryset.filter(is_pos_staff=False)
        
        return queryset

    @staticmethod
    def get_filtered_pos_users(modified_since=None):
        """
        Get POS staff users with optional delta sync filtering.
        Extracted from UserListView business logic.
        """
        queryset = User.objects.filter(is_pos_staff=True).order_by("email")

        # Support for delta sync - filter by modified_since parameter
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    # Use updated_at for more accurate delta synchronization
                    queryset = queryset.filter(updated_at__gte=modified_since_dt)
            except (ValueError, TypeError):
                # If parsing fails, ignore the parameter
                pass

        return queryset

    @staticmethod
    def clear_auth_cookies(response, cookie_path="/api"):
        """
        Clear authentication cookies for both admin and customer paths.
        Extracted from LogoutView business logic.
        """
        cookie_settings = {
            'samesite': getattr(settings, 'SESSION_COOKIE_SAMESITE', 'Lax'),
            'secure': getattr(settings, 'SESSION_COOKIE_SECURE', not settings.DEBUG),
            'httponly': True,
        }
        
        # Clear admin cookies (path /api)
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value="",
            max_age=0,
            path=cookie_path,
            domain=None,
            **cookie_settings
        )
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            value="",
            max_age=0,
            path=cookie_path,
            domain=None,
            **cookie_settings
        )
        
        # Also clear customer cookies if clearing admin path
        if cookie_path == "/api":
            response.set_cookie(
                key=f"{settings.SIMPLE_JWT['AUTH_COOKIE']}_customer",
                value="",
                max_age=0,
                path="/",  # Customer cookies use path="/" not "/api/auth/customer"
                domain=None,
                **cookie_settings
            )
            response.set_cookie(
                key=f"{settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']}_customer",
                value="",
                max_age=0,
                path="/",  # Customer cookies use path="/" not "/api/auth/customer"
                domain=None,
                **cookie_settings
            )

        return response

    @staticmethod
    def validate_pin_permissions(current_user: User, target_user: User) -> bool:
        """
        Check if current user has permission to modify target user's PIN.
        """
        return (
            current_user.pk == target_user.pk
            or current_user.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
        )


class UserProfileService:
    """
    Service for handling user profile operations.
    Separates profile management from authentication concerns.
    """

    @staticmethod
    def get_user_profile(user: User) -> dict:
        """
        Get comprehensive user profile information.
        """
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "is_active": user.is_active,
            "is_pos_staff": user.is_pos_staff,
            "date_joined": user.date_joined,
            "last_login": user.last_login,
        }

    @staticmethod
    def update_user_profile(user: User, **kwargs) -> User:
        """
        Update user profile with validation.
        """
        updatable_fields = ['first_name', 'last_name', 'email']
        update_fields = []

        for field, value in kwargs.items():
            if field in updatable_fields and value is not None:
                setattr(user, field, value)
                update_fields.append(field)

        if update_fields:
            user.save(update_fields=update_fields)

        return user

    @staticmethod
    def validate_user_permissions(current_user: User, target_user: User, action: str = 'view') -> bool:
        """
        Validate user permissions for various actions.
        """
        # Users can always view/edit their own profile
        if current_user.pk == target_user.pk:
            return True

        # Role-based permissions for other users
        if action in ['view', 'edit']:
            return current_user.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
        elif action == 'delete':
            return current_user.role in [User.Role.OWNER, User.Role.ADMIN]
        elif action == 'create':
            return current_user.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]

        return False

    @staticmethod
    def create_user_profile(creator: User, **user_data) -> User:
        """
        Create a new user with proper validation and authorization.
        """
        # Check if creator has permission to create users
        if not UserProfileService.validate_user_permissions(creator, creator, 'create'):
            raise PermissionError("You do not have permission to create users.")

        # Validate required fields
        required_fields = ['username', 'email', 'role']
        for field in required_fields:
            if field not in user_data or not user_data[field]:
                raise ValueError(f"{field} is required.")

        # Check if username/email already exists
        if User.objects.filter(username=user_data['username']).exists():
            raise ValueError("Username already exists.")
        if User.objects.filter(email=user_data['email']).exists():
            raise ValueError("Email already exists.")

        # Create the user
        user = User.objects.create_user(**user_data)
        return user
