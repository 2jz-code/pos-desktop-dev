from django.dispatch import Signal
from django.db.models import Sum, F
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Payment, PaymentTransaction
from orders.models import Order
from decimal import Decimal

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


@receiver([post_save, post_delete], sender=PaymentTransaction)
def update_payment_totals(sender, instance, **kwargs):
    """
    Signal to update the parent Payment's totals whenever a
    PaymentTransaction is saved or deleted.
    Only includes successful and refunded transactions in calculations.
    """
    payment = instance.payment
    
    # Aggregate totals from only successful and refunded transactions
    # This matches the logic in PaymentService._recalculate_payment_amounts()
    aggregates = payment.transactions.filter(
        status__in=[
            PaymentTransaction.TransactionStatus.SUCCESSFUL,
            PaymentTransaction.TransactionStatus.REFUNDED,
        ]
    ).aggregate(
        total_amount=Sum('amount'),
        total_tips=Sum('tip'),
        total_surcharges=Sum('surcharge')
    )

    # Get the aggregated values, defaulting to 0 if None
    total_amount = aggregates.get('total_amount') or Decimal('0.00')
    total_tips = aggregates.get('total_tips') or Decimal('0.00')
    total_surcharges = aggregates.get('total_surcharges') or Decimal('0.00')

    # Calculate the grand total collected
    total_collected = total_amount + total_tips + total_surcharges

    # Update the parent Payment object without triggering its own save signals
    Payment.objects.filter(pk=payment.pk).update(
        amount_paid=total_amount,
        total_tips=total_tips,
        total_surcharges=total_surcharges,
        total_collected=total_collected
    )