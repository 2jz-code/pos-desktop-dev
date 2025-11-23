# In desktop-combined/backend/discounts/models.py

from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal
from django.utils import timezone
from products.models import Product, Category
from core_backend.utils.archiving import SoftDeleteMixin
from tenant.managers import TenantSoftDeleteManager


class Discount(SoftDeleteMixin):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "PERCENTAGE", "Percentage"
        FIXED_AMOUNT = "FIXED_AMOUNT", "Fixed Amount"
        BUY_X_GET_Y = "BUY_X_GET_Y", "Buy X Get Y"  # --- NEW TYPE ---

    class DiscountScope(models.TextChoices):
        ORDER = "ORDER", "Entire Order"
        PRODUCT = "PRODUCT", "Specific Products"
        CATEGORY = "CATEGORY", "Specific Categories"

    # Multi-tenancy
    tenant = models.ForeignKey('tenant.Tenant', on_delete=models.CASCADE, related_name='discounts')

    # Name and code are unique per tenant
    name = models.CharField(max_length=255)
    code = models.CharField(
        max_length=50, null=True, blank=True, help_text="Optional code for manual discounts (unique per tenant)"
    )
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

    start_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="The date and time when the discount becomes active.",
    )
    end_date = models.DateTimeField(
        null=True, blank=True, help_text="The date and time when the discount expires."
    )

    # Timestamps
    updated_at = models.DateTimeField(auto_now=True)

    def is_currently_active(self):
        """Checks if the discount is active (not archived) and within its date range."""
        if not self.is_active:  # This comes from SoftDeleteMixin
            return False
        now = timezone.now()
        if self.start_date and now < self.start_date:
            return False
        if self.end_date and now > self.end_date:
            return False
        return True

    def clean(self):
        """Validate discount value based on type."""
        super().clean()

        # Skip validation for Buy X Get Y discounts (value not used)
        if self.type == self.DiscountType.BUY_X_GET_Y:
            return

        # Validate value is positive (not zero or negative)
        if self.value <= 0:
            raise ValidationError({
                'value': 'Discount value must be greater than zero.'
            })

        # Validate percentage discounts don't exceed 100%
        if self.type == self.DiscountType.PERCENTAGE and self.value > 100:
            raise ValidationError({
                'value': 'Percentage discount cannot exceed 100%.'
            })

    # Managers - use combined manager for tenant + soft delete
    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()  # Bypass tenant filter

    def __str__(self):
        return f"{self.name} ({self.get_type_display()} on {self.get_scope_display()})"

    class Meta:
        ordering = ["name"]
        constraints = [
            # Name must be unique per tenant
            models.UniqueConstraint(
                fields=['tenant', 'name'],
                name='unique_discount_name_per_tenant'
            ),
            # Code must be unique per tenant (if provided)
            models.UniqueConstraint(
                fields=['tenant', 'code'],
                name='unique_discount_code_per_tenant',
                condition=models.Q(code__isnull=False)
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'is_active', 'start_date', 'end_date']),
            models.Index(fields=['tenant', 'type', 'scope']),
            models.Index(fields=['tenant', 'code']),  # For discount code lookups
            models.Index(fields=['tenant', 'is_active', 'type']),
        ]
