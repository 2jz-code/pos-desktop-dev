from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.contrib.auth import get_user_model
from mptt.models import MPTTModel, TreeForeignKey
from core_backend.utils.archiving import SoftDeleteMixin


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
        help_text=_(
            "Whether this category and its products are publicly visible on the website."
        ),
    )
    
    # Archiving fields (manually added since we can't inherit from SoftDeleteMixin due to MPTT)
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Designates whether this record is active. "
                  "Inactive records are considered archived/soft-deleted."
    )
    
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when this record was archived."
    )
    
    archived_by = models.ForeignKey(
        get_user_model(),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products_category_archived",
        help_text="User who archived this record."
    )

    # Use custom manager that combines MPTT with archiving
    from .managers import CategoryManager
    objects = CategoryManager()

    class MPTTMeta:
        order_insertion_by = ["order", "name"]

    class Meta:
        verbose_name = _("Category")
        verbose_name_plural = _("Categories")
        ordering = ["order", "name"]

    def __str__(self):
        return self.name
    
    def archive(self, archived_by=None, force=False, handle_products='set_null'):
        """
        Archive (soft delete) this category.
        
        Args:
            archived_by: User instance who performed the archiving
            force: Whether to bypass dependency validation
            handle_products: How to handle dependent products ('set_null', 'archive')
        
        Raises:
            ValueError: If category has dependent products and force=False
        """
        from .dependency_service import DependencyValidationService
        
        if not force:
            validation = DependencyValidationService.validate_category_archiving(self, force=False)
            if not validation['can_archive']:
                raise ValueError(f"Cannot archive category: {'; '.join(validation['warnings'])}")
        
        # Handle dependent products if specified
        if handle_products == 'archive':
            dependent_products = self.products.filter(is_active=True)
            for product in dependent_products:
                product.archive(archived_by=archived_by)
        elif handle_products == 'set_null':
            # Set category to None for all dependent products
            self.products.filter(is_active=True).update(category=None)
        # 'skip' means dependency handling was done externally
        
        self.is_active = False
        self.archived_at = timezone.now()
        if archived_by:
            self.archived_by = archived_by
        self.save(update_fields=['is_active', 'archived_at', 'archived_by'])
    
    def unarchive(self):
        """
        Unarchive (restore) this category.
        """
        self.is_active = True
        self.archived_at = None
        self.archived_by = None
        self.save(update_fields=['is_active', 'archived_at', 'archived_by'])
    
    @property
    def is_archived(self):
        """Return True if this category is archived."""
        return not self.is_active
    
    def delete(self, using=None, keep_parents=False):
        """
        Override delete to perform soft delete instead.
        
        To perform a hard delete, use force_delete() method.
        """
        self.archive()
    
    def force_delete(self, using=None, keep_parents=False):
        """
        Perform actual hard delete of the category.
        Use with caution - this permanently removes data.
        """
        super().delete(using=using, keep_parents=keep_parents)


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


class ProductType(SoftDeleteMixin):
    name = models.CharField(
        max_length=100, unique=True, help_text=_("Name of the product type.")
    )
    description = models.TextField(
        blank=True, help_text=_("Description of the product type.")
    )

    class InventoryBehavior(models.TextChoices):
        NONE = "NONE", _("No Tracking")
        QUANTITY = "QUANTITY", _("Track Quantity")
        RECIPE = "RECIPE", _("Recipe Based")

    class StockEnforcement(models.TextChoices):
        IGNORE = "IGNORE", _("Ignore (never block)")
        WARN = "WARN", _("Warn only")
        BLOCK = "BLOCK", _("Block when insufficient")

    class PricingMethod(models.TextChoices):
        FIXED = "FIXED", _("Fixed Price")
        COST_PLUS = "COST_PLUS", _("Cost Plus Markup")

    # Inventory policy
    inventory_behavior = models.CharField(
        max_length=16,
        choices=InventoryBehavior.choices,
        default=InventoryBehavior.QUANTITY,
        help_text=_("How inventory is tracked for this type."),
    )
    stock_enforcement = models.CharField(
        max_length=8,
        choices=StockEnforcement.choices,
        default=StockEnforcement.BLOCK,
        help_text=_("What to do when stock is insufficient."),
    )
    allow_negative_stock = models.BooleanField(
        default=False,
        help_text=_("Allow sales below zero stock (never blocks)."),
    )

    # Tax defaults
    default_taxes = models.ManyToManyField(
        'Tax', blank=True, related_name='default_for_product_types',
        help_text=_("Default taxes applied when product has none."),
    )
    tax_inclusive = models.BooleanField(
        default=False,
        help_text=_("Prices shown/entered include tax by default."),
    )

    # Pricing
    pricing_method = models.CharField(
        max_length=16,
        choices=PricingMethod.choices,
        default=PricingMethod.FIXED,
        help_text=_("How price should be calculated."),
    )
    default_markup_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text=_("Default markup percent for COST_PLUS pricing."),
    )


    # Prep metadata (kept simple; routing stays in Category)
    standard_prep_minutes = models.PositiveIntegerField(
        default=10,
        help_text=_("Typical preparation time in minutes."),
    )

    class Meta:
        verbose_name = _("Product Type")
        verbose_name_plural = _("Product Types")

    def __str__(self):
        return self.name
    
    def archive(self, archived_by=None, force=False):
        """
        Archive (soft delete) this product type.
        
        Args:
            archived_by: User instance who performed the archiving
            force: Whether to bypass dependency validation (currently not supported)
        
        Raises:
            ValueError: If product type has dependent products
        """
        from .dependency_service import DependencyValidationService
        
        validation = DependencyValidationService.validate_product_type_archiving(self, force=force)
        if not validation['can_archive']:
            raise ValueError(f"Cannot archive product type: {'; '.join(validation['warnings'])}")
        
        # Call parent archive method
        super().archive(archived_by=archived_by)


