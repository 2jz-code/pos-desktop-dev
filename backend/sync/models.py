"""
Sync app models for offline mode infrastructure.

Models in this app are infrastructure-focused (not business domain).
"""
import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from tenant.managers import TenantManager


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
            ('PROMOTED_ORDER', 'Promoted Order'),
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
