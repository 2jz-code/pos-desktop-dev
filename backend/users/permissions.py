from rest_framework import permissions
from django.conf import settings
from .models import User
import logging

logger = logging.getLogger(__name__)


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


class RequiresAntiCSRFHeader(permissions.BasePermission):
    """
    Minimal CSRF guard for cookie-based auth endpoints.
    For unsafe methods, require either X-CSRF-Token or X-Requested-With header.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        # Allow opt-out via settings if needed
        enabled = getattr(settings, 'ENABLE_CSRF_HEADER_CHECK', True)
        if not enabled:
            return True

        token = request.headers.get('X-CSRF-Token')
        xrw = request.headers.get('X-Requested-With')
        allowed = bool(token) or (xrw and xrw.lower() == 'xmlhttprequest')
        if not allowed:
            try:
                origin = request.headers.get('Origin')
                referer = request.headers.get('Referer')
                ip = request.META.get('REMOTE_ADDR')
                logger.warning(
                    "CSRF header guard denied request: method=%s path=%s origin=%s referer=%s ip=%s",
                    request.method,
                    request.get_full_path(),
                    origin,
                    referer,
                    ip,
                )
            except Exception:
                # Best-effort logging; do not break permission evaluation
                logger.warning("CSRF header guard denied request (logging details unavailable)")
        return allowed


class DoubleSubmitCSRFPremission(permissions.BasePermission):
    """
    Enforce double-submit CSRF on unsafe methods:
    - Client must send header X-CSRF-Token matching cookie csrf_token.
    - Gated by ENABLE_DOUBLE_SUBMIT_CSRF setting.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        if not getattr(settings, 'ENABLE_DOUBLE_SUBMIT_CSRF', False):
            return True

        header_token = request.headers.get('X-CSRF-Token') or request.headers.get('X-CSRFToken')
        cookie_token = request.COOKIES.get('csrf_token')

        ok = bool(header_token) and cookie_token and (header_token == cookie_token)
        if not ok:
            try:
                origin = request.headers.get('Origin')
                referer = request.headers.get('Referer')
                ip = request.META.get('REMOTE_ADDR')
                logger.warning(
                    "Double-submit CSRF failed: method=%s path=%s origin=%s referer=%s ip=%s",
                    request.method,
                    request.get_full_path(),
                    origin,
                    referer,
                    ip,
                )
            except Exception:
                logger.warning("Double-submit CSRF failed (logging details unavailable)")
        return ok
