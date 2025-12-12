"""
Measurements app - shared unit definitions.

This app contains global (non-tenant-scoped) measurement units that are
shared across all tenants and apps (inventory, COGS, etc.).

Units are canonical reference data - a gram is a gram everywhere.
Tenant-specific behavior (like custom conversions) lives in the consuming apps.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _


class UnitCategory(models.TextChoices):
    """Categories for measurement units."""
    WEIGHT = "weight", _("Weight")
    VOLUME = "volume", _("Volume")
    COUNT = "count", _("Count")


class Unit(models.Model):
    """
    Measurement unit - GLOBAL reference data.

    Units are NOT tenant-scoped because a gram is a gram everywhere.
    Tenant-specific behavior comes from:
    - UnitConversion in COGS (product-specific conversions per tenant)
    - IngredientConfig in COGS (per-tenant ingredient settings)

    No soft-delete - units are global reference data that shouldn't be archived.

    Examples: gram (g), kilogram (kg), ounce (oz), pound (lb), each, piece, case
    """
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text=_("Short code for the unit, e.g., 'g', 'kg', 'oz', 'lb', 'each'")
    )
    name = models.CharField(
        max_length=50,
        help_text=_("Full name of the unit, e.g., 'gram', 'kilogram', 'ounce'")
    )
    category = models.CharField(
        max_length=20,
        choices=UnitCategory.choices,
        help_text=_("Category of the unit: weight, volume, or count")
    )

    class Meta:
        verbose_name = _("Unit")
        verbose_name_plural = _("Units")
        ordering = ['category', 'code']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['category']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"
