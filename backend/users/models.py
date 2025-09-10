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


class UserManager(SoftDeleteManager, BaseUserManager):
    def get_queryset(self):
        """Return only active users by default."""
        return SoftDeleteQuerySet(self.model, using=self._db).active()

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError(_("The Email must be set"))
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)

        # Automatically set is_pos_staff for all staff roles (all roles are now staff)
        role = extra_fields.get("role", User.Role.CASHIER)
        user.is_pos_staff = True

        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", User.Role.OWNER)

        if extra_fields.get("is_staff") is not True:
            raise ValueError(_("Superuser must have is_staff=True."))
        if extra_fields.get("is_superuser") is not True:
            raise ValueError(_("Superuser must have is_superuser=True."))

        return self._create_user(email, password, **extra_fields)


class User(SoftDeleteMixin, AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        OWNER = "OWNER", _("Owner")
        ADMIN = "ADMIN", _("Admin")
        MANAGER = "MANAGER", _("Manager")
        CASHIER = "CASHIER", _("Cashier")

    email = models.EmailField(_("email address"), unique=True)
    username = models.CharField(
        _("username"),
        max_length=150,
        unique=True,
        blank=True,
        null=True,
        help_text=_("A unique username for POS login."),
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

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        indexes = [
            models.Index(fields=['role', 'is_pos_staff']),  # For POS staff filtering
            models.Index(fields=['is_active', 'role']),     # For active user queries (is_active from SoftDeleteMixin)
            models.Index(fields=['email']),  # For email lookups (if not already indexed)
            models.Index(fields=['username']),
            models.Index(fields=['phone_number']),
            models.Index(fields=['first_name', 'last_name'])
        ]

    def __str__(self):
        return self.email

    def set_pin(self, raw_pin):
        self.pin = make_password(str(raw_pin)) if raw_pin else None
        self.save(update_fields=["pin"])

    def check_pin(self, raw_pin):
        if not self.pin or not raw_pin:
            return False
        return check_password(str(raw_pin), self.pin)

