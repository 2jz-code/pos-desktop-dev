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
        from .services import OrderService

        OrderService.recalculate_order_totals(order)


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
    """
    if instance.status == Order.OrderStatus.COMPLETED and not created:
        from inventory.services import InventoryService

        try:
            InventoryService.process_order_completion(instance)
            logger.info(
                f"Inventory processed for completed order {instance.order_number}"
            )
        except Exception as e:
            logger.error(f"Failed to process inventory for order {instance.id}: {e}")


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
    from .serializers import OrderSerializer

    # Use the OrderSerializer to create a robust data payload
    serialized_data = OrderSerializer(instance).data

    # Broadcast the custom signal for other apps to listen to
    web_order_ready_for_notification.send(
        sender=Order,
        order_id=instance.id,
        order_number=instance.order_number,
        order_data=serialized_data,  # Pass the serialized data
    )

    logger.info(
        f"Web order notification event broadcasted for order {instance.order_number}"
    )

# Cache invalidation signal handlers for Phase 3B
@receiver([post_save, post_delete], sender=OrderItem)
def handle_order_item_changes(sender, instance=None, **kwargs):
    """Invalidate order calculation caches when order items change"""
    try:
        # Invalidate session-level calculation caches
        invalidate_cache_pattern('get_cached_order_totals')
        
        # Note: We don't invalidate tax matrix as it's static data
        
        logger.debug(f"Invalidated order calculation caches after item change")
        
    except Exception as e:
        logger.error(f"Failed to invalidate order calculation caches: {e}")

@receiver([post_save, post_delete], sender=OrderDiscount)
def handle_order_discount_changes(sender, instance=None, **kwargs):
    """Invalidate order calculation caches when discounts are applied/removed"""
    try:
        # Invalidate session-level calculation caches
        invalidate_cache_pattern('get_cached_order_totals')
        
        logger.debug(f"Invalidated order calculation caches after discount change")
        
    except Exception as e:
        logger.error(f"Failed to invalidate order discount caches: {e}")
