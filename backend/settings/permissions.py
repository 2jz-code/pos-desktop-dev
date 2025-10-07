from rest_framework import permissions
from users.models import User


class SettingsReadOnlyOrOwnerAdmin(permissions.BasePermission):
    """
    Custom permission to allow:
    - Read access for all users (including unauthenticated/guests)
    - Write access only for authenticated users with Owner or Admin role
    """

    def has_permission(self, request, view):
        # Allow read access for all users (including unauthenticated)
        if request.method in permissions.SAFE_METHODS:
            return True

        # For write operations, user must be authenticated
        if not request.user.is_authenticated:
            return False

        # Only owners and admins can write
        return request.user.role in [User.Role.OWNER, User.Role.ADMIN] or request.user.is_superuser


class FinancialSettingsReadAccess(permissions.BasePermission):
    """
    Custom permission specifically for financial settings (tax rate, surcharge percentage).
    Allows read access for all users including guests, but write access only for owner/admin.
    """

    def has_permission(self, request, view):
        # Allow read access for all users (including unauthenticated)
        if request.method in permissions.SAFE_METHODS:
            return True

        # For write operations, user must be authenticated and be owner/admin
        if not request.user.is_authenticated:
            return False

        return request.user.role in [User.Role.OWNER, User.Role.ADMIN] or request.user.is_superuser
