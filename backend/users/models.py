from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.hashers import make_password, check_password
import secrets


class UserManager(BaseUserManager):
    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError(_("The Email must be set"))
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
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


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        OWNER = "OWNER", _("Owner")
        ADMIN = "ADMIN", _("Admin")
        MANAGER = "MANAGER", _("Manager")
        CASHIER = "CASHIER", _("Cashier")
        CUSTOMER = "CUSTOMER", _("Customer")

    email = models.EmailField(_("email address"), unique=True)
    username = models.CharField(
        _("username"),
        max_length=150,
        unique=True,
        blank=True,
        null=True,
        help_text=_("A unique username for POS login. Can be blank for customers."),
    )
    first_name = models.CharField(_("first name"), max_length=150, blank=True)
    last_name = models.CharField(_("last name"), max_length=150, blank=True)

    role = models.CharField(
        _("role"), max_length=50, choices=Role.choices, default=Role.CUSTOMER
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
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text=_("Designates whether this user should be treated as active."),
    )
    date_joined = models.DateTimeField(_("date joined"), default=timezone.now)

    # API key for sync service authentication
    api_key = models.CharField(
        _("API key"),
        max_length=64,
        blank=True,
        null=True,
        unique=True,
        help_text=_("API key for programmatic access (e.g., sync service)"),
    )

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email

    def set_pin(self, raw_pin):
        self.pin = make_password(str(raw_pin)) if raw_pin else None
        self.save(update_fields=["pin"])

    def check_pin(self, raw_pin):
        if not self.pin or not raw_pin:
            return False
        return check_password(str(raw_pin), self.pin)

    def generate_api_key(self):
        """Generate a new API key for this user"""
        self.api_key = secrets.token_urlsafe(48)
        self.save(update_fields=["api_key"])
        return self.api_key

    def revoke_api_key(self):
        """Revoke the current API key"""
        self.api_key = None
        self.save(update_fields=["api_key"])
