from django.contrib import admin
from django.contrib.admin.forms import AdminAuthenticationForm
from django.core.cache import cache
from django.utils.translation import gettext_lazy as _
from django import forms
from django.conf import settings


def _norm_identifier(value: str) -> str:
    return (value or "").strip().lower()


def _fail_key(identifier: str) -> str:
    return f"admin_login_fail:{identifier}"


def _lock_key(identifier: str) -> str:
    return f"admin_login_lock:{identifier}"


class LockingAdminAuthenticationForm(AdminAuthenticationForm):
    """
    Admin authentication form with account-based, time-boxed lockout.
    - Threshold failures within a window trigger a temporary lock.
    - Success clears counters and lock.
    """

    error_messages = {
        "invalid_login": _(
            "Please enter the correct credentials."
        ),
        "locked": _(
            "This account is temporarily locked due to too many failed attempts. Please try again later."
        ),
    }

    @property
    def _threshold(self) -> int:
        return getattr(settings, "ADMIN_LOCKOUT_THRESHOLD", 5)

    @property
    def _window_seconds(self) -> int:
        return int(getattr(settings, "ADMIN_LOCKOUT_WINDOW", 15 * 60))

    @property
    def _lock_seconds(self) -> int:
        return int(getattr(settings, "ADMIN_LOCKOUT_DURATION", 15 * 60))

    def clean(self):
        # The posted field name is always 'username' in the admin form
        # even if the underlying auth uses email for USERNAME_FIELD.
        username = _norm_identifier(self.data.get("username"))

        # Check lock
        if cache.get(_lock_key(username)):
            raise forms.ValidationError(self.error_messages["locked"], code="locked")

        # Let the base class authenticate
        try:
            result = super().clean()
        except forms.ValidationError as e:
            # Authentication failed: increment failures and maybe lock
            if username:
                key = _fail_key(username)
                current = (cache.get(key) or 0) + 1
                # Set/increment with window TTL
                cache.set(key, current, timeout=self._window_seconds)
                if current >= self._threshold:
                    cache.set(_lock_key(username), True, timeout=self._lock_seconds)
            raise

        # Authentication succeeded: clear counters
        if username:
            cache.delete_many([_fail_key(username), _lock_key(username)])
        return result


class LockingAdminSite(admin.AdminSite):
    login_form = LockingAdminAuthenticationForm


# Instantiate a site that mirrors current registry so existing admin registrations work
locking_admin_site = LockingAdminSite(name="locking_admin")
locking_admin_site._registry.update(admin.site._registry)
