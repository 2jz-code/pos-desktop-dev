from django.db import models
from django.utils.translation import gettext_lazy as _
from products.models import Product


class Location(models.Model):
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

    class Meta:
        verbose_name = _("Location")
        verbose_name_plural = _("Locations")

    def __str__(self):
        return self.name


class InventoryStock(models.Model):
    """
    Tracks the quantity of a specific product at a specific location.
    """

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="stock_levels"
    )
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name="stock_levels"
    )
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text=_("Quantity of stock on hand."),
    )

    class Meta:
        verbose_name = _("Inventory Stock")
        verbose_name_plural = _("Inventory Stocks")
        unique_together = ("product", "location")

    def __str__(self):
        return f"{self.product.name} at {self.location.name}: {self.quantity}"


class Recipe(models.Model):
    """
    Defines the recipe for a MenuItem.
    """

    menu_item = models.OneToOneField(
        Product,
        on_delete=models.CASCADE,
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

    def __str__(self):
        return self.name


class RecipeItem(models.Model):
    """
    A through model representing an ingredient in a recipe.
    """

    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
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

    def __str__(self):
        return (
            f"{self.quantity} {self.unit} of {self.product.name} for {self.recipe.name}"
        )
