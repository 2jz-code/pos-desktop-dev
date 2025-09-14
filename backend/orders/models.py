import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from products.models import Product
from users.models import User
from customers.models import Customer
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
        DOORDASH = "DOORDASH", _("DoorDash")
        UBER_EATS = "UBER_EATS", _("Uber Eats")

    class PaymentStatus(models.TextChoices):
        UNPAID = "UNPAID", _("Unpaid")
        PARTIALLY_PAID = "PARTIALLY_PAID", _("Partially Paid")
        PAID = "PAID", _("Paid")
        REFUNDED = "REFUNDED", _("Refunded")
        PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED", _("Partially Refunded")

    class DiningPreference(models.TextChoices):
        DINE_IN = "DINE_IN", _("Dine In")
        TAKE_OUT = "TAKE_OUT", _("Take Out")

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
    dining_preference = models.CharField(
        max_length=10,
        choices=DiningPreference.choices,
        default=DiningPreference.TAKE_OUT,
        help_text="Whether the order is for dine-in or take-out"
    )

    # --- Relationships ---
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
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
    guest_first_name = models.CharField(
        max_length=150,
        blank=True,
        null=True,
        help_text=_("First name for guest orders"),
    )
    guest_last_name = models.CharField(
        max_length=150,
        blank=True,
        null=True,
        help_text=_("Last name for guest orders"),
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

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    # Email tracking
    confirmation_sent = models.BooleanField(
        default=False,
        help_text=_("Whether an order confirmation email has been sent for this order"),
    )

    legacy_id = models.IntegerField(unique=True, null=True, blank=True, db_index=True, help_text="The order ID from the old system.")

    class Meta:
        # Show newest orders first, with order_number as secondary sort for same timestamps
        ordering = ["-created_at", "order_number"]
        verbose_name = _("Order")
        verbose_name_plural = _("Orders")
        indexes = [
            models.Index(fields=['status'], name='order_stat_idx'),
            models.Index(fields=['order_type'], name='order_type_idx'),
            models.Index(fields=['payment_status'], name='order_pay_stat_idx'),
            models.Index(fields=['created_at'], name='order_created_idx'),
            models.Index(fields=['customer', 'status'], name='order_cust_stat_idx'),
            models.Index(fields=['guest_id', 'status'], name='order_guest_stat_idx'),
            models.Index(fields=['cashier'], name='order_cashier_idx'),
            models.Index(fields=['order_number'], name='order_num_idx'),
            # Performance-critical compound indexes
            models.Index(fields=['status', 'created_at'], name='order_stat_dt_idx'),
            models.Index(fields=['payment_status', 'status'], name='order_pay_st_st_idx'),
        ]
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
        """Returns the appropriate email, prioritizing form data over profile data."""
        # Prioritize guest_email if provided (could be form data from authenticated users)
        if self.guest_email:
            return self.guest_email
        # Fall back to customer profile email
        if self.customer:
            return self.customer.email
        return None

    @property
    def customer_phone(self):
        """Returns the appropriate phone, prioritizing form data over profile data."""
        # Prioritize guest_phone if provided (could be form data from authenticated users)
        if self.guest_phone:
            return self.guest_phone
        # Fall back to customer profile phone
        if self.customer and hasattr(self.customer, "phone_number"):
            return getattr(self.customer, "phone_number", None)
        return None

    @property
    def customer_display_name(self):
        """Returns the formatted customer name, prioritizing form data over profile data."""
        # Check if we have guest name fields (could be form data from authenticated or guest users)
        if self.guest_first_name or self.guest_last_name:
            first_name = self.guest_first_name or ""
            last_name = self.guest_last_name or ""
            full_name = f"{first_name} {last_name}".strip()

            if full_name:
                # If this is a guest order, add "(guest)" suffix
                if not self.customer:
                    return f"{full_name} (guest)"
                else:
                    # Authenticated user with form data - no suffix needed
                    return full_name

        # Fall back to authenticated user's profile data
        if self.customer:
            first_name = self.customer.first_name or ""
            last_name = self.customer.last_name or ""
            full_name = f"{first_name} {last_name}".strip()

            # Fallback to username or email if no first/last name
            if not full_name:
                return self.customer.username or self.customer.email
            return full_name

        # Final fallback for true guest orders with no name data
        return (
            f"{self.guest_email or 'Guest'} (guest)"
            if not self.customer
            else "Guest Customer"
        )

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

    @property
    def total_collected(self):
        """
        Returns the total amount collected from the related Payment.
        This includes amount paid, tips, and surcharges.
        """
        if hasattr(self, "payment_details") and self.payment_details:
            return self.payment_details.total_collected
        return 0.00

    @property
    def total_tips(self):
        """
        Returns the cumulative tip total from the related Payment.
        """
        if hasattr(self, "payment_details") and self.payment_details:
            return self.payment_details.total_tips
        return 0.00

    @property
    def amount_paid(self):
        """
        Returns the amount paid (excluding tips and surcharges) from the related Payment.
        """
        if hasattr(self, "payment_details") and self.payment_details:
            return self.payment_details.amount_paid
        return 0.00

    @property
    def payment_surcharges_total(self):
        """
        Returns the total surcharges collected from the related Payment.
        """
        if hasattr(self, "payment_details") and self.payment_details:
            return self.payment_details.total_surcharges
        return 0.00

    @property
    def total_with_tip(self):
        """
        Calculate the grand total including the tip from the associated payment.
        """
        total = self.grand_total
        # Add tips to the grand total
        if hasattr(self, "payment_details") and self.payment_details and self.payment_details.total_tips:
            total += self.payment_details.total_tips
        return total

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
            if not self._state.adding:
                self.updated_at = timezone.now()
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

    legacy_id = models.IntegerField(unique=True, null=True, blank=True, db_index=True, help_text="The order item ID from the old system.")
    
    # Kitchen printing tracking
    kitchen_printed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when this item was first sent to kitchen. Prevents duplicate printing.")
    )
    
    # Item variation tracking for better kitchen organization
    item_sequence = models.PositiveIntegerField(
        default=1,
        help_text=_("Sequential number for items of the same product (#1, #2, #3, etc.)")
    )
    variation_group = models.CharField(
        max_length=100,
        blank=True,
        help_text=_("Groups related items together (e.g., 'hummus', 'burger')")
    )
    kitchen_notes = models.TextField(
        blank=True,
        help_text=_("Special preparation instructions for kitchen staff")
    )

    class Meta:
        verbose_name = _("Order Item")
        verbose_name_plural = _("Order Items")
        ordering = ['variation_group', 'item_sequence']
        indexes = [
            models.Index(fields=['order'], name='item_order_idx'),
            models.Index(fields=['product'], name='item_product_idx'),
            models.Index(fields=['status'], name='item_stat_idx'),
            models.Index(fields=['kitchen_printed_at'], name='item_kitchen_dt_idx'),
            models.Index(fields=['variation_group', 'item_sequence'], name='item_var_seq_idx'),
        ]

    def __str__(self):
        base_str = f"{self.quantity} of {self.product.name}"
        if self.item_sequence > 1:
            base_str += f" (#{self.item_sequence})"
        return f"{base_str} in Order {self.order.order_number}"

    @property
    def total_price(self):
        return self.quantity * self.price_at_sale

class OrderItemModifier(models.Model):
    order_item = models.ForeignKey('OrderItem', on_delete=models.CASCADE, related_name='selected_modifiers_snapshot')
    
    modifier_set_name = models.CharField(max_length=100)
    option_name = models.CharField(max_length=100)
    price_at_sale = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.modifier_set_name}: {self.option_name} ({self.price_at_sale})"