class Product(SoftDeleteMixin):
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
        help_text=_("Product category. Leave blank for uncategorized products."),
    )
    taxes = models.ManyToManyField(
        Tax,
        blank=True,
        help_text=_("Product-specific taxes. General taxes are handled in Orders."),
    )
    modifier_sets = models.ManyToManyField(
        'ModifierSet', through="ProductModifierSet", related_name="products", blank=True
    )
    # is_active is now provided by SoftDeleteMixin
    is_public = models.BooleanField(
        default=True,
        help_text=_(
            "Whether this product is publicly visible. Note: The parent category must also be public."
        ),
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
    has_modifiers = models.BooleanField(
        default=False,
        help_text=_("Whether this product has modifier sets configured."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    legacy_id = models.IntegerField(
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="The product ID from the old system.",
    )
    # The ForeignKey to Recipe will be added later when we create the Inventory app.

    class Meta:
        verbose_name = _("Product")
        verbose_name_plural = _("Products")
        ordering = ["name"]
        indexes = [
            models.Index(fields=['is_public'], name='product_is_public_idx'),
            models.Index(fields=['track_inventory'], name='product_track_inventory_idx'),
            models.Index(fields=['category'], name='product_category_idx'),
            models.Index(fields=['barcode'], name='product_barcode_idx'),
            # Performance-critical indexes
            models.Index(fields=['category', 'is_active'], name='product_category_active_idx'),
            models.Index(fields=['name'], name='product_name_idx'),
            models.Index(fields=['product_type']),
            models.Index(fields=['price']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return self.name
    
    @property
    def category_display_name(self):
        """Return category name or 'Uncategorized' if category is None."""
        return self.category.name if self.category else "Uncategorized"
    
    @property
    def is_uncategorized(self):
        """Return True if product has no category assigned."""
        return self.category is None


class ModifierSet(models.Model):
    class SelectionType(models.TextChoices):
        SINGLE = "SINGLE", _("Single Choice")
        MULTIPLE = "MULTIPLE", _("Multiple Choices")

    name = models.CharField(
        max_length=100, help_text=_("Customer-facing name, e.g., 'Choose your size'")
    )
    internal_name = models.CharField(
        max_length=100,
        unique=True,
        help_text=_("Internal name for easy reference, e.g., 'drink-size'"),
    )
    selection_type = models.CharField(
        max_length=10, choices=SelectionType.choices, default=SelectionType.SINGLE
    )

    min_selections = models.PositiveIntegerField(
        default=0, help_text=_("Minimum required selections (0 for optional)")
    )
    max_selections = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=_("Maximum allowed selections (null for unlimited)"),
    )

    triggered_by_option = models.ForeignKey(
        "ModifierOption",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggers_modifier_sets",
        help_text=_(
            "If set, this group will only appear when the selected option is chosen."
        ),
    )

    def __str__(self):
        return self.name


class ModifierOption(models.Model):
    modifier_set = models.ForeignKey(
        ModifierSet, on_delete=models.CASCADE, related_name="options"
    )
    name = models.CharField(max_length=100)
    price_delta = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text=_("The amount to add or subtract from the base product price."),
    )
    display_order = models.PositiveIntegerField(default=0)
    is_product_specific = models.BooleanField(
        default=False,
        help_text=_("Whether this option is specific to certain products or available globally."),
    )

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = ("modifier_set", "name")

    def __str__(self):
        return f"{self.modifier_set.name} - {self.name}"


class ProductSpecificOption(models.Model):
    product_modifier_set = models.ForeignKey(
        "ProductModifierSet", on_delete=models.CASCADE
    )
    modifier_option = models.ForeignKey(ModifierOption, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("product_modifier_set", "modifier_option")


class ProductModifierSet(models.Model):
    product = models.ForeignKey(
        "Product", on_delete=models.CASCADE, related_name="product_modifier_sets"
    )
    modifier_set = models.ForeignKey(
        ModifierSet, on_delete=models.CASCADE, related_name="product_modifier_sets"
    )

    display_order = models.PositiveIntegerField(
        default=0, help_text=_("The order this modifier set appears for this product.")
    )
    is_required_override = models.BooleanField(
        null=True,
        blank=True,
        help_text=_(
            "Override the 'min_selections' rule for this product. True makes it required."
        ),
    )

    hidden_options = models.ManyToManyField(
        ModifierOption,
        blank=True,
        related_name="hidden_in_product_sets",
        help_text=_("Hide specific options from this set for this product only."),
    )

    extra_options = models.ManyToManyField(
        ModifierOption,
        through=ProductSpecificOption,
        related_name="extra_in_product_sets",
        blank=True,
    )

    class Meta:
        ordering = ["display_order"]
        unique_together = ("product", "modifier_set")
