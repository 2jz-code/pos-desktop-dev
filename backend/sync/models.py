"""
Sync app models for offline mode infrastructure.

Models in this app are infrastructure-focused (not business domain).
"""
import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from tenant.managers import TenantManager


class OfflineConflict(models.Model):
    """
    Tracks conflicts that occur during offline data synchronization.

    When terminals reconnect after being offline, conflicts may arise:
    - Product was deleted while terminal was offline
    - Price changed since terminal's cached version
    - Insufficient inventory for offline sales
    - Dataset version mismatches

    These conflicts are logged for resolution via admin dashboard.
    """

    class ConflictType(models.TextChoices):
        PRODUCT_DELETED = "PRODUCT_DELETED", _("Product Deleted")
        PRODUCT_PRICE_CHANGED = "PRODUCT_PRICE_CHANGED", _("Price Changed")
        INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK", _("Insufficient Stock")
        DATASET_VERSION_MISMATCH = "DATASET_VERSION_MISMATCH", _("Dataset Version Mismatch")
        INVALID_SIGNATURE = "INVALID_SIGNATURE", _("Invalid Signature")
        REPLAY_ATTACK = "REPLAY_ATTACK", _("Replay Attack Detected")
        LIMIT_EXCEEDED = "LIMIT_EXCEEDED", _("Offline Limit Exceeded")
        OTHER = "OTHER", _("Other")

    class Status(models.TextChoices):
        PENDING = "PENDING", _("Pending Resolution")
        RESOLVED = "RESOLVED", _("Resolved")
        IGNORED = "IGNORED", _("Ignored")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Multi-tenancy
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='offline_conflicts'
    )

    # Device that encountered the conflict
    terminal = models.ForeignKey(
        'terminals.TerminalRegistration',
        on_delete=models.CASCADE,
        related_name='offline_conflicts',
        help_text=_("Terminal that submitted the conflicting payload")
    )

    # Conflict details
    conflict_type = models.CharField(
        max_length=50,
        choices=ConflictType.choices,
        help_text=_("Type of conflict encountered")
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        help_text=_("Current resolution status")
    )

    # Payload reference (for investigation)
    operation_id = models.UUIDField(
        help_text=_("Client-generated operation ID from payload")
    )
    payload_snapshot = models.JSONField(
        help_text=_("Snapshot of the conflicting payload for debugging")
    )

    # Conflict context
    conflict_message = models.TextField(
        help_text=_("Human-readable description of the conflict")
    )
    affected_entity_type = models.CharField(
        max_length=50,
        blank=True,
        help_text=_("Entity type involved (e.g., 'product', 'order', 'inventory')")
    )
    affected_entity_id = models.CharField(
        max_length=255,
        blank=True,
        help_text=_("ID of the affected entity")
    )

    # Resolution tracking
    resolved_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_conflicts',
        help_text=_("User who resolved this conflict")
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("When the conflict was resolved")
    )
    resolution_notes = models.TextField(
        blank=True,
        help_text=_("Notes about how the conflict was resolved")
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Manager
    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("Offline Conflict")
        verbose_name_plural = _("Offline Conflicts")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status', 'created_at']),
            models.Index(fields=['tenant', 'terminal', 'status']),
            models.Index(fields=['tenant', 'conflict_type']),
            models.Index(fields=['operation_id']),
        ]

    def __str__(self):
        return f"{self.get_conflict_type_display()} - {self.terminal.nickname} ({self.get_status_display()})"

    def resolve(self, user, notes=""):
        """Mark conflict as resolved"""
        from django.utils import timezone
        self.status = self.Status.RESOLVED
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.resolution_notes = notes
        self.save(update_fields=['status', 'resolved_by', 'resolved_at', 'resolution_notes', 'updated_at'])

    def ignore(self, user, notes=""):
        """Mark conflict as ignored (acceptable/not actionable)"""
        from django.utils import timezone
        self.status = self.Status.IGNORED
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.resolution_notes = notes
        self.save(update_fields=['status', 'resolved_by', 'resolved_at', 'resolution_notes', 'updated_at'])


class ProcessedOperation(models.Model):
    """
    Tracks successfully processed offline operations for idempotency.

    When terminals retry sync requests (e.g., due to network issues),
    we need to detect duplicate operations and return the original result
    instead of creating duplicate orders/payments.
    """

    # Operation ID from the client payload (unique per terminal)
    operation_id = models.UUIDField(
        db_index=True,
        help_text=_("Client-generated operation ID from the payload")
    )

    # Multi-tenancy
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='processed_operations'
    )

    # Device that sent the operation
    terminal = models.ForeignKey(
        'terminals.TerminalRegistration',
        on_delete=models.CASCADE,
        related_name='processed_operations',
        help_text=_("Terminal that submitted this operation")
    )

    # Operation type and result
    operation_type = models.CharField(
        max_length=50,
        choices=[
            ('OFFLINE_ORDER', 'Offline Order'),
            ('OFFLINE_INVENTORY', 'Offline Inventory'),
            ('OFFLINE_APPROVALS', 'Offline Approvals'),
        ],
        help_text=_("Type of operation that was processed")
    )

    # Result reference (for returning cached response)
    result_data = models.JSONField(
        help_text=_("Response that was returned to the client")
    )

    # Related entities (for quick lookups)
    order_id = models.UUIDField(
        null=True,
        blank=True,
        help_text=_("Order ID if this was an order operation")
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        help_text=_("When this idempotency record expires (30 days)")
    )

    # Manager
    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("Processed Operation")
        verbose_name_plural = _("Processed Operations")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'operation_id']),
            models.Index(fields=['terminal', 'operation_id']),
            models.Index(fields=['expires_at']),  # For cleanup
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'terminal', 'operation_id'],
                name='unique_operation_per_terminal'
            )
        ]

    def __str__(self):
        return f"{self.operation_type} - {self.operation_id}"

    def save(self, *args, **kwargs):
        """Set expiration date on creation"""
        if not self.pk and not self.expires_at:
            from datetime import timedelta
            self.expires_at = timezone.now() + timedelta(days=30)
        super().save(*args, **kwargs)
