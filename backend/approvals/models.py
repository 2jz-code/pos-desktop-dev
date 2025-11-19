from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal
from core_backend.utils.archiving import SoftDeleteMixin
from tenant.managers import TenantManager, TenantSoftDeleteManager
import uuid


class ActionType(models.TextChoices):
    """Types of actions that require manager approval"""
    DISCOUNT = 'DISCOUNT', _('Discount Application')
    ORDER_VOID = 'ORDER_VOID', _('Order Void')
    REFUND = 'REFUND', _('Refund')
    PRICE_OVERRIDE = 'PRICE_OVERRIDE', _('Price Override')
    CUSTOM_ADJUSTMENT = 'CUSTOM_ADJUSTMENT', _('Custom Adjustment')
    TAX_EXEMPT = 'TAX_EXEMPT', _('Tax Exemption')
    FEE_EXEMPT = 'FEE_EXEMPT', _('Fee Exemption')


class ApprovalStatus(models.TextChoices):
    """Status of an approval request"""
    PENDING = 'PENDING', _('Pending')
    APPROVED = 'APPROVED', _('Approved')
    DENIED = 'DENIED', _('Denied')
    EXPIRED = 'EXPIRED', _('Expired')


class ApprovalPolicy(SoftDeleteMixin):
    """
    Configuration for approval thresholds and policies per store location.

    One policy per store location, auto-created when location is created.
    Defines thresholds that trigger manager approval requirements.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='approval_policies'
    )

    store_location = models.OneToOneField(
        'settings.StoreLocation',
        on_delete=models.CASCADE,
        related_name='approval_policy',
        help_text=_("Store location this policy applies to")
    )

    # Threshold configurations per action type
    max_discount_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('15.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        help_text=_("Maximum discount percentage allowed without approval (e.g., 15.00 for 15%)")
    )

    max_fixed_discount_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('20.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text=_("Maximum fixed dollar discount allowed without approval (e.g., $20 off)")
    )

    max_refund_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('50.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text=_("Maximum refund amount allowed without approval")
    )

    max_price_override_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('50.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text=_("Maximum price override amount allowed without approval (total difference including quantity)")
    )

    max_void_order_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('100.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text=_("Maximum order total that can be voided without approval")
    )

    # "Always require approval" configuration
    always_require_approval_for = models.JSONField(
        default=list,
        blank=True,
        help_text=_(
            "List of action types that always require approval regardless of threshold. "
            "Valid values: DISCOUNT, REFUND, PRICE_OVERRIDE, ORDER_VOID"
        )
    )

    # Expiry settings
    approval_expiry_minutes = models.PositiveIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(1440)],  # Max 24 hours
        help_text=_("Minutes until pending approval request expires (hardcoded to 5 minutes)")
    )

    # Security settings
    allow_self_approval = models.BooleanField(
        default=False,
        help_text=_("Allow manager to approve their own requests (not recommended)")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Use tenant-aware manager
    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()  # Bypass tenant filter for admin

    class Meta:
        verbose_name = _("Approval Policy")
        verbose_name_plural = _("Approval Policies")
        indexes = [
            models.Index(fields=['tenant', 'store_location']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'store_location'],
                name='unique_policy_per_store_location'
            )
        ]

    def __str__(self):
        return f"Approval Policy - {self.store_location.name}"

    def requires_approval_for_action(self, action_type):
        """
        Check if a specific action type should always require approval.

        Args:
            action_type: ActionType value (e.g., ActionType.DISCOUNT)

        Returns:
            bool: True if action should always require approval
        """
        # Handle both enum values and string values
        action_value = action_type.value if hasattr(action_type, 'value') else action_type
        return action_value in (self.always_require_approval_for or [])

    @classmethod
    def get_for_location(cls, store_location):
        """
        Get or create approval policy for a store location.
        Returns the policy with sane defaults if it doesn't exist.
        """
        policy, created = cls.objects.get_or_create(
            tenant=store_location.tenant,
            store_location=store_location,
            defaults={
                'max_discount_percent': Decimal('15.00'),
                'max_fixed_discount_amount': Decimal('20.00'),
                'max_refund_amount': Decimal('50.00'),
                'max_price_override_amount': Decimal('50.00'),
                'max_void_order_amount': Decimal('100.00'),
                'always_require_approval_for': [],
                'approval_expiry_minutes': 5,
                'allow_self_approval': False,
            }
        )
        return policy


class ManagerApprovalRequest(SoftDeleteMixin):
    """
    Represents a request for manager approval on sensitive operations.

    Tracks who requested, what action, current status, and who approved/denied.
    Includes payload snapshot for audit trail and rollback scenarios.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Multi-tenancy
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='approval_requests'
    )

    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.CASCADE,
        related_name='approval_requests',
        help_text=_("Store location where approval is requested")
    )

    # Actors
    initiator = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,  # Don't allow deleting users with approval history
        related_name='initiated_approval_requests',
        help_text=_("User who requested the approval (e.g., cashier)")
    )

    approver = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='approved_requests',
        null=True,
        blank=True,
        help_text=_("Manager who approved or denied the request")
    )

    # Action context
    action_type = models.CharField(
        max_length=50,
        choices=ActionType.choices,
        help_text=_("Type of action requiring approval")
    )

    status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING,
        db_index=True,
        help_text=_("Current status of the approval request")
    )

    # Related objects (explicit FKs for type safety and query performance)
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='approval_requests',
        null=True,
        blank=True,
        help_text=_("Related order if action involves an order")
    )

    order_item = models.ForeignKey(
        'orders.OrderItem',
        on_delete=models.CASCADE,
        related_name='approval_requests',
        null=True,
        blank=True,
        help_text=_("Related order item if action involves a specific item")
    )

    discount = models.ForeignKey(
        'discounts.Discount',
        on_delete=models.CASCADE,
        related_name='approval_requests',
        null=True,
        blank=True,
        help_text=_("Related discount if action involves discount application")
    )

    # Future extensibility for custom action types
    related_object_label = models.CharField(
        max_length=255,
        blank=True,
        help_text=_("Human-readable label for related object (for future extensibility)")
    )

    # Metadata
    payload = models.JSONField(
        default=dict,
        blank=True,
        help_text=_("Snapshot of action context (amounts, old values, etc.)")
    )

    reason = models.TextField(
        blank=True,
        help_text=_("Why approval is needed (auto-generated or user-provided)")
    )

    threshold_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("Threshold value that triggered the approval requirement")
    )

    # Lifecycle timestamps
    expires_at = models.DateTimeField(
        help_text=_("When this approval request expires if not acted upon")
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("When the request was approved")
    )

    denied_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("When the request was denied")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Use tenant-aware manager
    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()  # Bypass tenant filter for admin

    class Meta:
        verbose_name = _("Manager Approval Request")
        verbose_name_plural = _("Manager Approval Requests")
        ordering = ['-created_at']
        indexes = [
            # Primary query patterns: pending approvals by location
            models.Index(fields=['tenant', 'store_location', 'status', 'created_at']),
            # Lookup by initiator
            models.Index(fields=['tenant', 'initiator', 'status']),
            # Lookup by approver
            models.Index(fields=['tenant', 'approver', 'status']),
            # Expiry cleanup queries
            models.Index(fields=['status', 'expires_at']),
            # Action type filtering
            models.Index(fields=['tenant', 'action_type', 'status']),
        ]

    def __str__(self):
        return f"{self.get_action_type_display()} - {self.get_status_display()} ({self.initiator.email})"

    @property
    def is_expired(self):
        """Check if the request has expired"""
        return self.status == ApprovalStatus.PENDING and timezone.now() > self.expires_at

    @property
    def is_pending(self):
        """Check if the request is still pending"""
        return self.status == ApprovalStatus.PENDING and not self.is_expired

    @property
    def can_be_approved(self):
        """Check if the request can be approved"""
        return self.is_pending

    def save(self, *args, **kwargs):
        """Override save to set expires_at if not provided"""
        if not self.expires_at and self.store_location_id:
            policy = ApprovalPolicy.get_for_location(self.store_location)
            self.expires_at = timezone.now() + timezone.timedelta(minutes=policy.approval_expiry_minutes)
        super().save(*args, **kwargs)
