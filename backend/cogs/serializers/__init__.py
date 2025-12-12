"""
COGS serializers package - modular serializer layer.
"""

# Unit serializers
from .unit_serializers import (
    UnitSerializer,
    UnitCreateSerializer,
    UnitConversionSerializer,
    UnitConversionCreateSerializer,
)

# Ingredient serializers
from .ingredient_serializers import (
    IngredientConfigSerializer,
    IngredientConfigCreateSerializer,
    ItemCostSourceSerializer,
    ItemCostSourceCreateSerializer,
    ItemCostSourceUpdateSerializer,
)

# Menu item serializers
from .menu_item_serializers import (
    IngredientCostSerializer,
    MissingProductSerializer,
    MenuItemCostBreakdownSerializer,
    MenuItemCostSummarySerializer,
)

# Fast setup serializers
from .fast_setup_serializers import (
    FastSetupIngredientSerializer,
    FastSetupRequestSerializer,
    FastSetupIngredientMatchSerializer,
    FastSetupValidationErrorSerializer,
)

__all__ = [
    # Units
    'UnitSerializer',
    'UnitCreateSerializer',
    'UnitConversionSerializer',
    'UnitConversionCreateSerializer',
    # Ingredients
    'IngredientConfigSerializer',
    'IngredientConfigCreateSerializer',
    'ItemCostSourceSerializer',
    'ItemCostSourceCreateSerializer',
    'ItemCostSourceUpdateSerializer',
    # Menu items
    'IngredientCostSerializer',
    'MissingProductSerializer',
    'MenuItemCostBreakdownSerializer',
    'MenuItemCostSummarySerializer',
    # Fast setup
    'FastSetupIngredientSerializer',
    'FastSetupRequestSerializer',
    'FastSetupIngredientMatchSerializer',
    'FastSetupValidationErrorSerializer',
]
