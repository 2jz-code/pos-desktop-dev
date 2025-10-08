from celery import shared_task
from django.utils import timezone
import logging

from .services import InventoryService

logger = logging.getLogger(__name__)


@shared_task
def daily_low_stock_sweep():
    """
    Daily task to check for items below threshold that haven't been notified.

    This task runs once daily (typically in the morning) to:
    - Find items below their low stock threshold
    - Send notifications only for items with low_stock_notified=False
    - Act as a safety net for items missed during regular sales

    Runs in addition to real-time individual notifications during sales.

    NOTE: Processes ALL tenants - loops through each tenant separately.
    """
    try:
        from tenant.models import Tenant

        logger.info("Starting daily low stock sweep for all tenants...")

        total_items_notified = 0
        tenants_processed = 0

        # Process each tenant separately to maintain data isolation
        for tenant in Tenant.objects.filter(is_active=True):
            try:
                # Set tenant context for this iteration
                from tenant.managers import set_current_tenant
                set_current_tenant(tenant)

                # Use the service method to send daily summary for this tenant
                items_notified = InventoryService.send_daily_low_stock_summary()

                if items_notified > 0:
                    logger.info(f"Tenant {tenant.slug}: {items_notified} items notified")
                    total_items_notified += items_notified

                tenants_processed += 1

            except Exception as tenant_exc:
                logger.error(f"Error processing tenant {tenant.slug}: {tenant_exc}")
                continue
            finally:
                # Clear tenant context after each tenant
                set_current_tenant(None)

        logger.info(f"Daily low stock sweep completed: {total_items_notified} items across {tenants_processed} tenants")

        return {
            "status": "completed",
            "items_notified": total_items_notified,
            "tenants_processed": tenants_processed,
            "message": f"Daily low stock summary sent for {total_items_notified} items across {tenants_processed} tenants"
        }

    except Exception as exc:
        logger.error(f"Error in daily low stock sweep: {exc}")
        return {
            "status": "failed",
            "error": str(exc)
        }


@shared_task
def reset_low_stock_notifications():
    """
    Weekly task to reset notification flags for items that are back above threshold.

    This provides a safety mechanism to reset flags that might have gotten stuck.
    Runs weekly (typically Sunday night) to clean up any edge cases.

    NOTE: Processes ALL tenants - loops through each tenant separately.
    """
    try:
        from .models import InventoryStock
        from tenant.models import Tenant
        from tenant.managers import set_current_tenant

        logger.info("Starting low stock notification flag reset for all tenants...")

        total_reset_count = 0
        tenants_processed = 0

        # Process each tenant separately to maintain data isolation
        for tenant in Tenant.objects.filter(is_active=True):
            try:
                # Set tenant context for this iteration
                set_current_tenant(tenant)

                # Find items that are notified but now above threshold (tenant-scoped by TenantManager)
                reset_candidates = InventoryStock.objects.filter(
                    low_stock_notified=True
                ).select_related('product', 'location')

                tenant_reset_count = 0
                for item in reset_candidates:
                    if item.quantity > item.effective_low_stock_threshold:
                        item.low_stock_notified = False
                        item.save(update_fields=['low_stock_notified'])
                        tenant_reset_count += 1

                if tenant_reset_count > 0:
                    logger.info(f"Tenant {tenant.slug}: Reset {tenant_reset_count} notification flags")
                    total_reset_count += tenant_reset_count

                tenants_processed += 1

            except Exception as tenant_exc:
                logger.error(f"Error processing tenant {tenant.slug}: {tenant_exc}")
                continue
            finally:
                # Clear tenant context after each tenant
                set_current_tenant(None)

        logger.info(f"Reset {total_reset_count} notification flags across {tenants_processed} tenants")

        return {
            "status": "completed",
            "flags_reset": total_reset_count,
            "tenants_processed": tenants_processed,
            "message": f"Reset {total_reset_count} notification flags across {tenants_processed} tenants"
        }

    except Exception as exc:
        logger.error(f"Error resetting notification flags: {exc}")
        return {
            "status": "failed",
            "error": str(exc)
        }