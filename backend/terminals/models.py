from django.db import models
from django.utils import timezone
from tenant.managers import TenantManager
import uuid


class TerminalPairingCode(models.Model):
    """
    RFC 8628 Device Authorization Grant for terminal pairing.
    Stores time-limited codes for terminal activation.
    """

    # RFC 8628 standard fields
    device_code = models.CharField(
        max_length=128,
        unique=True,
        primary_key=True,
        help_text="Opaque device code (terminal uses this)"
    )
    user_code = models.CharField(
        max_length=9,  # Format: "ABCD-1234"
        unique=True,
        db_index=True,
        help_text="Human-readable code (admin enters this)"
    )

    # Device info
    device_fingerprint = models.CharField(
        max_length=255,
        help_text="Hardware UUID from terminal"
    )

    # Tenant binding (null until admin approves)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='terminal_pairing_codes',
        help_text="Set when admin approves"
    )
    location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='terminal_pairing_codes',
        help_text="Set when admin approves"
    )

    # Lifecycle
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('denied', 'Denied'),
        ('expired', 'Expired'),
        ('consumed', 'Token Issued'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )

    expires_at = models.DateTimeField(
        help_text="Code expires 15 minutes after creation"
    )
    interval = models.IntegerField(
        default=5,
        help_text="Minimum seconds between polls (RFC 8628)"
    )

    # Metadata
    nickname = models.CharField(
        max_length=100,
        blank=True,
        help_text="Terminal nickname (set by admin)"
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_terminal_pairings',
        help_text="Admin who approved"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    # No tenant manager since pairing codes don't have tenant until approved
    objects = models.Manager()

    class Meta:
        db_table = 'terminal_pairing_codes'
        indexes = [
            models.Index(fields=['status', 'expires_at']),
            models.Index(fields=['device_fingerprint']),
        ]

    def is_valid_for_polling(self):
        """Can terminal continue polling?"""
        return (
            self.status in ['pending', 'approved'] and
            self.expires_at > timezone.now()
        )

    def mark_approved(self, admin_user, tenant, location, nickname=''):
        """Admin approval"""
        self.status = 'approved'
        self.tenant = tenant
        self.location = location
        self.nickname = nickname
        self.created_by = admin_user
        self.approved_at = timezone.now()
        self.save()

    def mark_consumed(self):
        """Token issued successfully"""
        self.status = 'consumed'
        self.consumed_at = timezone.now()
        self.save()

    def __str__(self):
        return f"{self.user_code} ({self.status})"


class TerminalRegistration(models.Model):
    """
    Links a physical device to a primary StoreLocation.
    This is the standard for device management.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='terminal_registrations'
    )
    device_id = models.CharField(max_length=255)
    nickname = models.CharField(
        max_length=100,
        blank=True,
        help_text="A friendly name for the device (e.g., 'Front Counter').",
    )
    store_location = models.ForeignKey(
        "settings.StoreLocation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='terminal_registrations',
        help_text="The primary store location this terminal is physically in.",
    )
    last_seen = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    reader_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="The ID of the Stripe Terminal reader assigned to this device (e.g., tmr_...).",
    )

    # Pairing metadata
    pairing_code = models.ForeignKey(
        TerminalPairingCode,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='terminal_registrations',
        help_text="Original pairing code"
    )
    device_fingerprint = models.CharField(
        max_length=255,
        unique=True,
        help_text="Hardware UUID"
    )

    # Security tracking
    last_authenticated_at = models.DateTimeField(null=True, blank=True)
    authentication_failures = models.IntegerField(default=0)
    is_locked = models.BooleanField(default=False)

    objects = TenantManager()
    all_objects = models.Manager()

    def __str__(self):
        location_name = (
            self.store_location.name if self.store_location else "Unassigned"
        )
        return f"{self.nickname or self.device_id} @ {location_name}"

    class Meta:
        db_table = 'settings_terminalregistration'  # Keep existing table name
        verbose_name = "Terminal Registration"
        verbose_name_plural = "Terminal Registrations"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "device_id"],
                name="unique_device_id_per_tenant",
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'store_location']),
        ]
