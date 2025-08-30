from rest_framework import permissions
from .models import User


class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj == request.user and request.user.role == User.Role.OWNER


class IsAdminOrHigher(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.role in [User.Role.OWNER, User.Role.ADMIN]


class IsManagerOrHigher(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.role in [
            User.Role.OWNER,
            User.Role.ADMIN,
            User.Role.MANAGER,
        ]


class CanEditUserDetails(permissions.BasePermission):
    """
    Custom permission to allow users to edit their own profile,
    and to allow higher-level users to edit lower-level users.
    """

    def has_object_permission(self, request, view, obj):
        # Users can always edit themselves, unless they are a customer.
        if request.user == obj and obj.role != User.Role.CUSTOMER:
            return True

        # Owners can edit anyone.
        if request.user.role == User.Role.OWNER:
            return True

        # Admins can edit managers, cashiers, and customers.
        if request.user.role == User.Role.ADMIN and obj.role in [
            User.Role.MANAGER,
            User.Role.CASHIER,
            User.Role.CUSTOMER,
        ]:
            return True

        # Managers can only edit cashiers.
        if request.user.role == User.Role.MANAGER and obj.role == User.Role.CASHIER:
            return True

        return False


class ReadOnlyForCashiers(permissions.BasePermission):
    """
    Custom permission to allow all authenticated users to read,
    but only managers and above to create/update/delete.
    """

    def has_permission(self, request, view):
        # All authenticated users can read
        if request.method in permissions.SAFE_METHODS:
            return request.user.is_authenticated and request.user.is_pos_staff
        
        # Only managers and above can create/update/delete
        return request.user.role in [
            User.Role.OWNER,
            User.Role.ADMIN,
            User.Role.MANAGER,
        ]


class StockReasonOwnerPermission(permissions.BasePermission):
    """
    Custom permission for stock action reason management:
    - Read access for all authenticated POS staff
    - Create/Update/Delete access only for owners
    - System reasons can never be deleted
    """

    def has_permission(self, request, view):
        # All operations require authentication and POS staff status
        if not (request.user.is_authenticated and request.user.is_pos_staff):
            return False

        # Read access for all authenticated POS staff
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write operations only for owners
        return request.user.role == User.Role.OWNER

    def has_object_permission(self, request, view, obj):
        # All operations require authentication and POS staff status
        if not (request.user.is_authenticated and request.user.is_pos_staff):
            return False

        # Read access for all authenticated POS staff
        if request.method in permissions.SAFE_METHODS:
            return True

        # Only owners can modify reasons
        if request.user.role != User.Role.OWNER:
            return False

        # System reasons cannot be deleted
        if request.method == 'DELETE' and obj.is_system_reason:
            return False

        return True
