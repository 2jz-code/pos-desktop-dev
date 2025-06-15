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
