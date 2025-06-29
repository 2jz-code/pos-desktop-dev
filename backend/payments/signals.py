from django.dispatch import Signal
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Payment
from orders.models import Order

# Custom payment signals
payment_completed = Signal()


@receiver(post_save, sender=Payment)
def update_order_payment_status(sender, instance, created, **kwargs):
    """
    Listens for changes on the Payment model and updates the related
    Order's payment_status field through the OrderService.
    """
    order = instance.order
    # Map the Payment status to the Order's payment_status choices
    # This assumes the choices on both models are named identically (e.g., 'PAID', 'PENDING')
    new_payment_status = instance.status

    # Use OrderService to update payment status instead of direct model modification
    from orders.services import OrderService

    OrderService.update_payment_status(order, new_payment_status)
