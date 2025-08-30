from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from datetime import timedelta
from products.models import Product
from core_backend.utils.archiving import SoftDeleteMixin


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


class StockHistoryEntry(models.Model):
    """
    Tracks all stock operations for audit trail and history purposes.
    """
    
    OPERATION_CHOICES = [
        ('CREATED', _('Stock Created')),
        ('ADJUSTED_ADD', _('Stock Added')),
        ('ADJUSTED_SUBTRACT', _('Stock Subtracted')),
        ('TRANSFER_FROM', _('Transfer Out')),
        ('TRANSFER_TO', _('Transfer In')),
        ('ORDER_DEDUCTION', _('Order Deduction')),
        ('BULK_ADJUSTMENT', _('Bulk Adjustment')),
        ('BULK_TRANSFER', _('Bulk Transfer')),
    ]

    product = models.ForeignKey(
        Product, 
        on_delete=models.PROTECT, 
        related_name="stock_history",
        help_text=_("Product involved in the stock operation")
    )
    location = models.ForeignKey(
        Location, 
        on_delete=models.PROTECT, 
        related_name="stock_history",
        help_text=_("Location where the stock operation occurred")
    )
    user = models.ForeignKey(
        'users.User', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name="stock_operations",
        help_text=_("User who performed the operation")
    )
    
    operation_type = models.CharField(
        max_length=20,
        choices=OPERATION_CHOICES,
        help_text=_("Type of stock operation performed")
    )
    quantity_change = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Change in quantity (positive for additions, negative for subtractions)")
    )
    previous_quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Quantity before the operation")
    )
    new_quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=_("Quantity after the operation")
    )
    
    # New structured reason system
    reason_config = models.ForeignKey(
        'settings.StockActionReasonConfig',
        on_delete=models.PROTECT,
        null=True,  # Temporary for migration
        blank=True,
        help_text=_("Structured reason for the stock operation")
    )
    detailed_reason = models.TextField(
        blank=True,
        help_text=_("Optional detailed explanation for the stock operation")
    )
    
    # Legacy reason field (will be removed after migration)
    reason = models.CharField(
        max_length=255,
        blank=True,
        help_text=_("Legacy reason for the stock operation (will be migrated)")
    )
    notes = models.TextField(
        blank=True,
        help_text=_("Additional notes about the operation")
    )
    reference_id = models.CharField(
        max_length=100,
        blank=True,
        help_text=_("Reference ID to link related operations (e.g., transfer operations, bulk operations)")
    )
    
    timestamp = models.DateTimeField(
        auto_now_add=True,
        help_text=_("When the operation was performed")
    )
    
    # Additional metadata
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text=_("IP address where the operation was initiated")
    )
    user_agent = models.TextField(
        blank=True,
        help_text=_("User agent information")
    )

    class Meta:
        verbose_name = _("Stock History Entry")
        verbose_name_plural = _("Stock History Entries")
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['product', 'timestamp'], name='stock_hist_prod_time_idx'),
            models.Index(fields=['location', 'timestamp'], name='stock_hist_loc_time_idx'),
            models.Index(fields=['user', 'timestamp'], name='stock_hist_user_time_idx'),
            models.Index(fields=['operation_type'], name='stock_hist_operation_idx'),
            models.Index(fields=['timestamp'], name='stock_hist_timestamp_idx'),
            models.Index(fields=['reference_id'], name='stock_hist_reference_idx'),
            models.Index(fields=['reason_config'], name='stock_hist_reason_idx'),
        ]

    def __str__(self):
        return f"{self.operation_type}: {self.product.name} at {self.location.name} ({self.quantity_change:+.2f}) - {self.timestamp.strftime('%Y-%m-%d %H:%M')}"

    @property
    def operation_display(self):
        """Returns human-readable operation type."""
        return dict(self.OPERATION_CHOICES).get(self.operation_type, self.operation_type)
    
    @property
    def get_reason_display(self):
        """Returns the reason display for backward compatibility and migration."""
        if self.reason_config:
            # Use the structured reason if available
            base_reason = self.reason_config.name
            if self.detailed_reason:
                return f"{base_reason}: {self.detailed_reason}"
            return base_reason
        elif self.reason:
            # Fall back to legacy reason during migration period
            return self.reason
        else:
            return "No reason provided"
    
    @property
    def get_full_reason(self):
        """Returns the complete reason including both structured and detailed parts."""
        if self.reason_config:
            parts = [self.reason_config.name]
            if self.detailed_reason:
                parts.append(self.detailed_reason)
            return " - ".join(parts)
        return self.reason or "No reason provided"
    
    @property
    def reason_category(self):
        """Categorizes the reason based on structured reason config or operation type and reason text."""
        # Use structured reason category if available
        if self.reason_config:
            return self.reason_config.category
        
        # Fall back to legacy categorization logic
        # System-generated operations
        if self.operation_type in ['ORDER_DEDUCTION']:
            return 'SYSTEM'
        
        # Transfer operations
        if self.operation_type in ['TRANSFER_FROM', 'TRANSFER_TO', 'BULK_TRANSFER']:
            return 'TRANSFER'
        
        # Bulk operations
        if self.operation_type in ['BULK_ADJUSTMENT']:
            return 'BULK'
        
        # Check legacy reason text for common patterns
        if self.reason:
            reason_lower = self.reason.lower()
            
            # Corrections/fixes
            if any(word in reason_lower for word in ['error', 'mistake', 'correction', 'fix', 'wrong']):
                return 'CORRECTION'
            
            # Inventory counts
            if any(word in reason_lower for word in ['count', 'inventory', 'audit', 'recount']):
                return 'INVENTORY'
            
            # Waste/shrinkage
            if any(word in reason_lower for word in ['waste', 'expired', 'damaged', 'shrinkage', 'spoiled']):
                return 'WASTE'
            
            # Restocking
            if any(word in reason_lower for word in ['restock', 'delivery', 'shipment', 'received']):
                return 'RESTOCK'
        
        # Default for manual adjustments
        if self.operation_type in ['CREATED', 'ADJUSTED_ADD', 'ADJUSTED_SUBTRACT']:
            return 'MANUAL'
        
        return 'OTHER'
    
    @property
    def reason_category_display(self):
        """Returns display information for reason category."""
        categories = {
            'SYSTEM': {'label': 'System', 'color': 'gray', 'description': 'Automatic system operation'},
            'MANUAL': {'label': 'Manual', 'color': 'blue', 'description': 'Manual adjustment'},
            'TRANSFER': {'label': 'Transfer', 'color': 'purple', 'description': 'Location transfer'},
            'CORRECTION': {'label': 'Correction', 'color': 'orange', 'description': 'Error correction'},
            'INVENTORY': {'label': 'Inventory', 'color': 'green', 'description': 'Inventory count'},
            'WASTE': {'label': 'Waste', 'color': 'red', 'description': 'Waste/shrinkage'},
            'RESTOCK': {'label': 'Restock', 'color': 'emerald', 'description': 'Incoming stock'},
            'BULK': {'label': 'Bulk', 'color': 'indigo', 'description': 'Bulk operation'},
            'OTHER': {'label': 'Other', 'color': 'slate', 'description': 'Other operation'},
        }
        return categories.get(self.reason_category, categories['OTHER'])
    
    @property
    def truncated_reason(self):
        """Returns truncated reason text for table display."""
        if not self.reason and not self.notes:
            return None
        
        full_text = self.reason or self.notes or ""
        if len(full_text) <= 30:
            return full_text
        
        return full_text[:30] + "..."
