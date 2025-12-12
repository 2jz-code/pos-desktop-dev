"""
Unit seeding service for COGS.

- Units are GLOBAL (not per-tenant), seeded via measurements.services.seed_units()
- UnitConversions are TENANT-LOCAL, seeded per tenant when they're created.

This module is kept for backward compatibility and for seeding tenant-specific conversions.
For unit seeding, use measurements.services.seed_units() instead.
"""
from decimal import Decimal
from measurements.models import Unit, UnitCategory
from cogs.models import UnitConversion


# Default units - these are global and shared by all tenants
DEFAULT_UNITS = [
    # Weight units
    {"code": "g", "name": "gram", "category": UnitCategory.WEIGHT},
    {"code": "kg", "name": "kilogram", "category": UnitCategory.WEIGHT},
    {"code": "oz", "name": "ounce", "category": UnitCategory.WEIGHT},
    {"code": "lb", "name": "pound", "category": UnitCategory.WEIGHT},

    # Volume units
    {"code": "ml", "name": "milliliter", "category": UnitCategory.VOLUME},
    {"code": "l", "name": "liter", "category": UnitCategory.VOLUME},
    {"code": "fl_oz", "name": "fluid ounce", "category": UnitCategory.VOLUME},
    {"code": "cup", "name": "cup", "category": UnitCategory.VOLUME},
    {"code": "gal", "name": "gallon", "category": UnitCategory.VOLUME},

    # Count units
    {"code": "each", "name": "each", "category": UnitCategory.COUNT},
    {"code": "piece", "name": "piece", "category": UnitCategory.COUNT},
    {"code": "slice", "name": "slice", "category": UnitCategory.COUNT},
    {"code": "case", "name": "case", "category": UnitCategory.COUNT},
    {"code": "dozen", "name": "dozen", "category": UnitCategory.COUNT},
]

# Default conversions - seeded per tenant
# Format: (from_code, to_code, multiplier)
# Formula: qty_in_to = qty_in_from * multiplier
DEFAULT_CONVERSIONS = [
    # Weight conversions
    ("kg", "g", Decimal("1000")),
    ("lb", "oz", Decimal("16")),
    ("lb", "g", Decimal("453.592")),
    ("oz", "g", Decimal("28.3495")),

    # Volume conversions
    ("l", "ml", Decimal("1000")),
    ("gal", "l", Decimal("3.78541")),
    ("cup", "ml", Decimal("236.588")),
    ("fl_oz", "ml", Decimal("29.5735")),

    # Count conversions
    ("dozen", "each", Decimal("12")),
]


def seed_global_units():
    """
    Seed global units (run once on deployment, not per tenant).

    DEPRECATED: Use measurements.services.seed_units() instead.
    This function is kept for backward compatibility.

    Returns:
        dict: A mapping of unit codes to Unit instances.
    """
    from measurements.services import seed_units
    return seed_units()


def seed_conversions_for_tenant(tenant):
    """
    Seed default unit conversions for a specific tenant.

    Call this when a new tenant is created or when they first access COGS.
    Uses the global Unit records.

    Args:
        tenant: The Tenant instance to seed conversions for.

    Returns:
        list: List of created UnitConversion instances.
    """
    # Get all global units
    unit_map = {unit.code: unit for unit in Unit.objects.all()}

    conversions = []

    for from_code, to_code, multiplier in DEFAULT_CONVERSIONS:
        from_unit = unit_map.get(from_code)
        to_unit = unit_map.get(to_code)

        if not from_unit or not to_unit:
            continue

        # Use all_objects for get_or_create to avoid tenant filtering issues
        conversion, created = UnitConversion.all_objects.get_or_create(
            tenant=tenant,
            product=None,  # Generic conversion for this tenant
            from_unit=from_unit,
            to_unit=to_unit,
            defaults={
                "multiplier": multiplier,
            }
        )
        if created:
            conversions.append(conversion)

    return conversions


def seed_all_for_tenant(tenant):
    """
    Seed conversions for a tenant (units are global, already seeded).

    Args:
        tenant: The Tenant instance to seed for.

    Returns:
        list: List of created conversions.
    """
    return seed_conversions_for_tenant(tenant)
