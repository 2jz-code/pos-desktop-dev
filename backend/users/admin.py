from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
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
class UserAdmin(BaseUserAdmin):
    form = UserAdminChangeForm
    add_form = UserAdminCreationForm

    list_display = (
        "email",
        "username",
        "first_name",
        "last_name",
        "role",
        "is_pos_staff",
        "is_staff",
        "is_active",
    )
    list_filter = (
        "role",
        "is_pos_staff",
        "is_staff",
        "is_superuser",
        "is_active",
        "groups",
    )
    search_fields = ("email", "username", "first_name", "last_name")
    ordering = ("email",)

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal Info", {"fields": ("first_name", "last_name", "username")}),
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
                    "role",
                    "is_pos_staff",
                    "username",
                    "pin",
                ),
            },
        ),
    )

    # PIN is managed via API, so we don't include it in the admin forms.

    actions = [clear_login_locks]
