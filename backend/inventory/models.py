from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from datetime import timedelta
from products.models import Product
from core_backend.archiving import SoftDeleteMixin


class Location(SoftDeleteMixin):
    """
    Represents a physical location where inventory is stored.
    e.g., 'Back Storeroom', 'Front Customer Cooler', 'Main Walk-in Freezer'.
    """

    name = models.CharField(
        max_length=100, unique=True, help_text=_("Name of the inventory location.")
    )
    description = models.TextField(
        blank=True, help_text=_("Description of the location.")
    )
    low_stock_threshold = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("Default low stock threshold for this location. If not set, uses global default."),
    )
    expiration_threshold = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=_("Default number of days before expiration to warn about expiring stock for this location. If not set, uses global default."),
    )

    class Meta:
        verbose_name = _("Location")
        verbose_name_plural = _("Locations")

    def __str__(self):
        return self.name

    @property
    def effective_low_stock_threshold(self):
        """Returns the effective low stock threshold (location-specific or global default)."""
        if self.low_stock_threshold is not None:
            return self.low_stock_threshold
        
        # Import here to avoid circular imports
        from settings.config import app_settings
        return app_settings.default_low_stock_threshold

    @property
    def effective_expiration_threshold(self):
        """Returns the effective expiration threshold (location-specific or global default)."""
        if self.expiration_threshold is not None:
            return self.expiration_threshold
        
        # Import here to avoid circular imports
        from settings.config import app_settings
        return app_settings.default_expiration_threshold


class InventoryStock(SoftDeleteMixin):
    """
    Tracks the quantity of a specific product at a specific location.
    """

    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="stock_levels"
    )
    location = models.ForeignKey(
        Location, on_delete=models.PROTECT, related_name="stock_levels"
    )
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text=_("Quantity of stock on hand."),
    )
    expiration_date = models.DateField(
        null=True,
        blank=True,
        help_text=_("Date when this stock expires."),
    )
    low_stock_threshold = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("Threshold below which stock is considered low. If not set, uses global default."),
    )
    expiration_threshold = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=_("Number of days before expiration to warn about expiring stock. If not set, uses global default."),
    )
    low_stock_notified = models.BooleanField(
        default=False,
        help_text=_("Whether a low stock notification has been sent for this item."),
    )

    @property
    def effective_low_stock_threshold(self):
        """
        Returns the effective low stock threshold using 3-tier hierarchy:
        1. Individual stock override
        2. Location-specific default
        3. Global default
        """
        # First check for item-specific override
        if self.low_stock_threshold is not None:
            return self.low_stock_threshold
        
        # Then check for location-specific default
        if self.location.low_stock_threshold is not None:
            return self.location.low_stock_threshold
        
        # Finally fall back to global default
        from settings.config import app_settings
        return app_settings.default_low_stock_threshold

    @property
    def effective_expiration_threshold(self):
        """
        Returns the effective expiration threshold using 3-tier hierarchy:
        1. Individual stock override
        2. Location-specific default
        3. Global default
        """
        # First check for item-specific override
        if self.expiration_threshold is not None:
            return self.expiration_threshold
        
        # Then check for location-specific default
        if self.location.expiration_threshold is not None:
            return self.location.expiration_threshold
        
        # Finally fall back to global default
        from settings.config import app_settings
        return app_settings.default_expiration_threshold

    @property
    def is_low_stock(self):
        """Returns True if the current quantity is at or below the effective low stock threshold."""
        return self.quantity <= self.effective_low_stock_threshold

    @property
    def is_expiring_soon(self):
        """Returns True if the expiration date is within the effective expiration threshold days."""
        if not self.expiration_date:
            return False
        
        today = timezone.now().date()
        threshold_date = today + timedelta(days=self.effective_expiration_threshold)
        return self.expiration_date <= threshold_date

    class Meta:
        verbose_name = _("Inventory Stock")
        verbose_name_plural = _("Inventory Stocks")
        unique_together = ("product", "location")
        indexes = [
            models.Index(fields=['product', 'location'], name='inventory_product_location_idx'),
            models.Index(fields=['quantity'], name='inventory_quantity_idx'),
            models.Index(fields=['expiration_date'], name='inventory_expiration_idx'),
            models.Index(fields=['location'], name='inventory_location_idx'),
        ]

    def __str__(self):
        return f"{self.product.name} at {self.location.name}: {self.quantity}"


class Recipe(SoftDeleteMixin):
    """
    Defines the recipe for a MenuItem.
    """

    menu_item = models.OneToOneField(
        Product,
        on_delete=models.PROTECT,
        related_name="recipe",
        help_text=_("The menu item this recipe is for."),
        limit_choices_to={"product_type": "menu"},
    )
    name = models.CharField(
        max_length=200,
        help_text=_("Name of the recipe, e.g., 'Cheeseburger Ingredients'."),
    )
    ingredients = models.ManyToManyField(
        Product, through="RecipeItem", related_name="recipes"
    )

    class Meta:
        verbose_name = _("Recipe")
        verbose_name_plural = _("Recipes")
        indexes = [
            models.Index(fields=['menu_item']),  # For recipe lookups
        ]

    def __str__(self):
        return self.name


class RecipeItem(SoftDeleteMixin):
    """
    A through model representing an ingredient in a recipe.
    """

    recipe = models.ForeignKey(Recipe, on_delete=models.PROTECT)
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        help_text=_("The product used as an ingredient."),
    )
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text=_("Quantity of the product needed for the recipe."),
    )
    unit = models.CharField(
        max_length=50,
        help_text=_("Unit of measure, e.g., 'grams', 'oz', 'slices', 'each'."),
    )

    class Meta:
        verbose_name = _("Recipe Item")
        verbose_name_plural = _("Recipe Items")
        unique_together = ("recipe", "product")
        indexes = [
            models.Index(fields=['recipe', 'product']),  # For ingredient lookups
        ]

    def __str__(self):
        return (
            f"{self.quantity} {self.unit} of {self.product.name} for {self.recipe.name}"
        )
