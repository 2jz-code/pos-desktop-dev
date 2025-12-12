"""
Unit seeding service for measurements.

Units are GLOBAL (not per-tenant), seeded once on deployment.
"""
from measurements.models import Unit, UnitCategory


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


# Mapping of common unit string variations to canonical codes
# Used to convert RecipeItem.unit CharField values to Unit FKs
UNIT_STRING_MAPPINGS = {
    # Weight - grams
    "g": "g",
    "gram": "g",
    "grams": "g",
    "gr": "g",
    # Weight - kilograms
    "kg": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "kilo": "kg",
    "kilos": "kg",
    # Weight - ounces
    "oz": "oz",
    "ounce": "oz",
    "ounces": "oz",
    # Weight - pounds
    "lb": "lb",
    "lbs": "lb",
    "pound": "lb",
    "pounds": "lb",
    # Volume - milliliters
    "ml": "ml",
    "milliliter": "ml",
    "milliliters": "ml",
    "millilitre": "ml",
    "millilitres": "ml",
    # Volume - liters
    "l": "l",
    "liter": "l",
    "liters": "l",
    "litre": "l",
    "litres": "l",
    # Volume - fluid ounces
    "fl_oz": "fl_oz",
    "fl oz": "fl_oz",
    "fluid ounce": "fl_oz",
    "fluid ounces": "fl_oz",
    "floz": "fl_oz",
    # Volume - cups
    "cup": "cup",
    "cups": "cup",
    # Volume - gallons
    "gal": "gal",
    "gallon": "gal",
    "gallons": "gal",
    # Count - each
    "each": "each",
    "ea": "each",
    "unit": "each",
    "units": "each",
    # Count - piece
    "piece": "piece",
    "pieces": "piece",
    "pc": "piece",
    "pcs": "piece",
    # Count - slice
    "slice": "slice",
    "slices": "slice",
    # Count - case
    "case": "case",
    "cases": "case",
    # Count - dozen
    "dozen": "dozen",
    "dz": "dozen",
}


def seed_units():
    """
    Seed global units (run once on deployment).

    Returns:
        dict: A mapping of unit codes to Unit instances.
    """
    unit_map = {}

    for unit_data in DEFAULT_UNITS:
        unit, _ = Unit.objects.get_or_create(
            code=unit_data["code"],
            defaults={
                "name": unit_data["name"],
                "category": unit_data["category"],
            }
        )
        unit_map[unit.code] = unit

    return unit_map


def map_unit_string_to_code(unit_string: str) -> str | None:
    """
    Map a unit string to its canonical code.

    Args:
        unit_string: The unit string to map (e.g., "grams", "oz", "each")

    Returns:
        Canonical unit code if found, None otherwise.
    """
    if not unit_string:
        return None

    normalized = unit_string.strip().lower()
    return UNIT_STRING_MAPPINGS.get(normalized)


def get_unit_by_string(unit_string: str) -> Unit | None:
    """
    Get a Unit instance by its string representation.

    Args:
        unit_string: The unit string to look up (e.g., "grams", "oz", "each")

    Returns:
        Unit instance if found, None otherwise.
    """
    code = map_unit_string_to_code(unit_string)
    if code:
        return Unit.objects.filter(code=code).first()

    # Try direct lookup by code or name
    return Unit.objects.filter(code__iexact=unit_string.strip()).first() or \
           Unit.objects.filter(name__iexact=unit_string.strip()).first()
