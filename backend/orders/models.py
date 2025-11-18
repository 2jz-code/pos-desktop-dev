import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from products.models import Product
from users.models import User
from customers.models import Customer
from discounts.models import Discount
from tenant.managers import TenantManager
import random
import string
import re  # Add this import for regular expressions


class OrderDiscount(models.Model):
    """
    A through model to link a Discount to a specific Order, storing the
    calculated discount amount at the time of application.
    """

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='order_discounts'
    )
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

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        unique_together = ("order", "discount")
        indexes = [
            models.Index(fields=['tenant', 'order']),
        ]


class OrderAdjustment(models.Model):
    """
    Captures ad-hoc adjustments to orders (one-off discounts, price overrides, etc.)

    Provides full audit trail for all manual price modifications.
    Separate from predefined discounts (OrderDiscount) to avoid sparse nullable fields.
    """

    class AdjustmentType(models.TextChoices):
        ONE_OFF_DISCOUNT = 'ONE_OFF_DISCOUNT', _('One-Off Discount')
        PRICE_OVERRIDE = 'PRICE_OVERRIDE', _('Price Override')
        TAX_EXEMPT = 'TAX_EXEMPT', _('Tax Exempt')
        FEE_EXEMPT = 'FEE_EXEMPT', _('Fee Exempt')
        # Future extensibility: COMP, LOYALTY_CREDIT, DAMAGE_DISCOUNT, etc.

    class DiscountType(models.TextChoices):
        PERCENTAGE = 'PERCENTAGE', _('Percentage')
        FIXED = 'FIXED', _('Fixed Amount')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='order_adjustments'
    )

    order = models.ForeignKey(
        'Order',
        on_delete=models.CASCADE,
        related_name='adjustments',
        help_text=_("Order this adjustment applies to")
    )

    order_item = models.ForeignKey(
        'OrderItem',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='adjustments',
        help_text=_("Specific item (for price overrides). Null for order-level adjustments.")
    )

    adjustment_type = models.CharField(
        max_length=50,
        choices=AdjustmentType.choices,
        help_text=_("Type of adjustment")
    )

    # For one-off discounts
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        null=True,
        blank=True,
        help_text=_("Type of discount (percentage or fixed amount)")
    )

    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("Discount value (e.g., 15.00 for 15% or $15)")
    )

    # For price overrides
    original_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("Original price before override")
    )

    new_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("New overridden price")
    )

    # Calculated amount (result of adjustment)
    # Positive for increases, negative for decreases
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Calculated adjustment amount (negative for discounts, positive for increases)")
    )

    # Audit fields
    reason = models.TextField(
        help_text=_("Reason for this adjustment (for audit trail)")
    )

    applied_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='applied_adjustments',
        help_text=_("User who initiated this adjustment")
    )

    approved_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='approved_adjustments',
        help_text=_("Manager who approved this adjustment (null if no approval needed)")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("Order Adjustment")
        verbose_name_plural = _("Order Adjustments")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'order']),
            models.Index(fields=['tenant', 'order_item']),
            models.Index(fields=['tenant', 'adjustment_type']),
            models.Index(fields=['tenant', 'applied_by']),
        ]

    def clean(self):
        """
        Validate adjustment data integrity and business rules.
        """
        from django.core.exceptions import ValidationError
        errors = {}

        # Field requirements per adjustment type
        if self.adjustment_type == self.AdjustmentType.ONE_OFF_DISCOUNT:
            if not self.discount_type:
                errors['discount_type'] = _('Discount type is required for one-off discounts')
            if self.discount_value is None:
                errors['discount_value'] = _('Discount value is required for one-off discounts')
            # order_item is optional - None for order-level, set for item-level discounts

        elif self.adjustment_type == self.AdjustmentType.PRICE_OVERRIDE:
            if not self.order_item:
                errors['order_item'] = _('Order item is required for price overrides')
            if self.original_price is None:
                errors['original_price'] = _('Original price is required for price overrides')
            if self.new_price is None:
                errors['new_price'] = _('New price is required for price overrides')

        # Tenant consistency validation
        if self.order and self.tenant_id != self.order.tenant_id:
            errors['tenant'] = _('Adjustment tenant must match order tenant')

        if self.order_item:
            if self.order_item.order_id != self.order_id:
                errors['order_item'] = _('Order item must belong to the specified order')
            if self.order_item.tenant_id != self.tenant_id:
                errors['order_item'] = _('Order item tenant must match adjustment tenant')

        # Amount sanity checks
        if self.discount_type == self.DiscountType.PERCENTAGE:
            if self.discount_value is not None:
                if self.discount_value > 100:
                    errors['discount_value'] = _('Percentage discount cannot exceed 100%')
                if self.discount_value < 0:
                    errors['discount_value'] = _('Percentage discount cannot be negative')

        if self.discount_value is not None and self.discount_value < 0:
            errors['discount_value'] = _('Discount value cannot be negative')

        if self.original_price is not None and self.original_price < 0:
            errors['original_price'] = _('Original price cannot be negative')

        if self.new_price is not None and self.new_price < 0:
            errors['new_price'] = _('New price cannot be negative')

        # Validate amount matches calculated value (prevent arbitrary amounts)
        if self.adjustment_type == self.AdjustmentType.PRICE_OVERRIDE:
            if self.original_price is not None and self.new_price is not None and self.order_item:
                # Calculate expected amount for price override
                price_diff = self.new_price - self.original_price
                expected_amount = price_diff * self.order_item.quantity
                # Allow small rounding differences (0.01)
                if abs(self.amount - expected_amount) > Decimal('0.01'):
                    errors['amount'] = _(
                        f'Amount {self.amount} does not match calculated value {expected_amount} '
                        f'(new_price - original_price) * quantity'
                    )

        elif self.adjustment_type == self.AdjustmentType.ONE_OFF_DISCOUNT:
            if self.discount_type and self.discount_value is not None:
                # For percentage discounts, we can validate the amount is negative
                if self.discount_type == self.DiscountType.PERCENTAGE:
                    if self.amount >= 0:
                        errors['amount'] = _('One-off discount amount must be negative')

                    # Validate it's not more than 100% of applicable amount
                    if self.order_item:
                        # Item-level: Check against item total
                        item_total = (self.order_item.price_at_sale * self.order_item.quantity) or Decimal('0.00')
                        max_discount = -item_total
                        if self.amount < max_discount:
                            errors['amount'] = _(
                                f'Discount amount {self.amount} exceeds item total {item_total}'
                            )
                    elif self.order:
                        # Order-level: Check against order subtotal
                        max_discount = -(self.order.subtotal or Decimal('0.00'))
                        if self.amount < max_discount:
                            errors['amount'] = _(
                                f'Discount amount {self.amount} exceeds order subtotal {self.order.subtotal}'
                            )
                elif self.discount_type == self.DiscountType.FIXED:
                    # Fixed discounts should also be negative
                    if self.amount >= 0:
                        errors['amount'] = _('One-off discount amount must be negative')
                    # Validate it matches the discount value
                    expected_amount = -self.discount_value
                    if abs(self.amount - expected_amount) > Decimal('0.01'):
                        errors['amount'] = _(
                            f'Amount {self.amount} does not match discount value -{self.discount_value}'
                        )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """
        Override save to call full_clean() and enforce validation.
        """
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_adjustment_type_display()} on Order {self.order.order_number} by {self.applied_by.email}"


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
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='orders'
    )
    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.PROTECT,
        related_name='orders',
        null=True,  # Nullable initially for migration, will be required after backfill
        blank=True,
        help_text='Store location where this order was placed'
    )
    status = models.CharField(
        max_length=10, choices=OrderStatus.choices, default=OrderStatus.PENDING
    )

    # order_number as CharField
    order_number = models.CharField(max_length=20, blank=True, null=True)

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
    total_adjustments_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text=_("Total of all order adjustments (one-off discounts, price overrides). Can be positive or negative.")
    )
    surcharges_total = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    tax_total = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        editable=False,
        db_index=True,
        help_text="Timestamp when order was marked as COMPLETED. Use this for daily reports and revenue tracking."
    )

    # Email tracking
    confirmation_sent = models.BooleanField(
        default=False,
        help_text=_("Whether an order confirmation email has been sent for this order"),
    )

    legacy_id = models.IntegerField(unique=True, null=True, blank=True, db_index=True, help_text="The order ID from the old system.")

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        # Show newest orders first, with order_number as secondary sort for same timestamps
        ordering = ["-created_at", "order_number"]
        verbose_name = _("Order")
        verbose_name_plural = _("Orders")
        indexes = [
            models.Index(fields=['tenant', 'status'], name='order_tenant_stat_idx'),
            models.Index(fields=['tenant', 'order_type'], name='order_tenant_type_idx'),
            models.Index(fields=['tenant', 'payment_status'], name='order_tenant_pay_stat_idx'),
            models.Index(fields=['tenant', 'created_at'], name='order_tenant_created_idx'),
            models.Index(fields=['tenant', 'customer', 'status'], name='order_ten_cust_stat_idx'),
            models.Index(fields=['tenant', 'guest_id', 'status'], name='order_ten_guest_stat_idx'),
            models.Index(fields=['tenant', 'cashier'], name='order_tenant_cashier_idx'),
            models.Index(fields=['tenant', 'store_location', 'order_number'], name='order_loc_num_idx'),
            # Performance-critical compound indexes
            models.Index(fields=['tenant', 'status', 'created_at'], name='order_ten_stat_dt_idx'),
            models.Index(fields=['tenant', 'payment_status', 'status'], name='order_ten_pay_st_st_idx'),
            models.Index(fields=['tenant', 'store_location', '-created_at'], name='order_loc_created_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "store_location", "order_number"],
                condition=models.Q(order_number__isnull=False),
                name="unique_order_number_per_location",
            ),
            models.UniqueConstraint(
                fields=["tenant", "guest_id"],
                condition=models.Q(status="PENDING", guest_id__isnull=False),
                name="unique_guest_pending_order_per_tenant",
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
        Generates the next sequential order number PER LOCATION.
        Each location has independent numbering starting from 1.

        CRITICAL: Both tenant AND store_location filtering for proper isolation.

        Architecture:
        - Tenant isolation: Orders belong to one tenant (security boundary)
        - Location scoping: Each location has independent sequence (operational boundary)

        Example:
            Downtown:  ORD-00001, ORD-00002, ORD-00003
            Airport:   ORD-00001, ORD-00002, ORD-00003
            (Same tenant, different locations, independent sequences)

        Benefits:
        - Clean sequences per location (no gaps)
        - Matches operational reality (staff work at one location)
        - Aligns with location-separated reports
        - Natural fit for terminal context (terminals are location-bound)
        """
        prefix = "ORD-"
        # Get the highest existing order number for THIS TENANT + LOCATION
        last_order = (
            Order.objects.filter(
                tenant=self.tenant,           # ← Tenant isolation (security)
                store_location=self.store_location,  # ← Location scoping (operations)
                order_number__startswith=prefix
            )
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
            # No existing order numbers with the prefix at this location, start from 1
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

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='order_items'
    )
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="order_items",
        null=True, blank=True,  # Make nullable for custom items
        help_text=_("Product reference. Null for custom items.")
    )
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=10, choices=ItemStatus.choices, default=ItemStatus.PENDING
    )
    notes = models.TextField(
        blank=True, help_text=_("Customer notes, e.g., 'no onions'")
    )

    # Custom item fields
    custom_name = models.CharField(
        max_length=200, blank=True,
        help_text=_("Name for custom items (when product is null)")
    )
    custom_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text=_("Price for custom items (when product is null)")
    )

    # Price snapshot
    price_at_sale = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Price of the product at the time of sale."),
    )

    # Tax amount per line item (for precise refund allocation)
    tax_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_(
            "Tax amount calculated for this line item at sale time. "
            "Used for per-line refund allocation to prevent penny drift. "
            "NULL for legacy orders (pre-migration) - refund logic uses deterministic fallback."
        ),
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

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("Order Item")
        verbose_name_plural = _("Order Items")
        ordering = ['variation_group', 'item_sequence']
        indexes = [
            models.Index(fields=['tenant', 'order'], name='item_tenant_order_idx'),
            models.Index(fields=['tenant', 'product'], name='item_tenant_product_idx'),
            models.Index(fields=['tenant', 'status'], name='item_tenant_stat_idx'),
            models.Index(fields=['tenant', 'kitchen_printed_at'], name='item_tenant_kitchen_dt_idx'),
        ]

    def __str__(self):
        item_name = self.custom_name if not self.product else self.product.name
        base_str = f"{self.quantity} of {item_name}"
        if self.item_sequence > 1:
            base_str += f" (#{self.item_sequence})"
        return f"{base_str} in Order {self.order.order_number}"

    @property
    def total_price(self):
        return self.quantity * self.price_at_sale

class OrderItemModifier(models.Model):
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='order_item_modifiers'
    )
    order_item = models.ForeignKey('OrderItem', on_delete=models.CASCADE, related_name='selected_modifiers_snapshot')

    modifier_set_name = models.CharField(max_length=100)
    option_name = models.CharField(max_length=100)
    price_at_sale = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'order_item']),
        ]

    def __str__(self):
        return f"{self.modifier_set_name}: {self.option_name} ({self.price_at_sale})"
