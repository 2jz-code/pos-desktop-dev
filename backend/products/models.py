from django.db import models
from django.utils.translation import gettext_lazy as _
from mptt.models import MPTTModel, TreeForeignKey


class Category(MPTTModel):
    name = models.CharField(
        max_length=100, unique=True, help_text=_("Name of the product category.")
    )
    description = models.TextField(
        blank=True, help_text=_("Description of the category.")
    )
    parent = TreeForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        help_text=_("Parent category for creating a hierarchy."),
    )
    order = models.IntegerField(
        default=0,
        help_text=_("Display order for this category. Lower numbers appear first."),
    )
    is_public = models.BooleanField(
        default=True,
        help_text=_("Whether this category and its products are publicly visible on the website."),
    )

    class MPTTMeta:
        order_insertion_by = ["order", "name"]

    class Meta:
        verbose_name = _("Category")
        verbose_name_plural = _("Categories")
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class Tax(models.Model):
    name = models.CharField(
        max_length=50,
        unique=True,
        help_text=_("Name of the tax, e.g., 'VAT' or 'Sales Tax'."),
    )
    rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text=_("Tax rate in percentage, e.g., 8.25 for 8.25%."),
    )

    class Meta:
        verbose_name = _("Tax")
        verbose_name_plural = _("Taxes")

    def __str__(self):
        return f"{self.name} ({self.rate}%)"


class ProductType(models.Model):
    name = models.CharField(
        max_length=100, unique=True, help_text=_("Name of the product type.")
    )
    description = models.TextField(
        blank=True, help_text=_("Description of the product type.")
    )

    class Meta:
        verbose_name = _("Product Type")
        verbose_name_plural = _("Product Types")

    def __str__(self):
        return self.name


class Product(models.Model):
    product_type = models.ForeignKey(
        ProductType,
        on_delete=models.PROTECT,
        related_name="products",
        help_text=_("The type of product."),
        default=1,
    )
    name = models.CharField(max_length=200, help_text=_("Name of the product."))
    description = models.TextField(
        blank=True, help_text=_("Detailed description of the product.")
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("The selling price of the product."),
    )
    category = models.ForeignKey(
        Category,
        related_name="products",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    taxes = models.ManyToManyField(
        Tax,
        blank=True,
        help_text=_("Product-specific taxes. General taxes are handled in Orders."),
    )
    is_active = models.BooleanField(
        default=True, help_text=_("Is this product available for sale?")
    )
    is_public = models.BooleanField(
        default=True,
        help_text=_("Whether this product is publicly visible. Note: The parent category must also be public."),
    )
    image = models.ImageField(
        upload_to="products/",
        null=True,
        blank=True,
        help_text="The processed WebP image.",
    )
    original_filename = models.CharField(max_length=255, blank=True, null=True)
    track_inventory = models.BooleanField(
        default=False,
        help_text=_(
            "Whether to track inventory levels for this product. When enabled, inventory records will be created and stock will be monitored."
        ),
    )
    barcode = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text=_("Product barcode for scanning"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    legacy_id = models.IntegerField(unique=True, null=True, blank=True, db_index=True, help_text="The product ID from the old system.")
    # The ForeignKey to Recipe will be added later when we create the Inventory app.

    class Meta:
        verbose_name = _("Product")
        verbose_name_plural = _("Products")
        ordering = ["name"]

    def __str__(self):
        return self.name
