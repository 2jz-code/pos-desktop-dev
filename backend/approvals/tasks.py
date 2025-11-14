from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task
def expire_pending_approvals():
    """
    Mark PENDING approval requests as EXPIRED if expires_at < now.

    This task runs every 5 minutes via Celery Beat.
    Identifies all pending requests that have passed their expiry time
    and bulk updates them to EXPIRED status.

    Returns:
        str: Status message with count of expired requests
    """
    from .models import ManagerApprovalRequest, ApprovalStatus
    from .services import ManagerApprovalService

    try:
        now = timezone.now()

        # Find all pending requests that have expired
        expired_ids = list(
            ManagerApprovalRequest.objects.filter(
                status=ApprovalStatus.PENDING,
                expires_at__lt=now
            ).values_list('id', flat=True)
        )

        if not expired_ids:
            logger.info("No pending approval requests to expire")
            return "No pending approval requests to expire"

        # Mark them as expired via service
        count = ManagerApprovalService.mark_expired(expired_ids)

        message = f"Expired {count} pending approval requests"
        logger.info(message)
        return message

    except Exception as e:
        error_msg = f"Error expiring pending approval requests: {e}"
        logger.error(error_msg, exc_info=True)
        raise


@shared_task
def cleanup_old_approvals():
    """
    Hard-delete resolved approval requests older than policy purge_after_days.

    This task runs daily via Celery Beat (typically at 3 AM).
    Removes APPROVED, DENIED, and EXPIRED requests that are older than
    the configured purge period (default: 90 days).

    Returns:
        str: Status message with count of purged requests
    """
    from .services import ManagerApprovalService

    try:
        # Use default of 90 days
        # In the future, this could be made configurable per tenant
        days = 90

        count = ManagerApprovalService.cleanup_old_requests(days=days)

        if count == 0:
            logger.info("No old approval requests to purge")
            return "No old approval requests to purge"

        message = f"Purged {count} approval requests older than {days} days"
        logger.info(message)
        return message

    except Exception as e:
        error_msg = f"Error purging old approval requests: {e}"
        logger.error(error_msg, exc_info=True)
        raise
