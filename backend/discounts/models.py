# In desktop-combined/backend/discounts/models.py

from django.db import models
from decimal import Decimal
from django.utils import timezone
from products.models import Product, Category


class Discount(models.Model):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "PERCENTAGE", "Percentage"
        FIXED_AMOUNT = "FIXED_AMOUNT", "Fixed Amount"
        BUY_X_GET_Y = "BUY_X_GET_Y", "Buy X Get Y"  # --- NEW TYPE ---

    class DiscountScope(models.TextChoices):
        ORDER = "ORDER", "Entire Order"
        PRODUCT = "PRODUCT", "Specific Products"
        CATEGORY = "CATEGORY", "Specific Categories"

    name = models.CharField(max_length=255, unique=True)
    type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
    )
    scope = models.CharField(
        max_length=20,
        choices=DiscountScope.choices,
        default=DiscountScope.ORDER,
    )
    value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="The value of the discount (percentage or fixed amount). Not used for BOGO.",
    )

    min_purchase_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="The minimum subtotal required for the discount to apply.",
    )

    buy_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="For 'Buy X Get Y' discounts, the quantity of items the customer must buy (X).",
    )
    get_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="For 'Buy X Get Y' discounts, the quantity of items the customer gets for free (Y).",
    )
    # For Product/Category specific discounts
    applicable_products = models.ManyToManyField(Product, blank=True)
    applicable_categories = models.ManyToManyField(Category, blank=True)

    is_active = models.BooleanField(default=True)
    start_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="The date and time when the discount becomes active.",
    )
    end_date = models.DateTimeField(
        null=True, blank=True, help_text="The date and time when the discount expires."
    )

    def is_currently_active(self):
        """Checks if the discount is active and within its date range."""
        if not self.is_active:
            return False
        now = timezone.now()
        if self.start_date and now < self.start_date:
            return False
        if self.end_date and now > self.end_date:
            return False
        return True

    def __str__(self):
        return f"{self.name} ({self.get_type_display()} on {self.get_scope_display()})"

    class Meta:
        ordering = ["name"]
