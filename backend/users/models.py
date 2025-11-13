from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.hashers import make_password, check_password
from core_backend.utils.archiving import SoftDeleteMixin, SoftDeleteManager, SoftDeleteQuerySet
from tenant.managers import TenantAwareUserManager


class User(SoftDeleteMixin, AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        OWNER = "OWNER", _("Owner")
        ADMIN = "ADMIN", _("Admin")
        MANAGER = "MANAGER", _("Manager")
        CASHIER = "CASHIER", _("Cashier")

    # Multi-tenancy: Each user belongs to a tenant
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='users',
        help_text=_("The tenant this user belongs to")
    )

    # Email and username are unique per tenant, not globally
    email = models.EmailField(_("email address"))
    username = models.CharField(
        _("username"),
        max_length=150,
        blank=True,
        null=True,
        help_text=_("A unique username for POS login (unique per tenant)."),
    )
    first_name = models.CharField(_("first name"), max_length=150, blank=True)
    last_name = models.CharField(_("last name"), max_length=150, blank=True)
    phone_number = models.CharField(
        _("phone number"), max_length=20, blank=True, null=True
    )

    role = models.CharField(
        _("role"), max_length=50, choices=Role.choices, default=Role.CASHIER
    )

    # Quick fix: Flag to filter POS interface without major refactoring
    is_pos_staff = models.BooleanField(
        _("POS staff"),
        default=False,
        help_text=_("Designates whether this user appears in POS staff interface."),
        db_index=True,  # Add index for efficient POS filtering
    )

    pin = models.CharField(
        _("PIN"),
        max_length=128,
        blank=True,
        null=True,
        help_text=_("A hashed 4-6 digit PIN for POS login."),
    )

    is_staff = models.BooleanField(
        _("staff status"),
        default=False,
        help_text=_("Designates whether the user can log into this admin site."),
    )
    date_joined = models.DateTimeField(_("date joined"), default=timezone.now)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    legacy_id = models.IntegerField(unique=True, null=True, blank=True, db_index=True, help_text="The user ID from the old system.")

    # Managers: TenantAwareUserManager for tenant filtering + soft delete + auth operations
    objects = TenantAwareUserManager()  # Default manager: tenant-aware + auth methods
    all_objects = models.Manager()  # Bypass all filters (admin only)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [
            # Email must be unique per tenant
            models.UniqueConstraint(
                fields=['tenant', 'email'],
                name='unique_user_email_per_tenant'
            ),
            # Username must be unique per tenant (if provided)
            models.UniqueConstraint(
                fields=['tenant', 'username'],
                name='unique_user_username_per_tenant',
                condition=models.Q(username__isnull=False)
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'email']),  # Primary lookup pattern
            models.Index(fields=['tenant', 'role', 'is_pos_staff']),  # For POS staff filtering
            models.Index(fields=['tenant', 'is_active', 'role']),  # For active user queries
            models.Index(fields=['tenant', 'username']),
            models.Index(fields=['phone_number']),
            models.Index(fields=['first_name', 'last_name'])
        ]

    @classmethod
    def check(cls, **kwargs):
        """Override system checks to allow non-unique USERNAME_FIELD in multi-tenant setup."""
        errors = super().check(**kwargs)
        # Remove the auth.E003 error (USERNAME_FIELD must be unique)
        # We enforce uniqueness per tenant via database constraint instead
        errors = [e for e in errors if e.id != 'auth.E003']
        return errors

    def __str__(self):
        return self.email

    def set_pin(self, raw_pin):
        self.pin = make_password(str(raw_pin)) if raw_pin else None
        self.save(update_fields=["pin"])

    def check_pin(self, raw_pin):
        if not self.pin or not raw_pin:
            return False
        return check_password(str(raw_pin), self.pin)

