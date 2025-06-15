import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from orders.models import Order
from decimal import Decimal


class Payment(models.Model):
    """
    Represents the overall payment process for a single Order.
    This acts as a container for one or more PaymentTransactions.
    """

    class PaymentStatus(models.TextChoices):
        UNPAID = "UNPAID", _("Unpaid")
        PARTIALLY_PAID = "PARTIALLY_PAID", _("Partially Paid")
        PAID = "PAID", _("Paid")
        REFUNDED = "REFUNDED", _("Refunded")
        PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED", _("Partially Refunded")
        PENDING = "PENDING", _("Pending")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(
        Order, on_delete=models.CASCADE, related_name="payment_details"
    )
    status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        help_text=_("The current status of the payment."),
    )
    total_amount_due = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("The total amount of the order at the time of payment initiation."),
    )
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    tip = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("The tip amount for this payment."),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Payment")
        verbose_name_plural = _("Payments")

    def __str__(self):
        return (
            f"Payment for Order {self.order.id} - Status: {self.get_status_display()}"
        )


class PaymentTransaction(models.Model):
    """
    Represents a single, specific payment attempt (e.g., one card swipe, one cash payment).
    """

    class TransactionStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SUCCESSFUL = "SUCCESSFUL", "Successful"
        FAILED = "FAILED", "Failed"
        REFUNDED = "REFUNDED", "Refunded"
        CANCELED = "CANCELED", "Canceled"

    class PaymentMethod(models.TextChoices):
        CASH = "CASH", _("Cash")
        CARD_TERMINAL = "CARD_TERMINAL", _("Card Terminal")
        CARD_ONLINE = "CARD_ONLINE", _("Card Online")
        GIFT_CARD = "GIFT_CARD", _("Gift Card")
        # Specific providers like Stripe, Clover, etc., will be handled by the strategy, not named here.

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(
        Payment, on_delete=models.CASCADE, related_name="transactions"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    status = models.CharField(
        max_length=20,
        choices=TransactionStatus.choices,
        default=TransactionStatus.PENDING,
    )

    # For external provider reference
    transaction_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Transaction ID from the payment provider (e.g., Stripe charge ID)",
    )
    provider_response = models.JSONField(
        blank=True,
        null=True,
        help_text="Full response from the payment provider for debugging",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Payment Transaction")
        verbose_name_plural = _("Payment Transactions")

    def __str__(self):
        return (
            f"Transaction {self.id} ({self.method}) for {self.amount} - {self.status}"
        )
