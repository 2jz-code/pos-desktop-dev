import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from orders.models import Order
from decimal import Decimal
import re
from django.db.models import Max
from django.db import transaction


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

    payment_number = models.CharField(max_length=20, unique=True, blank=True, null=True)

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

    # --- Guest Session Fields ---
    guest_session_key = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text=_("Session key for guest payments"),
        db_index=True,
    )
    guest_payment_intent_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_("Stripe Payment Intent ID for guest payments"),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Payment")
        verbose_name_plural = _("Payments")

    def __str__(self):
        return f"Payment {self.payment_number or self.id} for Order {self.order.order_number or self.order.id} - {self.status}"

    @property
    def is_guest_payment(self):
        """Returns True if this is a guest payment."""
        return bool(self.guest_session_key)

    # --- ADD THIS SAVE METHOD AND HELPER FUNCTION ---
    def save(self, *args, **kwargs):
        if not self.payment_number:
            max_retries = 5
            for _ in range(max_retries):
                try:
                    self.payment_number = self._generate_sequential_payment_number()
                    super().save(*args, **kwargs)
                    break  # Break if save is successful
                except Exception as e:  # Catch potential IntegrityError on unique field
                    if (
                        "duplicate key value" in str(e).lower()
                        or "unique constraint failed" in str(e).lower()
                    ):
                        # Another process might have taken the number, retry
                        continue
                    else:
                        raise  # Re-raise if it's another type of error
            else:  # If loop finishes without breaking (max_retries reached)
                raise Exception(
                    "Failed to generate a unique payment number after multiple retries."
                )
        else:
            super().save(*args, **kwargs)

    def _generate_sequential_payment_number(self):
        """
        Generates the next sequential payment number.
        Looks for the highest existing numeric suffix and increments it.
        Formats as 'PAY-XXXXX' with leading zeros.
        """
        prefix = "PAY-"
        # Get the highest existing payment number that matches our pattern
        # Use a transaction.atomic block for better concurrency handling if needed
        with transaction.atomic():
            last_payment = (
                Payment.objects.select_for_update()
                .filter(payment_number__startswith=prefix)
                .order_by("-payment_number")
                .first()
            )

            current_sequential_number = 0
            if last_payment and last_payment.payment_number:
                # Extract the numeric part using regex
                match = re.match(
                    rf"^{re.escape(prefix)}(\d+)$", last_payment.payment_number
                )
                if match:
                    last_number = int(match.group(1))
                    current_sequential_number = last_number
                # If existing numbers don't follow the pattern, current_sequential_number remains 0

            next_number = current_sequential_number + 1
            # Format with leading zeros (e.g., 00001) for a fixed width
            # Adjust padding as needed, e.g., '06d' for PAY-000001
            padded_number = f"{next_number:05d}"

            return f"{prefix}{padded_number}"


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
    surcharge = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Surcharge applied to this specific transaction (e.g., card processing fee)."),
    )
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

    card_brand = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Card brand, e.g., Visa, Mastercard",
    )
    card_last4 = models.CharField(
        max_length=4,
        blank=True,
        null=True,
        help_text="The last 4 digits of the card number",
    )

    refunded_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="The amount of this transaction that has been refunded.",
    )
    refund_reason = models.TextField(
        blank=True, null=True, help_text="Reason for the refund."
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
