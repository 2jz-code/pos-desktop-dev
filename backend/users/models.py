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
import hashlib
import hmac


class UserManager(BaseUserManager):
    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError(_("The Email must be set"))
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)

        # Automatically set is_pos_staff for staff roles
        role = extra_fields.get("role", User.Role.CUSTOMER)
        if role in [
            User.Role.OWNER,
            User.Role.ADMIN,
            User.Role.MANAGER,
            User.Role.CASHIER,
        ]:
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
    phone_number = models.CharField(
        _("phone number"), max_length=20, blank=True, null=True
    )

    role = models.CharField(
        _("role"), max_length=50, choices=Role.choices, default=Role.CUSTOMER
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
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text=_("Designates whether this user should be treated as active."),
    )
    date_joined = models.DateTimeField(_("date joined"), default=timezone.now)

    legacy_id = models.IntegerField(unique=True, null=True, blank=True, db_index=True, help_text="The user ID from the old system.")

    # API key for sync service authentication (DEPRECATED - use api_key_hash)
    api_key = models.CharField(
        _("API key"),
        max_length=64,
        blank=True,
        null=True,
        unique=True,
        help_text=_("DEPRECATED: API key for programmatic access (use api_key_hash)"),
    )
    
    # Hashed API key for secure storage
    api_key_hash = models.CharField(
        _("API key hash"),
        max_length=64,
        blank=True,
        null=True,
        unique=True,
        help_text=_("SHA-256 hash of API key for secure storage"),
        db_index=True,
    )

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        indexes = [
            models.Index(fields=['role', 'is_pos_staff']),  # For POS staff filtering
            models.Index(fields=['is_active', 'role']),     # For active user queries
            models.Index(fields=['email']),  # For email lookups (if not already indexed)
            models.Index(fields=['username']),
            models.Index(fields=['phone_number']),
            models.Index(fields=['first_name', 'last_name']),
            models.Index(fields=['api_key']),  # Keep for migration compatibility
            models.Index(fields=['api_key_hash']),  # New secure index
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

    @staticmethod
    def _hash_api_key(raw_key):
        """
        Hash an API key using SHA-256.
        Uses constant-time comparison safe hashing.
        """
        if not raw_key:
            return None
        return hashlib.sha256(raw_key.encode('utf-8')).hexdigest()

    def generate_api_key(self):
        """
        Generate a new secure API key for this user.
        Returns the raw key (this is the only time it's available in plaintext).
        Stores only the hash in the database.
        """
        # Generate a cryptographically secure API key
        raw_key = secrets.token_urlsafe(48)  # 256-bit entropy
        
        # Hash the key for storage
        self.api_key_hash = self._hash_api_key(raw_key)
        
        # Clear old plaintext key (deprecated field)
        self.api_key = None
        
        self.save(update_fields=["api_key_hash", "api_key"])
        return raw_key

    def verify_api_key(self, raw_key):
        """
        Verify a raw API key against the stored hash.
        Uses constant-time comparison to prevent timing attacks.
        """
        if not raw_key or not self.api_key_hash:
            return False
        
        provided_hash = self._hash_api_key(raw_key)
        return hmac.compare_digest(self.api_key_hash, provided_hash)

    def has_api_key(self):
        """Check if user has an API key set (either old or new format)"""
        return bool(self.api_key_hash or self.api_key)

    def revoke_api_key(self):
        """Revoke the current API key (both old and new formats)"""
        self.api_key = None
        self.api_key_hash = None
        self.save(update_fields=["api_key", "api_key_hash"])

    def migrate_api_key_to_hash(self):
        """
        Migrate existing plaintext API key to hashed format.
        This is a one-time migration method.
        """
        if self.api_key and not self.api_key_hash:
            self.api_key_hash = self._hash_api_key(self.api_key)
            # Keep the old key during transition period
            self.save(update_fields=["api_key_hash"])
