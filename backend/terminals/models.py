from datetime import timedelta
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

    # Offline mode configuration (Phase 1 - Foundation)
    offline_enabled = models.BooleanField(
        default=False,
        help_text="Enable offline card payments for this terminal"
    )
    offline_transaction_limit = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=50.00,
        help_text="Maximum amount per offline transaction"
    )
    offline_daily_limit = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=500.00,
        help_text="Maximum total offline transactions per day"
    )
    offline_transaction_count_limit = models.PositiveIntegerField(
        default=20,
        help_text="Maximum number of offline transactions per day"
    )
    offline_capture_window_hours = models.PositiveIntegerField(
        default=24,
        help_text="Hours before offline transactions must be captured"
    )

    # Device signing secret (for offline payload authentication)
    signing_secret = models.CharField(
        max_length=255,
        blank=True,
        help_text="HMAC secret for verifying offline payloads (TODO: Encrypt at rest in Phase 2)"
    )

    # Heartbeat status tracking (for fleet monitoring dashboard)
    last_heartbeat_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last heartbeat received from terminal"
    )
    SYNC_STATUS_CHOICES = [
        ('unknown', 'Unknown'),  # No heartbeat received yet
        ('online', 'Online'),
        ('offline', 'Offline'),
        ('syncing', 'Syncing'),
        ('error', 'Error'),
    ]
    sync_status = models.CharField(
        max_length=20,
        choices=SYNC_STATUS_CHOICES,
        default='unknown',
        help_text="Current sync state of the terminal (unknown until first heartbeat)"
    )
    pending_orders_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of orders pending sync at last heartbeat"
    )
    pending_operations_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of operations pending sync at last heartbeat"
    )
    last_sync_success_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last successful full sync to backend"
    )
    last_flush_success_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last successful queue flush to backend"
    )
    offline_since = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When terminal went offline (null if online)"
    )
    exposure_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Current offline card exposure (pending capture value)"
    )

    # Daily offline metrics (for ops visibility / reporting)
    daily_offline_revenue = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Cumulative offline order revenue today (resets at midnight)"
    )
    daily_offline_order_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of offline orders synced today (resets at midnight)"
    )
    daily_offline_revenue_reset_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When daily offline metrics were last reset"
    )

    objects = TenantManager()
    all_objects = models.Manager()

    def __str__(self):
        location_name = (
            self.store_location.name if self.store_location else "Unassigned"
        )
        return f"{self.nickname or self.device_id} @ {location_name}"

    @property
    def is_stale(self):
        """
        A terminal is considered stale if it hasn't heartbeated in >2 minutes.
        Used by admin/Fleet UI to mark devices as offline/unknown without
        relying on an explicit "I'm offline" heartbeat.
        """
        if not self.last_heartbeat_at:
            return True
        return timezone.now() - self.last_heartbeat_at > timedelta(minutes=2)

    @property
    def was_active_today(self):
        """
        Check if terminal has heartbeated at least once today.
        Used to distinguish between:
        - Terminal that was online and went offline (needs attention)
        - Terminal that was never turned on today (owner's choice)
        """
        if not self.last_heartbeat_at:
            return False
        # Check if last heartbeat was today (in terminal's timezone via location)
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        return self.last_heartbeat_at >= today_start

    @property
    def display_status(self):
        """
        Unified status for UI display. Returns one of:
        - 'online': Terminal is operational (heartbeat within 2 min)
        - 'syncing': Terminal is flushing offline queue
        - 'offline': Terminal was active today but is now unreachable
        - 'inactive': Terminal hasn't been used today (not a concern)

        This replaces the confusing stale/offline distinction.
        """
        # Never heartbeated or not active today = inactive
        if not self.last_heartbeat_at or not self.was_active_today:
            return 'inactive'

        # Stale = offline (no heartbeat in > 2 min)
        if self.is_stale:
            return 'offline'

        # Currently syncing
        if self.sync_status == 'syncing':
            return 'syncing'

        # Default to online
        return 'online'

    @property
    def needs_attention(self):
        """
        Flag for UI to highlight terminals that may need attention.
        True if terminal was active today but is now offline.
        """
        return self.was_active_today and self.is_stale

    @property
    def effective_offline_since(self):
        """
        When the terminal went offline.

        Returns offline_since if set (terminal reported going offline),
        otherwise falls back to last_heartbeat_at (best estimate of when
        it stopped responding).

        Returns None if terminal is not stale/offline.
        """
        if not self.is_stale:
            return None
        return self.offline_since or self.last_heartbeat_at

    @property
    def offline_duration(self):
        """
        How long the terminal has been offline.
        Returns None if terminal is not offline.
        """
        offline_start = self.effective_offline_since
        if not offline_start:
            return None
        return timezone.now() - offline_start

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
