import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from products.models import Product
from users.models import User
from discounts.models import Discount
import random
import string
import re  # Add this import for regular expressions


class OrderDiscount(models.Model):
    """
    A through model to link a Discount to a specific Order, storing the
    calculated discount amount at the time of application.
    """

    order = models.ForeignKey(
        "Order", on_delete=models.CASCADE, related_name="applied_discounts"
    )
    discount = models.ForeignKey(Discount, on_delete=models.PROTECT)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="The calculated discount amount for this specific application.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("order", "discount")


class Order(models.Model):
    # --- Status Fields ---
    class OrderStatus(models.TextChoices):
        PENDING = "PENDING", _("Pending")  # Actively being built
        HOLD = "HOLD", _("Hold")  # Saved for later completion
        COMPLETED = "COMPLETED", _("Completed")  # Successfully paid for
        CANCELLED = "CANCELLED", _(
            "Cancelled"
        )  # Customer changed their mind before payment
        VOID = "VOID", _(
            "Void"
        )  # An error was made, needs to be nullified post-completion

    class OrderType(models.TextChoices):
        POS = "POS", _("Point of Sale")
        WEB = "WEB", _("Website")
        APP = "APP", _("Customer App")
        DELIVERY = "DELIVERY", _("Delivery Platform")

    class PaymentStatus(models.TextChoices):
        UNPAID = "UNPAID", _("Unpaid")
        PARTIALLY_PAID = "PARTIALLY_PAID", _("Partially Paid")
        PAID = "PAID", _("Paid")
        REFUNDED = "REFUNDED", _("Refunded")
        PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED", _("Partially Refunded")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(
        max_length=10, choices=OrderStatus.choices, default=OrderStatus.PENDING
    )

    # order_number as CharField
    order_number = models.CharField(max_length=20, unique=True, blank=True, null=True)

    order_type = models.CharField(
        max_length=10, choices=OrderType.choices, default=OrderType.POS
    )
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID
    )

    # --- Relationships ---
    customer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders_as_customer",
    )
    cashier = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders_as_cashier",
    )
    discounts = models.ManyToManyField(
        Discount, through="OrderDiscount", blank=True, related_name="orders"
    )

    # --- Guest User Fields ---
    guest_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text=_("Session-based identifier for guest users"),
        db_index=True,
    )
    guest_email = models.EmailField(
        blank=True,
        null=True,
        help_text=_("Email address for guest orders"),
    )
    guest_phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text=_("Phone number for guest orders"),
    )

    # --- Financial Fields ---
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_discounts_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    surcharges_total = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    tax_total = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Consider ordering by `created_at` or `pk` for consistent numbering if `order_number` is null
        ordering = ["order_number", "created_at"]
        verbose_name = _("Order")
        verbose_name_plural = _("Orders")
        constraints = [
            models.UniqueConstraint(
                fields=["guest_id"],
                condition=models.Q(status="PENDING", guest_id__isnull=False),
                name="unique_guest_pending_order",
            ),
        ]

    def __str__(self):
        return (
            f"Order {self.order_number or self.pk} ({self.order_type}) - {self.status}"
        )

    @property
    def is_guest_order(self):
        """Returns True if this is a guest order (has guest_id but no customer)."""
        return self.guest_id and not self.customer

    @property
    def customer_email(self):
        """Returns the appropriate email whether for guest or authenticated customer."""
        if self.customer:
            return self.customer.email
        return self.guest_email

    @property
    def customer_phone(self):
        """Returns the appropriate phone whether for guest or authenticated customer."""
        if self.customer and hasattr(self.customer, "phone"):
            return getattr(self.customer, "phone", None)
        return self.guest_phone

    @property
    def payment_in_progress_derived(self):
        """
        Derived property that determines if payment is in progress based on Payment.status.
        This replaces the deprecated payment_in_progress field.
        """
        if hasattr(self, "payment_details") and self.payment_details:
            # Import locally to avoid circular imports
            from payments.models import Payment

            return self.payment_details.status == Payment.PaymentStatus.PENDING
        return False

    def save(self, *args, **kwargs):
        # Generate order_number only if it's not already set
        if not self.order_number:
            max_retries = 5  # Prevent infinite loop in extreme race conditions
            for _ in range(max_retries):
                try:
                    self.order_number = self._generate_sequential_order_number()
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
                    "Failed to generate a unique order number after multiple retries."
                )
        else:
            super().save(*args, **kwargs)

    def _generate_sequential_order_number(self):
        """
        Generates the next sequential order number.
        Looks for the highest existing numeric suffix and increments it.
        Formats as 'ORD-XXXXX' with leading zeros.
        """
        prefix = "ORD-"
        # Get the highest existing order number that matches our pattern
        last_order = (
            Order.objects.filter(order_number__startswith=prefix)
            .order_by("-order_number")
            .first()
        )

        if last_order and last_order.order_number:
            # Extract the numeric part using regex
            match = re.match(rf"^{re.escape(prefix)}(\d+)$", last_order.order_number)
            if match:
                last_number = int(match.group(1))
                next_number = last_number + 1
            else:
                # If existing numbers don't follow the pattern, start from 1
                next_number = 1
        else:
            # No existing order numbers with the prefix, start from 1
            next_number = 1

        # Format with leading zeros (e.g., 00001) for a fixed width
        # Adjust the padding (5 in this case) based on your expected maximum order number.
        # e.g., if you expect up to 999,999 orders, use 6.
        padded_number = f"{next_number:05d}"  # Ensures 5 digits, e.g., 1 -> "00001"
        return f"{prefix}{padded_number}"


class OrderItem(models.Model):
    class ItemStatus(models.TextChoices):
        PENDING = "PENDING", _("Pending")
        SENT_TO_KITCHEN = "SENT", _("Sent to Kitchen")
        PREPARING = "PREPARING", _("Preparing")
        READY = "READY", _("Ready for Pickup")
        SERVED = "SERVED", _("Served")

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="order_items"
    )
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=10, choices=ItemStatus.choices, default=ItemStatus.PENDING
    )
    notes = models.TextField(
        blank=True, help_text=_("Customer notes, e.g., 'no onions'")
    )

    # Price snapshot
    price_at_sale = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Price of the product at the time of sale."),
    )

    class Meta:
        verbose_name = _("Order Item")
        verbose_name_plural = _("Order Items")

    def __str__(self):
        return (
            f"{self.quantity} of {self.product.name} in Order {self.order.order_number}"
        )

    @property
    def total_price(self):
        return self.quantity * self.price_at_sale
