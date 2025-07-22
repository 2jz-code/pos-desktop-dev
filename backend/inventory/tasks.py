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
    """
    try:
        logger.info("Starting daily low stock sweep...")
        
        # Use the service method to send daily summary
        items_notified = InventoryService.send_daily_low_stock_summary()
        
        if items_notified > 0:
            logger.info(f"Daily low stock sweep completed: {items_notified} items notified")
            return {
                "status": "completed",
                "items_notified": items_notified,
                "message": f"Daily low stock summary sent for {items_notified} items"
            }
        else:
            logger.info("Daily low stock sweep completed: No items below threshold")
            return {
                "status": "completed", 
                "items_notified": 0,
                "message": "No items below threshold found"
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
        
        # Find items that are notified but now above threshold
        reset_candidates = InventoryStock.objects.filter(
            low_stock_notified=True
        ).select_related('product', 'location')
        
        reset_count = 0
        for item in reset_candidates:
            if item.quantity > item.effective_low_stock_threshold:
                item.low_stock_notified = False
                item.save(update_fields=['low_stock_notified'])
                reset_count += 1
                
        logger.info(f"Reset {reset_count} notification flags for items back above threshold")
        
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