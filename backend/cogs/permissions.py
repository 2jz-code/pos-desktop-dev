"""
Permissions for the COGS system.

COGS data (costs, margins) is sensitive business information.
Access is restricted to managers and above.
"""
from rest_framework import permissions

from users.models import User


class CanManageCOGS(permissions.BasePermission):
    """
    Permission class for COGS management.

    Allows access to:
    - Owners
    - Admins
    - Managers

    Denies access to:
    - Cashiers
    - Unauthenticated users
    """
    message = "You do not have permission to access COGS data."

    ALLOWED_ROLES = [
        User.Role.OWNER,
        User.Role.ADMIN,
        User.Role.MANAGER,
    ]

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        return request.user.role in self.ALLOWED_ROLES


class CanViewCOGS(permissions.BasePermission):
    """
    Permission class for viewing COGS data (read-only).

    Same as CanManageCOGS for now, but can be relaxed later
    if we want to allow certain roles read-only access.
    """
    message = "You do not have permission to view COGS data."

    ALLOWED_ROLES = [
        User.Role.OWNER,
        User.Role.ADMIN,
        User.Role.MANAGER,
    ]

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        return request.user.role in self.ALLOWED_ROLES


class CanCreateIngredients(permissions.BasePermission):
    """
    Permission class for creating new ingredient products.

    Allows owners, admins, and managers to create new ingredients.
    """
    message = "You do not have permission to create new ingredients."

    ALLOWED_ROLES = [
        User.Role.OWNER,
        User.Role.ADMIN,
        User.Role.MANAGER,
    ]

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        return request.user.role in self.ALLOWED_ROLES
