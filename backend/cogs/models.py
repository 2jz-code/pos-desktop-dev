from django.db import models
from django.utils.translation import gettext_lazy as _
from core_backend.utils.archiving import SoftDeleteMixin
from tenant.managers import TenantManager, TenantSoftDeleteManager

# Import Unit from measurements app - it's the canonical source
from measurements.models import Unit


class CostSourceType(models.TextChoices):
    """Source types for cost entries."""
    MANUAL = "manual", _("Manual Entry")
    DEFAULT = "default", _("Default")
    INVOICE = "invoice", _("Invoice")  # Phase 2+


class UnitConversion(SoftDeleteMixin):
    """
    Conversion factor between two units.

    Conversions are always tenant-scoped. Each tenant gets their own set of
    standard conversions (kg→g, lb→oz, etc.) seeded when they're created.

    Conversions can be:
    - Generic (product=NULL): Standard conversions like kg→g for this tenant
    - Product-specific (product set): For things like "1 scoop of flour = 30g"

    Formula: qty_in_to_unit = qty_in_from_unit * multiplier

    Example: 1 kg = 1000 g → from_unit=kg, to_unit=g, multiplier=1000
    """
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='cogs_unit_conversions'
    )
    product = models.ForeignKey(
        'products.Product',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='cogs_unit_conversions',
        help_text=_("If set, this conversion is specific to this product. "
                    "If null, it's a generic conversion.")
    )
    from_unit = models.ForeignKey(
        Unit,
        related_name='conversions_from',
        on_delete=models.CASCADE,
        help_text=_("The source unit")
    )
    to_unit = models.ForeignKey(
        Unit,
        related_name='conversions_to',
        on_delete=models.CASCADE,
        help_text=_("The target unit")
    )
    multiplier = models.DecimalField(
        max_digits=15,
        decimal_places=6,
        help_text=_("Multiply the from_unit quantity by this to get to_unit quantity")
    )

    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("Unit Conversion")
        verbose_name_plural = _("Unit Conversions")
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'product', 'from_unit', 'to_unit'],
                name='unique_conversion_per_tenant_product'
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'product']),
            models.Index(fields=['tenant', 'from_unit', 'to_unit']),
        ]

    def __str__(self):
        product_str = f" ({self.product.name})" if self.product else ""
        return f"1 {self.from_unit.code} = {self.multiplier} {self.to_unit.code}{product_str}"


class IngredientConfig(SoftDeleteMixin):
    """
    COGS-specific configuration for a product that can be used as an ingredient.

    This keeps COGS data decoupled from the products app.
    Every product used as an ingredient in recipes should have an IngredientConfig
    that defines its base unit for COGS calculations.
    """
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='cogs_ingredient_configs'
    )
    product = models.OneToOneField(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='cogs_config',
        help_text=_("The product this configuration applies to")
    )
    base_unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        related_name='ingredient_configs',
        help_text=_("The base unit for all COGS calculations for this ingredient")
    )
    # Future fields for Phase 2+:
    # default_waste_rate = models.DecimalField(...)
    # track_inventory = models.BooleanField(default=False)

    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("Ingredient Configuration")
        verbose_name_plural = _("Ingredient Configurations")
        indexes = [
            models.Index(fields=['tenant', 'product']),
        ]

    def __str__(self):
        return f"{self.product.name} (base: {self.base_unit.code})"


class ItemCostSource(SoftDeleteMixin):
    """
    Historical cost records for an ingredient at a given store.

    Costs are scoped by (tenant, store_location, product) and have an effective date.
    When resolving cost, we find the latest record where effective_at <= as_of.
    """
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='cogs_item_cost_sources'
    )
    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.CASCADE,
        related_name='cogs_item_cost_sources',
        help_text=_("The store location this cost applies to")
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='cogs_cost_sources',
        help_text=_("The product this cost applies to")
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text=_("Cost per unit (up to 4 decimal places for precision)")
    )
    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        related_name='cost_sources',
        help_text=_("The unit the cost is expressed in (e.g., cost per kg)")
    )
    source_type = models.CharField(
        max_length=20,
        choices=CostSourceType.choices,
        default=CostSourceType.MANUAL,
        help_text=_("How this cost was entered")
    )
    effective_at = models.DateTimeField(
        help_text=_("When this cost becomes effective (uses store timezone)")
    )
    notes = models.TextField(
        blank=True,
        help_text=_("Optional notes about this cost entry")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cogs_cost_entries_created',
        help_text=_("User who created this cost entry")
    )

    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("Item Cost Source")
        verbose_name_plural = _("Item Cost Sources")
        ordering = ['-effective_at', '-created_at']
        indexes = [
            models.Index(
                fields=['tenant', 'store_location', 'product', 'effective_at'],
                name='cogs_cost_lookup_idx'
            ),
            models.Index(fields=['tenant', 'product']),
            models.Index(fields=['tenant', 'store_location']),
            models.Index(fields=['effective_at']),
        ]

    def __str__(self):
        return f"{self.product.name} @ {self.store_location.name}: {self.unit_cost}/{self.unit.code}"
