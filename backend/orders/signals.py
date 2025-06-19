from django.dispatch import Signal
from django.db.models.signals import post_save
from django.dispatch import receiver

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
