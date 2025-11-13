from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from core_backend.admin.mixins import TenantAdminMixin
from .models import User
from .forms import UserAdminChangeForm, UserAdminCreationForm
from django.core.cache import cache
from django.contrib import messages


def _norm_email(email: str) -> str:
    return (email or "").strip().lower()


@admin.action(description="Clear admin/web login locks for selected users")
def clear_login_locks(modeladmin, request, queryset):
    cleared = 0
    for user in queryset:
        email = _norm_email(getattr(user, "email", ""))
        if not email:
            continue
        keys = [
            f"admin_login_fail:{email}",
            f"admin_login_lock:{email}",
            f"web_login_fail:{email}",
            f"web_login_lock:{email}",
        ]
        cache.delete_many(keys)
        cleared += 1
    modeladmin.message_user(
        request,
        f"Cleared login locks for {cleared} user(s).",
        level=messages.SUCCESS,
    )


@admin.register(User)
class UserAdmin(TenantAdminMixin, BaseUserAdmin):
    form = UserAdminChangeForm
    add_form = UserAdminCreationForm

    list_display = (
        "email",
        "username",
        "first_name",
        "last_name",
        "get_tenant_name",
        "get_tenant_id",
        "role",
        "is_pos_staff",
        "is_staff",
        "is_active",
    )
    list_filter = (
        "tenant",
        "role",
        "is_pos_staff",
        "is_staff",
        "is_superuser",
        "is_active",
        "groups",
    )
    search_fields = ("email", "username", "first_name", "last_name", "tenant__name", "tenant__slug")
    ordering = ("email",)

    def get_queryset(self, request):
        """Show users from ALL tenants in Django admin"""
        return User.all_objects.select_related('tenant')

    def get_tenant_name(self, obj):
        """Display tenant name"""
        return obj.tenant.name if obj.tenant else "⚠️ NO TENANT"
    get_tenant_name.short_description = "Tenant"
    get_tenant_name.admin_order_field = "tenant__name"

    def get_tenant_id(self, obj):
        """Display tenant ID for verification"""
        if obj.tenant:
            return str(obj.tenant.id)[:8] + "..."  # Show first 8 chars of UUID
        return "NULL"
    get_tenant_id.short_description = "Tenant ID"

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal Info", {"fields": ("first_name", "last_name", "username")}),
        ("Tenant", {"fields": ("tenant",)}),
        (
            "Permissions & Role",
            {
                "fields": (
                    "role",
                    "is_pos_staff",
                    "pin",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "password",
                    "password2",
                    "tenant",
                    "role",
                    "is_pos_staff",
                    "username",
                    "pin",
                ),
            },
        ),
    )

    def get_readonly_fields(self, request, obj=None):
        """Make tenant readonly only when editing (not when creating)."""
        readonly_fields = list(super().get_readonly_fields(request, obj))

        # Remove tenant from readonly fields during creation (obj is None)
        if obj is None and 'tenant' in readonly_fields:
            readonly_fields.remove('tenant')

        return readonly_fields

    # PIN is managed via API, so we don't include it in the admin forms.

    actions = [clear_login_locks]
