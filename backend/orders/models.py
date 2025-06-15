import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from products.models import Product
from users.models import User
from discounts.models import Discount

# from users.models import User  # For cashier relationship
# Temporarily commented out to resolve circular dependency / app creation issue.


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

    payment_in_progress = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Order")
        verbose_name_plural = _("Orders")

    def __str__(self):
        return f"Order {self.id} ({self.order_type}) - {self.status}"


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
        return f"{self.quantity} of {self.product.name} in Order {self.order.id}"

    @property
    def total_price(self):
        return self.quantity * self.price_at_sale
