"""
Custom exceptions for the COGS system.
"""


class COGSError(Exception):
    """Base exception for COGS-related errors."""
    pass


class MissingCostError(COGSError):
    """Raised when cost data is missing for a product."""

    def __init__(self, product, store_location=None, message=None):
        self.product = product
        self.store_location = store_location
        if message is None:
            store_info = f" at {store_location.name}" if store_location else ""
            message = f"No cost found for '{product.name}'{store_info}"
        super().__init__(message)


class ConversionError(COGSError):
    """Raised when unit conversion fails."""

    def __init__(self, from_unit, to_unit, product=None, message=None):
        self.from_unit = from_unit
        self.to_unit = to_unit
        self.product = product
        if message is None:
            product_info = f" for product '{product.name}'" if product else ""
            message = f"Cannot convert from '{from_unit}' to '{to_unit}'{product_info}"
        super().__init__(message)


class UnitMappingError(COGSError):
    """Raised when a unit string cannot be mapped to a Unit model."""

    def __init__(self, unit_string, message=None):
        self.unit_string = unit_string
        if message is None:
            message = f"Cannot map unit string '{unit_string}' to a known unit"
        super().__init__(message)


class IngredientConfigError(COGSError):
    """Raised when ingredient configuration is missing or invalid."""

    def __init__(self, product, message=None):
        self.product = product
        if message is None:
            message = f"No ingredient configuration found for '{product.name}'"
        super().__init__(message)


class RecipeNotFoundError(COGSError):
    """Raised when a recipe is not found for a menu item."""

    def __init__(self, menu_item, message=None):
        self.menu_item = menu_item
        if message is None:
            message = f"No recipe found for menu item '{menu_item.name}'"
        super().__init__(message)
