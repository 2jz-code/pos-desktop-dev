"""
Costing service for COGS.

Core service for resolving ingredient costs and computing menu item theoretical costs.
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List
import pytz

from django.utils import timezone

from measurements.models import Unit
from cogs.models import ItemCostSource, IngredientConfig
from cogs.exceptions import MissingCostError, RecipeNotFoundError
from cogs.services.conversion_service import ConversionService


@dataclass
class IngredientCostResult:
    """Result of costing a single ingredient in a recipe."""
    product_id: int
    product_name: str
    quantity: Decimal  # Quantity in base unit
    quantity_display: Decimal  # Quantity in recipe unit (for display)
    unit_code: str  # Base unit code
    unit_display: str  # Recipe unit for display
    unit_cost: Optional[Decimal]  # Cost per base unit
    extended_cost: Optional[Decimal]  # quantity * unit_cost
    has_cost: bool
    error: Optional[str] = None


@dataclass
class MenuItemCostBreakdown:
    """Complete cost breakdown for a menu item."""
    menu_item_id: int
    menu_item_name: str
    price: Decimal
    total_cost: Optional[Decimal]
    margin_amount: Optional[Decimal]
    margin_percent: Optional[Decimal]
    ingredients: List[IngredientCostResult] = field(default_factory=list)
    missing_products: List[dict] = field(default_factory=list)
    is_complete: bool = True
    has_recipe: bool = True
    errors: List[str] = field(default_factory=list)


class CostingService:
    """
    Service for computing ingredient and menu item costs.

    Phase 1: Theoretical costing only - uses recipes and ingredient costs.
    No inventory movements or WAC calculations.
    """

    def __init__(self, tenant, store_location):
        self.tenant = tenant
        self.store_location = store_location
        self._conversion_service = ConversionService(tenant)
        # NOTE: No cost cache for Phase 1. If profiling shows this is hot,
        # reintroduce caching with a finer-grained key (include as_of timestamp).

    def _get_store_timezone(self):
        """Get the timezone for the store location."""
        try:
            return pytz.timezone(self.store_location.timezone)
        except Exception:
            return pytz.UTC

    def _to_store_time(self, dt):
        """Convert a datetime to the store's timezone."""
        if dt is None:
            dt = timezone.now()
        store_tz = self._get_store_timezone()
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, store_tz)
        return dt.astimezone(store_tz)

    def resolve_product_cost(
        self,
        product,
        as_of=None
    ) -> Optional[ItemCostSource]:
        """
        Resolve the latest cost for a product at this store.

        Args:
            product: The Product instance.
            as_of: Optional datetime to resolve cost as of (default: now).

        Returns:
            ItemCostSource instance if found, None otherwise.
        """
        as_of_local = self._to_store_time(as_of)

        # Find latest cost where effective_at <= as_of
        # No caching for Phase 1 - simple and always fresh
        return ItemCostSource.objects.filter(
            store_location=self.store_location,
            product=product,
            effective_at__lte=as_of_local
        ).order_by('-effective_at', '-created_at').first()

    def get_product_unit_cost(
        self,
        product,
        target_unit: Unit,
        as_of=None
    ) -> Optional[Decimal]:
        """
        Get the unit cost for a product in a specific unit.

        Converts the stored cost to the target unit if needed.

        Args:
            product: The Product instance.
            target_unit: The unit to express the cost in.
            as_of: Optional datetime to resolve cost as of.

        Returns:
            Cost per target_unit, or None if no cost found.
        """
        cost_source = self.resolve_product_cost(product, as_of)
        if not cost_source:
            return None

        # If cost is already in target unit, return directly
        if cost_source.unit_id == target_unit.id:
            return cost_source.unit_cost

        # Convert cost to target unit
        # If cost is $10/kg and target is g: $10/kg = $0.01/g
        # We need to convert 1 target_unit to cost_unit and multiply
        try:
            # How many target_units in one cost_unit?
            # E.g., 1 kg = 1000 g, so if cost is per kg, cost per g = cost_per_kg / 1000
            conversion_factor = self._conversion_service.convert(
                Decimal("1"),
                cost_source.unit,
                target_unit,
                product=product
            )
            # conversion_factor is how many target_units = 1 cost_unit
            # So cost_per_target = cost_per_cost_unit / conversion_factor
            if conversion_factor and conversion_factor != 0:
                return cost_source.unit_cost / conversion_factor
        except Exception:
            pass

        return None

    def _get_or_create_ingredient_config(self, product, recipe_unit: Unit) -> Optional[IngredientConfig]:
        """
        Get or create an IngredientConfig for a product.

        If creating, uses the recipe unit as the base unit.

        Args:
            product: The Product instance.
            recipe_unit: The Unit instance from the recipe.

        Returns:
            IngredientConfig instance, or None if unit cannot be resolved.
        """
        try:
            return product.cogs_config
        except IngredientConfig.DoesNotExist:
            pass

        # Need to create - use the recipe unit as base
        if not recipe_unit:
            # Try to use "each" as default
            recipe_unit = self._conversion_service.get_unit_by_code("each")

        if not recipe_unit:
            return None

        # Create the config
        config = IngredientConfig.objects.create(
            tenant=self.tenant,
            product=product,
            base_unit=recipe_unit
        )
        return config

    def compute_menu_item_cost(
        self,
        menu_item,
        as_of=None
    ) -> MenuItemCostBreakdown:
        """
        Compute the theoretical cost for a menu item based on its recipe.

        Args:
            menu_item: The Product instance (must be a menu item with a recipe).
            as_of: Optional datetime to resolve costs as of.

        Returns:
            MenuItemCostBreakdown with full cost breakdown.
        """
        breakdown = MenuItemCostBreakdown(
            menu_item_id=menu_item.id,
            menu_item_name=menu_item.name,
            price=menu_item.price,
            total_cost=None,
            margin_amount=None,
            margin_percent=None,
            is_complete=True,
            has_recipe=True
        )

        # Get recipe
        try:
            recipe = menu_item.recipe
        except Exception:
            breakdown.has_recipe = False
            breakdown.is_complete = False
            breakdown.errors.append(f"No recipe found for {menu_item.name}")
            return breakdown

        # Get recipe items
        recipe_items = recipe.recipeitem_set.filter(is_active=True).select_related('product')

        if not recipe_items.exists():
            breakdown.has_recipe = False
            breakdown.is_complete = False
            breakdown.errors.append(f"Recipe has no ingredients")
            return breakdown

        total_cost = Decimal("0")

        for recipe_item in recipe_items:
            ingredient = recipe_item.product
            recipe_quantity = recipe_item.quantity
            recipe_unit = recipe_item.unit  # Now a FK to Unit

            # Get or create ingredient config
            ingredient_config = self._get_or_create_ingredient_config(
                ingredient,
                recipe_unit
            )

            ingredient_result = IngredientCostResult(
                product_id=ingredient.id,
                product_name=ingredient.name,
                quantity=recipe_quantity,
                quantity_display=recipe_quantity,
                unit_code=recipe_unit.code,
                unit_display=recipe_unit.name,
                unit_cost=None,
                extended_cost=None,
                has_cost=False
            )

            if not ingredient_config:
                ingredient_result.error = "Cannot resolve unit"
                breakdown.missing_products.append({
                    "product_id": ingredient.id,
                    "product_name": ingredient.name,
                    "reason": "unit_mapping_failed"
                })
                breakdown.is_complete = False
                breakdown.ingredients.append(ingredient_result)
                continue

            base_unit = ingredient_config.base_unit
            ingredient_result.unit_code = base_unit.code

            # Convert recipe quantity to base unit
            try:
                if recipe_unit.id != base_unit.id:
                    normalized_quantity = self._conversion_service.convert(
                        recipe_quantity,
                        recipe_unit,
                        base_unit,
                        product=ingredient
                    )
                    ingredient_result.quantity = normalized_quantity
                else:
                    ingredient_result.quantity = recipe_quantity
            except Exception as e:
                ingredient_result.error = f"Conversion error: {str(e)}"
                breakdown.missing_products.append({
                    "product_id": ingredient.id,
                    "product_name": ingredient.name,
                    "reason": "conversion_failed"
                })
                breakdown.is_complete = False
                breakdown.ingredients.append(ingredient_result)
                continue

            # Get cost in base unit
            unit_cost = self.get_product_unit_cost(ingredient, base_unit, as_of)

            if unit_cost is None:
                ingredient_result.error = "No cost data"
                breakdown.missing_products.append({
                    "product_id": ingredient.id,
                    "product_name": ingredient.name,
                    "reason": "no_cost"
                })
                breakdown.is_complete = False
                breakdown.ingredients.append(ingredient_result)
                continue

            # Calculate extended cost
            extended_cost = (ingredient_result.quantity * unit_cost).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP
            )

            ingredient_result.unit_cost = unit_cost.quantize(
                Decimal("0.0001"),
                rounding=ROUND_HALF_UP
            )
            ingredient_result.extended_cost = extended_cost
            ingredient_result.has_cost = True

            total_cost += extended_cost
            breakdown.ingredients.append(ingredient_result)

        # Set totals
        if breakdown.ingredients:
            # Calculate total from costed ingredients
            costed_total = sum(
                i.extended_cost for i in breakdown.ingredients
                if i.extended_cost is not None
            )
            breakdown.total_cost = costed_total.quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP
            )

            # Calculate margin
            if breakdown.price and breakdown.price > 0:
                # Get net price (handle tax-inclusive if needed)
                net_price = self._get_net_price(menu_item)

                if breakdown.is_complete and breakdown.total_cost is not None:
                    breakdown.margin_amount = (net_price - breakdown.total_cost).quantize(
                        Decimal("0.01"),
                        rounding=ROUND_HALF_UP
                    )
                    if net_price > 0:
                        breakdown.margin_percent = (
                            (breakdown.margin_amount / net_price) * 100
                        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        return breakdown

    def _get_net_price(self, menu_item) -> Decimal:
        """
        Get the net (pre-tax) price for a menu item.

        Handles tax-inclusive pricing if configured.

        Args:
            menu_item: The Product instance.

        Returns:
            Net price as Decimal.
        """
        price = menu_item.price

        # Check if product type has tax-inclusive pricing
        try:
            product_type = menu_item.product_type
            if product_type and product_type.tax_inclusive:
                # Get tax rate from product's taxes or store default
                tax_rate = Decimal("0")
                if menu_item.taxes.exists():
                    tax_rate = sum(t.rate for t in menu_item.taxes.all()) / 100
                elif self.store_location:
                    tax_rate = self.store_location.tax_rate or Decimal("0")

                if tax_rate > 0:
                    price = price / (1 + tax_rate)
        except Exception:
            pass

        return price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def compute_menu_items_summary(
        self,
        menu_items,
        as_of=None
    ) -> List[dict]:
        """
        Compute cost summaries for multiple menu items.

        Args:
            menu_items: Queryset or list of Product instances.
            as_of: Optional datetime to resolve costs as of.

        Returns:
            List of summary dicts for each menu item.
        """
        summaries = []

        for menu_item in menu_items:
            breakdown = self.compute_menu_item_cost(menu_item, as_of)

            summaries.append({
                "menu_item_id": breakdown.menu_item_id,
                "name": breakdown.menu_item_name,
                "price": breakdown.price,
                "cost": breakdown.total_cost,
                "margin_amount": breakdown.margin_amount,
                "margin_percent": breakdown.margin_percent,
                "is_cost_complete": breakdown.is_complete,
                "has_recipe": breakdown.has_recipe,
                "has_missing_costs": len(breakdown.missing_products) > 0,
                "missing_count": len(breakdown.missing_products),
                "ingredient_count": len(breakdown.ingredients),
            })

        return summaries
