from celery import shared_task
from django.utils import timezone
import logging

from .services import InventoryService

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_order_completion_inventory(self, order_id):
    """
    Async task to process inventory deductions for a completed order.

    This task is triggered after payment completes to avoid blocking
    the payment transaction with inventory operations.

    Args:
        order_id: UUID of the order to process

    Returns:
        dict: Status and details of inventory processing
    """
    try:
        from orders.models import Order

        logger.info(f"Processing inventory for order {order_id}")

        # Fetch the order
        order = Order.objects.get(id=order_id)

        # Skip test orders
        if order.order_number and order.order_number.startswith('TEST-'):
            logger.info(f"Skipping inventory processing for test order {order.order_number}")
            return {
                "status": "skipped",
                "reason": "test_order",
                "order_number": order.order_number
            }

        # Process inventory deduction
        InventoryService.process_order_completion(order)

        logger.info(f"Inventory processed successfully for order {order.order_number}")

        return {
            "status": "completed",
            "order_id": str(order_id),
            "order_number": order.order_number
        }

    except Order.DoesNotExist:
        logger.error(f"Order {order_id} not found for inventory processing")
        return {
            "status": "failed",
            "error": "Order not found",
            "order_id": str(order_id)
        }
    except Exception as exc:
        logger.error(f"Error processing inventory for order {order_id}: {exc}")
        # Retry on failure
        raise self.retry(exc=exc)


@shared_task
def daily_low_stock_sweep():
    """
    Daily task to check for items below threshold that haven't been notified.

    This task runs once daily (typically in the morning) to:
    - Find items below their low stock threshold
    - Send notifications only for items with low_stock_notified=False
    - Act as a safety net for items missed during regular sales

    Runs in addition to real-time individual notifications during sales.
    """
    try:
        logger.info("Starting daily low stock sweep...")

        # Use the service method to send daily summary
        items_notified = InventoryService.send_daily_low_stock_summary()

        if items_notified > 0:
            logger.info(f"{items_notified} items notified")

        logger.info(f"Daily low stock sweep completed: {items_notified} items")

        return {
            "status": "completed",
            "items_notified": items_notified,
            "message": f"Daily low stock summary sent for {items_notified} items"
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
    """
    try:
        from .models import InventoryStock

        logger.info("Starting low stock notification flag reset...")

        reset_count = 0

        # Find items that are notified but now above threshold
        reset_candidates = InventoryStock.objects.filter(
            low_stock_notified=True
        ).select_related('product', 'location')

        for item in reset_candidates:
            if item.quantity > item.effective_low_stock_threshold:
                item.low_stock_notified = False
                item.save(update_fields=['low_stock_notified'])
                reset_count += 1

        if reset_count > 0:
            logger.info(f"Reset {reset_count} notification flags")

        logger.info(f"Reset {reset_count} notification flags")

        return {
            "status": "completed",
            "flags_reset": reset_count,
            "message": f"Reset {reset_count} notification flags"
        }

    except Exception as exc:
        logger.error(f"Error resetting notification flags: {exc}")
        return {
            "status": "failed",
            "error": str(exc)
        }