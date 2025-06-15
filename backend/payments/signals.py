from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Payment
from orders.models import Order


@receiver(post_save, sender=Payment)
def update_order_payment_status(sender, instance, created, **kwargs):
    """
    Listens for changes on the Payment model and updates the related
    Order's payment_status field to match.
    """
    order = instance.order
    # Map the Payment status to the Order's payment_status choices
    # This assumes the choices on both models are named identically (e.g., 'PAID', 'PENDING')
    new_payment_status = instance.status

    # Prevent recursive save loop by checking if the status actually changed
    if order.payment_status != new_payment_status:
        order.payment_status = new_payment_status
        # The 'update_fields' argument is crucial to avoid triggering
        # a new post_save signal on the Order and causing a loop.
        order.save(update_fields=["payment_status"])
