from django.dispatch import Signal
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Order, OrderItem, OrderDiscount
from core_backend.infrastructure.cache_utils import invalidate_cache_pattern

# from .serializers import OrderSerializer  # Import the serializer
import logging

logger = logging.getLogger(__name__)

# Custom signals for order events
order_needs_recalculation = Signal()
payment_completed = Signal()

# Custom signals that other apps can listen to
web_order_ready_for_notification = Signal()
web_order_paid = Signal()

# This file will contain all order-related signal receivers


# Signal receivers
@receiver(order_needs_recalculation)
def handle_order_recalculation(sender, **kwargs):
    """
    Handles order recalculation when a discount is applied or removed.
    This receiver listens for the order_needs_recalculation signal from the discounts app.
    """
    order = kwargs.get("order")
    if order:
        # Import here to avoid circular imports
        from .services import OrderCalculationService

        OrderCalculationService.recalculate_order_totals(order)


@receiver(payment_completed)
def handle_payment_completion(sender, **kwargs):
    """
    Handles order status updates when a payment is completed.
    This receiver listens for the payment_completed signal from the payments app.
    """
    payment = kwargs.get("payment")
    if payment and payment.order:
        # Import here to avoid circular imports
        from .services import OrderService

        # Call the service method to handle payment completion business logic
        OrderService.mark_as_fully_paid(payment.order)


@receiver(post_save, sender=Order)
def handle_order_completion_inventory(sender, instance, created, **kwargs):
    """
    Handles inventory deduction when any order is completed.
    This receiver listens for Order model post_save signals.

    PERFORMANCE FIX: Inventory processing is now async via Celery to prevent
    blocking payment transactions.
    """
    if instance.status == Order.OrderStatus.COMPLETED and not created:
        # Skip inventory processing for test orders
        if instance.order_number and instance.order_number.startswith('TEST-'):
            logger.info(f"Skipping inventory processing for test order {instance.order_number}")
            return

        # CRITICAL FIX: Process inventory asynchronously to avoid blocking payment transactions
        # This prevents payment settlement from taking 1+ seconds due to inventory loops
        try:
            from inventory.tasks import process_order_completion_inventory

            # Queue the inventory processing task
            process_order_completion_inventory.delay(str(instance.id))

            logger.info(
                f"Queued async inventory processing for completed order {instance.order_number}"
            )
        except Exception as e:
            logger.error(f"Failed to queue inventory task for order {instance.id}: {e}")
            # Fallback to synchronous processing if Celery is unavailable
            logger.warning(f"Falling back to synchronous inventory processing for order {instance.id}")
            try:
                from inventory.services import InventoryService
                InventoryService.process_order_completion(instance)
                logger.info(f"Synchronous inventory processing completed for order {instance.order_number}")
            except Exception as sync_error:
                logger.error(f"Synchronous inventory processing also failed for order {instance.id}: {sync_error}")


@receiver(post_save, sender=Order)
def handle_web_order_notifications(sender, instance, created, **kwargs):
    """
    Broadcasts a signal with serialized order data when a web order is completed.
    This keeps the order business logic in the orders app and uses a serializer
    for a robust data contract.
    """
    # Only handle completed web orders
    if (
        instance.order_type != Order.OrderType.WEB
        or instance.status != Order.OrderStatus.COMPLETED
    ):
        return

    # To ensure we are broadcasting an event only when the order is first marked as completed,
    # we can check the 'update_fields' if available (it's not always present).
    # A more reliable way is often to check previous state, but for now this is a good guard.
    if kwargs.get("update_fields") and "status" not in kwargs["update_fields"]:
        return

    logger.info(
        f"Broadcasting 'web_order_ready_for_notification' for order {instance.order_number}"
    )

    # Import locally to prevent circular dependency
    from .serializers import UnifiedOrderSerializer

    # Use UnifiedOrderSerializer with 'detail' view mode to create a robust data payload
    serialized_data = UnifiedOrderSerializer(instance, context={'view_mode': 'detail'}).data

    # Broadcast the custom signal for other apps to listen to
    web_order_ready_for_notification.send(
        sender=Order,
        order_id=instance.id,
        order_number=instance.order_number,
        order_data=serialized_data,  # Pass the serialized data
        store_location=instance.store_location,  # Pass location for location-specific settings
    )

    logger.info(
        f"Web order notification event broadcasted for order {instance.order_number}"
    )

# Cache invalidation signal handlers for Phase 3B
@receiver([post_save, post_delete], sender=Order)
def handle_order_changes_for_reports(sender, instance=None, **kwargs):
    """Invalidate report caches when orders change"""
    try:
        # Invalidate report caches that depend on order data
        invalidate_cache_pattern('*get_cached_business_kpis*')
        invalidate_cache_pattern('*sales_report*')
        invalidate_cache_pattern('*summary_report*')
        invalidate_cache_pattern('*payment_report*')
        invalidate_cache_pattern('*operations_report*')
        
        # Also invalidate ReportCache entries in the database
        _invalidate_report_cache_entries()
        
        logger.debug(f"Invalidated report caches after order change: {instance.order_number if instance else 'unknown'}")
        
    except Exception as e:
        logger.error(f"Failed to invalidate report caches: {e}")

@receiver([post_save, post_delete], sender=OrderItem)
def handle_order_item_changes(sender, instance=None, **kwargs):
    """Invalidate order calculation caches when order items change"""
    try:
        # Invalidate session-level calculation caches
        invalidate_cache_pattern('get_cached_order_totals')
        
        # Also invalidate report caches since order totals affect reports
        invalidate_cache_pattern('*get_cached_business_kpis*')
        invalidate_cache_pattern('*sales_report*')
        
        # Invalidate database report cache entries
        _invalidate_report_cache_entries()
        
        logger.debug(f"Invalidated order calculation caches after item change")
        
    except Exception as e:
        logger.error(f"Failed to invalidate order calculation caches: {e}")

@receiver([post_save, post_delete], sender=OrderDiscount)
def handle_order_discount_changes(sender, instance=None, **kwargs):
    """Invalidate order calculation caches when discounts are applied/removed"""
    try:
        # Invalidate session-level calculation caches
        invalidate_cache_pattern('get_cached_order_totals')
        
        # Also invalidate report caches since discounts affect totals
        invalidate_cache_pattern('*get_cached_business_kpis*')
        invalidate_cache_pattern('*sales_report*')
        
        # Invalidate database report cache entries
        _invalidate_report_cache_entries()
        
        logger.debug(f"Invalidated order calculation caches after discount change")
        
    except Exception as e:
        logger.error(f"Failed to invalidate order discount caches: {e}")

def _invalidate_report_cache_entries():
    """Helper function to invalidate database report cache entries"""
    try:
        from reports.models import ReportCache
        from django.utils import timezone
        
        # Debug: log the ReportCache model fields
        logger.debug(f"ReportCache model fields: {[field.name for field in ReportCache._meta.fields]}")
        
        # Mark recent report cache entries as expired
        one_hour_ago = timezone.now() - timezone.timedelta(hours=1)
        
        # Debug: try to identify the exact query that's failing
        logger.debug(f"Attempting to filter ReportCache with generated_at__gte={one_hour_ago}")
        
        ReportCache.objects.filter(
            generated_at__gte=one_hour_ago
        ).update(expires_at=timezone.now())
        
        logger.debug("Invalidated recent database report cache entries")
        
    except Exception as e:
        import traceback
        logger.error(f"Failed to invalidate database report cache entries: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
