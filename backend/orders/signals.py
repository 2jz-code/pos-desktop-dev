from django.dispatch import Signal
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Order

# Custom signals for order events
order_needs_recalculation = Signal()
payment_completed = Signal()

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
def handle_order_completion(sender, instance, created, **kwargs):
    """
    Handles inventory deduction when an order is completed.
    This receiver listens for Order model post_save signals.
    """
    # Only process if this is an update (not creation) and status is COMPLETED
    if not created and instance.status == Order.OrderStatus.COMPLETED:
        # Import here to avoid circular imports
        from inventory.services import InventoryService
        
        try:
            InventoryService.process_order_completion(instance)
        except Exception as e:
            # Log the error but don't prevent the order from completing
            print(f"Failed to process inventory for order {instance.id}: {e}")

        # --- NEW: Handle web order notifications ---
        if instance.order_type == Order.OrderType.WEB:
            # This service handles real-time notifications and auto-printing for web orders.
            from .services import web_order_notification_service
            try:
                web_order_notification_service.handle_web_order_completion(instance)
            except Exception as e:
                # Log the error but don't disrupt the main order flow
                print(f"Failed to send web order notification for order {instance.id}: {e}")
