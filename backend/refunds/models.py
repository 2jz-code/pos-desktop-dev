import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from decimal import Decimal
from tenant.managers import TenantManager


class RefundItem(models.Model):
    """
    Tracks which specific OrderItems were refunded and in what quantities.
    Enables item-level refund tracking and partial quantity refunds.

    Critical for:
    - Item-level refunds (refund 2 of 3 burgers)
    - Accurate tax refund allocation
    - Inventory restoration on refunds
    - Refund reports and analytics
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='refund_items'
    )

    # Link to the refund transaction
    payment_transaction = models.ForeignKey(
        'payments.PaymentTransaction',
        on_delete=models.CASCADE,
        related_name='refunded_items',
        help_text=_("The refund transaction that processed this item refund")
    )

    # Link to the original order item being refunded
    order_item = models.ForeignKey(
        'orders.OrderItem',
        on_delete=models.PROTECT,
        related_name='refunds',
        help_text=_("The original order item being refunded")
    )

    # Refund details
    quantity_refunded = models.PositiveIntegerField(
        help_text=_("How many units of this item were refunded")
    )

    amount_per_unit = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Price per unit at time of refund (usually matches price_at_sale)")
    )

    total_refund_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Total refund for this item (quantity * amount_per_unit)")
    )

    # Tax refund tracking (from OrderItem.tax_amount)
    tax_refunded = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Proportional tax refunded for this item")
    )

    # Modifier tracking
    modifier_refund_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Refund amount from modifiers on this item")
    )

    # Tip allocation (proportional from PaymentTransaction.tip)
    tip_refunded = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Proportional tip refunded for this item")
    )

    # Surcharge allocation (proportional from PaymentTransaction.surcharge)
    surcharge_refunded = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Proportional surcharge refunded for this item")
    )

    # Metadata
    refund_reason = models.TextField(
        blank=True,
        help_text=_("Reason for refunding this item")
    )

    created_at = models.DateTimeField(auto_now_add=True)

    # Tenant-aware manager
    objects = TenantManager()

    class Meta:
        db_table = 'refunds_refund_item'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['payment_transaction', 'order_item']),
            models.Index(fields=['order_item']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Refund: {self.quantity_refunded}x {self.order_item.product.name} (${self.total_refund_amount})"

    @property
    def total_refunded_with_tax_tip_surcharge(self):
        """Total amount refunded including tax, tip, and surcharge."""
        return (
            self.total_refund_amount +
            self.tax_refunded +
            self.tip_refunded +
            self.surcharge_refunded
        )


class RefundAuditLog(models.Model):
    """
    Immutable audit trail for all refund operations.

    Critical for:
    - PCI compliance and financial auditing
    - Dispute resolution
    - Fraud detection
    - Regulatory compliance (tax authorities, payment processors)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='refund_audit_logs'
    )

    # Links to entities
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.PROTECT,
        related_name='refund_audit_logs',
        help_text=_("The payment being refunded")
    )

    payment_transaction = models.ForeignKey(
        'payments.PaymentTransaction',
        on_delete=models.PROTECT,
        related_name='refund_audit_logs',
        null=True,
        blank=True,
        help_text=_("The refund transaction (if created)")
    )

    # Audit details
    action = models.CharField(
        max_length=50,
        help_text=_("Action performed (e.g., 'refund_initiated', 'refund_completed', 'refund_failed')")
    )

    source = models.CharField(
        max_length=50,
        help_text=_("Source of refund (POS, ADMIN, API, WEBHOOK)")
    )

    refund_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Amount being refunded")
    )

    reason = models.TextField(
        blank=True,
        help_text=_("Reason for refund")
    )

    # User & device tracking
    initiated_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='initiated_refunds',
        help_text=_("User who initiated the refund")
    )

    device_info = models.JSONField(
        null=True,
        blank=True,
        help_text=_("Device information (IP, user agent, terminal ID, etc.)")
    )

    # Provider response (for external refunds)
    provider_response = models.JSONField(
        null=True,
        blank=True,
        help_text=_("Raw response from payment provider")
    )

    # Status tracking
    status = models.CharField(
        max_length=50,
        help_text=_("Status of this action (success, failed, pending)")
    )

    error_message = models.TextField(
        blank=True,
        help_text=_("Error message if action failed")
    )

    # Timestamp (immutable)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    # Tenant-aware manager
    objects = TenantManager()

    class Meta:
        db_table = 'refunds_refund_audit_log'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['payment', 'created_at']),
            models.Index(fields=['payment_transaction']),
            models.Index(fields=['initiated_by']),
            models.Index(fields=['action', 'status']),
        ]

    def __str__(self):
        return f"RefundAudit: {self.action} - ${self.refund_amount} ({self.status})"


class ExchangeSession(models.Model):
    """
    Links a refund with a new purchase for exchange tracking.

    Enables:
    - Exchange workflows (return item A, buy item B)
    - Atomic tracking of refund + new sale
    - Balance calculations (refund - new purchase)
    - Exchange reports and analytics
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='exchange_sessions'
    )

    # Original order being returned/exchanged
    original_order = models.ForeignKey(
        'orders.Order',
        on_delete=models.PROTECT,
        related_name='exchange_sessions_as_original',
        help_text=_("The original order being returned/exchanged")
    )

    original_payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.PROTECT,
        related_name='exchange_sessions_as_original',
        help_text=_("The original payment being refunded")
    )

    # Refund transaction for returned items
    refund_transaction = models.ForeignKey(
        'payments.PaymentTransaction',
        on_delete=models.PROTECT,
        related_name='exchange_sessions_as_refund',
        null=True,
        blank=True,
        help_text=_("The refund transaction for returned items")
    )

    # New order for replacement items
    new_order = models.ForeignKey(
        'orders.Order',
        on_delete=models.PROTECT,
        related_name='exchange_sessions_as_new',
        null=True,
        blank=True,
        help_text=_("The new order for replacement items")
    )

    new_payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.PROTECT,
        related_name='exchange_sessions_as_new',
        null=True,
        blank=True,
        help_text=_("The new payment for replacement items")
    )

    # Financial summary
    refund_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Total amount refunded from original order")
    )

    new_order_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Total amount of new order")
    )

    balance_due = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Balance due (negative = refund to customer, positive = customer owes)")
    )

    # Session metadata
    session_status = models.CharField(
        max_length=50,
        default='INITIATED',
        help_text=_("Status of exchange session (INITIATED, REFUND_COMPLETED, NEW_ORDER_CREATED, COMPLETED, CANCELLED)")
    )

    exchange_reason = models.TextField(
        blank=True,
        help_text=_("Reason for exchange")
    )

    processed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='processed_exchanges',
        help_text=_("User who processed the exchange")
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Tenant-aware manager
    objects = TenantManager()

    class Meta:
        db_table = 'refunds_exchange_session'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['original_order']),
            models.Index(fields=['new_order']),
            models.Index(fields=['session_status']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Exchange: Order {self.original_order.order_number} → {self.new_order.order_number if self.new_order else 'Pending'}"

    def calculate_balance(self):
        """Calculate balance due (new order amount - refund amount)."""
        self.balance_due = self.new_order_amount - self.refund_amount
        return self.balance_due
