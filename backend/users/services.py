from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
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
    
    # ========== NEW METHODS FOR VIEW LOGIC CONSOLIDATION ==========
    
    @staticmethod
    def set_user_pin(user_id: int, pin: str, current_user: 'User') -> dict:
        """
        Extract PIN setting logic from SetPinView.
        Handles validation, permissions, and PIN updates.
        """
        # Input validation
        if not user_id:
            return {"success": False, "error": "User ID is required."}
        
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return {"success": False, "error": "User not found."}
        
        # Permission validation
        if not UserService.validate_pin_permissions(current_user, user):
            return {
                "success": False, 
                "error": "You do not have permission to perform this action."
            }
        
        # PIN format validation
        try:
            UserService.validate_pin_format(pin)
        except ValueError as e:
            return {"success": False, "error": str(e)}
        
        # Set the PIN using the model method
        user.set_pin(pin)
        user.save()
        
        return {
            "success": True,
            "message": "PIN updated successfully.",
            "user_id": user_id,
            "username": user.username
        }
    
    @staticmethod
    def validate_pin_permissions(current_user: 'User', target_user: 'User') -> bool:
        """
        Centralize PIN permission checking logic.
        Allow user to change their own PIN or manager+ to change others'.
        """
        return (
            current_user.pk == target_user.pk or
            current_user.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
        )
    
    @staticmethod
    def validate_pin_format(pin: str) -> None:
        """
        Centralize PIN format validation rules.
        Can be extended with more complex validation rules.
        """
        if not pin:
            raise ValueError("PIN is required.")
        
        if len(pin) < 4:
            raise ValueError("PIN must be at least 4 characters long.")
        
        if len(pin) > 8:
            raise ValueError("PIN must be no more than 8 characters long.")
        
        # Additional validation rules can be added here
        # e.g., complexity requirements, no sequential numbers, etc.
    
    @staticmethod
    def get_filtered_users(filters: dict) -> 'QuerySet':
        """
        Extract user filtering logic from UserListView.
        Handles delta sync and POS staff filtering.
        """
        from django.utils.dateparse import parse_datetime
        
        queryset = User.objects.all().order_by("email")
        
        # Filter to only show POS staff users (not customers)
        queryset = queryset.filter(is_pos_staff=True)
        
        # Delta sync filtering
        modified_since = filters.get("modified_since")
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    queryset = queryset.filter(updated_at__gte=modified_since_dt)
            except (ValueError, TypeError):
                # If parsing fails, ignore the parameter and continue
                pass
        
        return queryset
    
    @staticmethod
    def update_user_profile(user_id: int, profile_data: dict, current_user: 'User') -> dict:
        """
        Centralize user profile update logic with permission checking.
        """
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return {"success": False, "error": "User not found."}
        
        # Basic permission check (can be extended)
        if not (current_user.pk == user.pk or 
                current_user.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]):
            return {
                "success": False,
                "error": "You do not have permission to update this user."
            }
        
        # Update allowed fields (customize as needed)
        allowed_fields = ['first_name', 'last_name', 'email', 'phone']
        updated_fields = []
        
        for field in allowed_fields:
            if field in profile_data:
                setattr(user, field, profile_data[field])
                updated_fields.append(field)
        
        if updated_fields:
            user.save(update_fields=updated_fields)
        
        return {
            "success": True,
            "message": "Profile updated successfully.",
            "updated_fields": updated_fields
        }
    
    @staticmethod
    def get_user_permissions_summary(user: 'User') -> dict:
        """
        Get comprehensive user permissions information.
        """
        role_permissions = UserService.get_user_permissions_by_role()
        
        return {
            "user_id": user.id,
            "username": user.username,
            "role": user.role,
            "permissions": role_permissions.get(user.role, []),
            "is_active": user.is_active,
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
        }
