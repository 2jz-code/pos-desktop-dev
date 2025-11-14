from django.dispatch import Signal, receiver
from django.db.models.signals import post_save
import logging

logger = logging.getLogger(__name__)


# ===== CUSTOM SIGNALS =====

# Signal fired when a new approval request is created
# Provides: sender=ManagerApprovalRequest, instance=request_instance, created=True
approval_request_created = Signal()

# Signal fired when an approval request is resolved (approved or denied)
# Provides: sender=ManagerApprovalRequest, instance=request_instance, outcome='approved'|'denied'
approval_request_resolved = Signal()


# ===== SIGNAL HANDLERS =====

@receiver(post_save, sender='settings.StoreLocation')
def auto_create_approval_policy(sender, instance, created, **kwargs):
    """
    Auto-create an ApprovalPolicy with sane defaults when a StoreLocation is saved.

    This ensures every location has a policy configured, including existing locations
    that were created before the approval system was added.
    Admins can adjust thresholds later via admin interface.
    """
    from .models import ApprovalPolicy
    from decimal import Decimal

    # Use get_or_create to handle both new and existing locations
    policy, policy_created = ApprovalPolicy.objects.get_or_create(
        tenant=instance.tenant,
        store_location=instance,
        defaults={
            'max_discount_percent': Decimal('15.00'),
            'max_refund_amount': Decimal('50.00'),
            'max_price_override_amount': Decimal('50.00'),
            'max_void_order_amount': Decimal('100.00'),
            'approval_expiry_minutes': 30,
            'allow_self_approval': False,
            'purge_after_days': 90,
        }
    )

    if policy_created:
        action = "Auto-created" if created else "Backfilled"
        logger.info(
            f"{action} ApprovalPolicy for StoreLocation {instance.name} "
            f"(tenant: {instance.tenant.id}, location: {instance.id})"
        )
