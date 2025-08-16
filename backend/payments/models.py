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
    total_tips = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Total tips collected across all transactions for this payment."),
    )
    total_surcharges = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Total surcharges collected across all transactions."),
    )
    total_collected = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_(
            "The grand total collected, including amount paid, tips, and surcharges."
        ),
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

    legacy_id = models.IntegerField(
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="The payment ID from the old system.",
    )

    created_at = models.DateTimeField(auto_now_add=False, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=False, blank=True, null=True)

    class Meta:
        ordering = ["-created_at", "payment_number"]
        verbose_name = _("Payment")
        verbose_name_plural = _("Payments")
        indexes = [
            models.Index(fields=["status"], name="payment_status_idx"),
            models.Index(fields=["order", "status"], name="payment_order_status_idx"),
            models.Index(fields=["created_at"], name="payment_created_at_idx"),
            models.Index(fields=["order"], name="payment_order_idx"),
            models.Index(fields=["payment_number"], name="payment_number_idx"),
        ]

    def __str__(self):
        return f"Payment {self.payment_number or self.id} for Order {self.order.order_number or self.order.id} - {self.status}"

    @property
    def is_guest_payment(self):
        """Returns True if this is a guest payment."""
        return bool(self.guest_session_key)

    # --- ADD THIS SAVE METHOD AND HELPER FUNCTION ---
    def save(self, *args, **kwargs):
        from django.utils import timezone

        # Auto-set created_at and updated_at if not provided
        if not self.created_at:
            self.created_at = timezone.now()
        if not self.updated_at:
            self.updated_at = timezone.now()

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
    tip = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    surcharge = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_(
            "Surcharge applied to this specific transaction (e.g., card processing fee)."
        ),
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

    legacy_id = models.IntegerField(
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="The transaction ID from the old system.",
    )

    created_at = models.DateTimeField(auto_now_add=False, blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Payment Transaction")
        verbose_name_plural = _("Payment Transactions")
        indexes = [
            models.Index(fields=['payment']),
            models.Index(fields=['method']),
            models.Index(fields=['status']),
            models.Index(fields=['transaction_id']),
            models.Index(fields=['created_at']),
            models.Index(fields=['payment', 'status'])
        ]

    def save(self, *args, **kwargs):
        # Auto-set created_at if not provided (like auto_now_add but allows override)
        if not self.created_at:
            from django.utils import timezone

            self.created_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"Transaction {self.id} ({self.method}) for {self.amount} - {self.status}"
        )


class GiftCard(models.Model):
    """
    Represents a gift card that can be used for payments.
    """

    class GiftCardStatus(models.TextChoices):
        ACTIVE = "ACTIVE", _("Active")
        INACTIVE = "INACTIVE", _("Inactive")
        EXPIRED = "EXPIRED", _("Expired")
        REDEEMED = "REDEEMED", _("Fully Redeemed")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text=_("Unique gift card code"),
        db_index=True,
    )
    original_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Original balance when the gift card was created"),
    )
    current_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Current remaining balance on the gift card"),
    )
    status = models.CharField(
        max_length=20,
        choices=GiftCardStatus.choices,
        default=GiftCardStatus.ACTIVE,
        help_text=_("Current status of the gift card"),
    )
    issued_date = models.DateTimeField(
        auto_now_add=True,
        help_text=_("Date when the gift card was issued"),
    )
    expiry_date = models.DateTimeField(
        blank=True,
        null=True,
        help_text=_("Optional expiry date for the gift card"),
    )
    last_used_date = models.DateTimeField(
        blank=True,
        null=True,
        help_text=_("Last date when this gift card was used"),
    )
    notes = models.TextField(
        blank=True,
        help_text=_("Optional notes about the gift card"),
    )

    created_at = models.DateTimeField(auto_now_add=False, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=False, blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Gift Card")
        verbose_name_plural = _("Gift Cards")
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["status"]),
            models.Index(fields=['current_balance']),
            models.Index(fields=['expiry_date']),
            models.Index(fields=['status', 'current_balance']),
        ]

    def __str__(self):
        return f"Gift Card {self.code} - ${self.current_balance} ({self.status})"

    def save(self, *args, **kwargs):
        # Set current_balance to original_balance if it's a new instance
        if not self.pk and self.current_balance is None:
            self.current_balance = self.original_balance

        # Update status based on balance
        if self.current_balance <= 0:
            self.status = self.GiftCardStatus.REDEEMED
        elif self.status == self.GiftCardStatus.REDEEMED and self.current_balance > 0:
            self.status = self.GiftCardStatus.ACTIVE

        super().save(*args, **kwargs)

    @property
    def is_valid(self):
        """Check if the gift card is valid for use"""
        from django.utils import timezone

        if self.status != self.GiftCardStatus.ACTIVE:
            return False

        if self.current_balance <= 0:
            return False

        if self.expiry_date and self.expiry_date < timezone.now():
            return False

        return True

    def can_pay_amount(self, amount):
        """Check if this gift card can pay for the given amount"""
        return self.is_valid and self.current_balance >= amount

    def use_amount(self, amount):
        """
        Use the specified amount from this gift card.
        Returns the actual amount used (may be less than requested if insufficient balance).
        """
        if not self.is_valid:
            return Decimal("0.00")

        amount_to_use = min(amount, self.current_balance)
        self.current_balance -= amount_to_use

        from django.utils import timezone

        self.last_used_date = timezone.now()

        self.save()
        return amount_to_use
