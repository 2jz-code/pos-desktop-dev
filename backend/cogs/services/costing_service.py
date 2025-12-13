"""
Costing service for COGS.

Core service for resolving ingredient costs and computing menu item theoretical costs.

Cost Resolution Order (per plan):
1. If direct cost source exists → use it
2. Else if product has a recipe → compute cost recursively from ingredients
3. Else → missing cost (return None, flag, don't crash)

Supports sub-recipes (e.g., dough as an ingredient in mana'eesh, where dough
itself has a recipe of flour, water, yeast).
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Set
import pytz

from django.utils import timezone

from measurements.models import Unit
from cogs.models import ItemCostSource, IngredientConfig
from cogs.exceptions import MissingCostError, RecipeNotFoundError
from cogs.services.conversion_service import ConversionService


class CyclicRecipeError(Exception):
    """Raised when a cyclic dependency is detected in recipes."""
    pass


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
    cost_type: str = "missing"  # "manual" | "computed" | "missing"
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

    Cost Resolution Order:
    1. Direct cost source exists → use it (cost_type="manual")
    2. Product has a recipe → compute recursively (cost_type="computed")
    3. Neither → missing cost (cost_type="missing")
    """

    # Maximum recursion depth for sub-recipes
    MAX_RECURSION_DEPTH = 10

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
        as_of=None,
        _visited: Optional[Set[int]] = None,
        _depth: int = 0
    ) -> tuple[Optional[Decimal], str]:
        """
        Get the unit cost for a product in a specific unit.

        Resolution order:
        1. Direct cost source exists → use it
        2. Product has a recipe → compute recursively from ingredients
        3. Neither → return None

        Args:
            product: The Product instance.
            target_unit: The unit to express the cost in.
            as_of: Optional datetime to resolve cost as of.
            _visited: Set of product IDs already visited (cycle detection).
            _depth: Current recursion depth.

        Returns:
            Tuple of (cost_per_unit, cost_type) where cost_type is
            "manual", "computed", or "missing".
        """
        # Initialize cycle detection
        if _visited is None:
            _visited = set()

        # Check for cycles
        if product.id in _visited:
            raise CyclicRecipeError(
                f"Cyclic recipe dependency detected: product {product.name} (ID: {product.id})"
            )

        # Check recursion depth
        if _depth > self.MAX_RECURSION_DEPTH:
            return None, "missing"

        # Mark as visited
        _visited = _visited | {product.id}  # Create new set to not affect other branches

        # STEP 1: Try direct cost source first
        cost_source = self.resolve_product_cost(product, as_of)
        if cost_source:
            unit_cost = self._convert_cost_to_target_unit(
                cost_source.unit_cost,
                cost_source.unit,
                target_unit,
                product
            )
            if unit_cost is not None:
                return unit_cost, "manual"

        # STEP 2: Try to compute from recipe (sub-recipe costing)
        recipe_cost = self._compute_product_recipe_cost(
            product,
            target_unit,
            as_of,
            _visited,
            _depth + 1
        )
        if recipe_cost is not None:
            return recipe_cost, "computed"

        # STEP 3: No cost available
        return None, "missing"

    def _convert_cost_to_target_unit(
        self,
        unit_cost: Decimal,
        from_unit: Unit,
        target_unit: Unit,
        product
    ) -> Optional[Decimal]:
        """
        Convert a unit cost from one unit to another.

        If cost is $10/kg and target is g: $10/kg = $0.01/g

        Args:
            unit_cost: The cost per from_unit.
            from_unit: The unit the cost is expressed in.
            target_unit: The target unit.
            product: The product (for product-specific conversions).

        Returns:
            Cost per target_unit, or None if conversion not possible.
        """
        # If already in target unit, return directly
        if from_unit.id == target_unit.id:
            return unit_cost

        try:
            # How many target_units in one from_unit?
            # E.g., 1 kg = 1000 g, so if cost is per kg, cost per g = cost_per_kg / 1000
            conversion_factor = self._conversion_service.convert(
                Decimal("1"),
                from_unit,
                target_unit,
                product=product
            )
            if conversion_factor and conversion_factor != 0:
                return unit_cost / conversion_factor
        except Exception:
            pass

        return None

    def _compute_product_recipe_cost(
        self,
        product,
        target_unit: Unit,
        as_of,
        _visited: Set[int],
        _depth: int
    ) -> Optional[Decimal]:
        """
        Compute the cost of a product from its recipe (sub-recipe costing).

        This enables ingredients like "dough" to have their cost computed
        from their own recipes (flour, water, yeast, etc.).

        Args:
            product: The product to compute cost for.
            target_unit: The unit to express the cost in.
            as_of: Datetime to resolve costs as of.
            _visited: Set of product IDs already visited (cycle detection).
            _depth: Current recursion depth.

        Returns:
            Cost per target_unit computed from recipe, or None if not possible.
        """
        # Check if product has a recipe
        try:
            recipe = product.recipe
        except Exception:
            return None

        # Get recipe items
        recipe_items = recipe.recipeitem_set.filter(is_active=True).select_related(
            'product', 'unit'
        )

        if not recipe_items.exists():
            return None

        # Compute total cost from all ingredients
        total_cost = Decimal("0")
        total_yield_quantity = Decimal("1")  # Assume recipe yields 1 unit for now

        # Get the recipe's yield unit (we'll use the target unit for now)
        # TODO: In Phase 2, recipes should have explicit yield quantity + unit

        for recipe_item in recipe_items:
            ingredient = recipe_item.product
            ingredient_quantity = recipe_item.quantity
            ingredient_unit = recipe_item.unit

            # Recursively get ingredient cost
            ingredient_cost, cost_type = self.get_product_unit_cost(
                ingredient,
                ingredient_unit,
                as_of,
                _visited,
                _depth
            )

            if ingredient_cost is None:
                # Can't compute cost if any ingredient is missing
                return None

            # Extended cost for this ingredient
            extended_cost = ingredient_quantity * ingredient_cost
            total_cost += extended_cost

        # Cost per target unit
        # For now, assume recipe produces 1 unit in the target unit
        # This is a simplification - Phase 2 should support explicit yields
        return total_cost.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

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

            # Get cost in base unit (now returns tuple: (cost, cost_type))
            try:
                unit_cost, cost_type = self.get_product_unit_cost(ingredient, base_unit, as_of)
            except CyclicRecipeError as e:
                ingredient_result.error = f"Cyclic dependency: {str(e)}"
                ingredient_result.cost_type = "missing"
                breakdown.missing_products.append({
                    "product_id": ingredient.id,
                    "product_name": ingredient.name,
                    "reason": "cyclic_dependency"
                })
                breakdown.is_complete = False
                breakdown.ingredients.append(ingredient_result)
                continue

            if unit_cost is None:
                ingredient_result.error = "No cost data"
                ingredient_result.cost_type = "missing"
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
            ingredient_result.cost_type = cost_type  # "manual" or "computed"

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
        Compute cost summaries for multiple sellable items.

        Branches based on product type:
        - is_producible=True: Recipe-based menu items (use compute_menu_item_cost)
        - is_producible=False: Retail items (use compute_retail_cost_summary)

        Args:
            menu_items: Queryset or list of Product instances.
            as_of: Optional datetime to resolve costs as of.

        Returns:
            List of summary dicts for each item.
        """
        summaries = []

        for item in menu_items:
            # Branch based on whether item is producible (recipe-based) or not (retail)
            if getattr(item, 'is_producible', True):
                # Recipe-based menu item
                breakdown = self.compute_menu_item_cost(item, as_of)
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
                    "setup_mode": "recipe",
                })
            else:
                # Retail item - direct cost entry
                summary = self.compute_retail_cost_summary(item, as_of)
                summaries.append(summary)

        return summaries

    def compute_retail_cost_summary(
        self,
        product,
        as_of=None
    ) -> dict:
        """
        Compute cost summary for a retail (non-producible) item.

        For retail items, cost completeness is simply:
        "Does this product have a cost source?"

        No recipe needed - just direct cost entry or pack calculator.

        Args:
            product: The Product instance.
            as_of: Optional datetime to resolve costs as of.

        Returns:
            Summary dict for the retail item.
        """
        cost_source = self.resolve_product_cost(product, as_of)

        # Calculate margin if we have cost
        cost = None
        margin_amount = None
        margin_percent = None
        is_complete = False

        if cost_source:
            cost = cost_source.unit_cost
            is_complete = True

            if product.price and product.price > 0:
                net_price = self._get_net_price(product)
                margin_amount = (net_price - cost).quantize(
                    Decimal("0.01"),
                    rounding=ROUND_HALF_UP
                )
                if net_price > 0:
                    margin_percent = (
                        (margin_amount / net_price) * 100
                    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        return {
            "menu_item_id": product.id,
            "name": product.name,
            "price": product.price,
            "cost": cost,
            "margin_amount": margin_amount,
            "margin_percent": margin_percent,
            "is_cost_complete": is_complete,
            "has_recipe": False,  # Retail items don't have recipes
            "has_missing_costs": not is_complete,
            "missing_count": 0 if is_complete else 1,  # Just the item itself
            "ingredient_count": 0,  # No ingredients for retail
            "setup_mode": "direct",
        }

    def create_pack_cost(
        self,
        product,
        pack_unit: Unit,
        base_unit: Unit,
        units_per_pack: Decimal,
        pack_cost: Decimal,
        user=None
    ) -> dict:
        """
        Create a pack-based cost entry for a product.

        This is used for items like "case of 48 for $24" where:
        - pack_unit = "case"
        - base_unit = "each"
        - units_per_pack = 48
        - pack_cost = $24

        Creates:
        1. Product-specific UnitConversion (pack_unit → base_unit = units_per_pack)
        2. ItemCostSource (unit=pack_unit, unit_cost=pack_cost)

        The system then derives cost per base_unit automatically:
        $24/case ÷ 48 each/case = $0.50/each

        Args:
            product: The Product instance.
            pack_unit: The pack unit (e.g., "case").
            base_unit: The base unit (e.g., "each").
            units_per_pack: How many base units in one pack (e.g., 48).
            pack_cost: Total cost of one pack (e.g., $24).
            user: The user creating this entry (optional).

        Returns:
            Dict with created conversion and cost source.
        """
        from cogs.models import UnitConversion, ItemCostSource

        # Create or update the product-specific conversion
        conversion, conv_created = UnitConversion.objects.update_or_create(
            tenant=self.tenant,
            product=product,
            from_unit=pack_unit,
            to_unit=base_unit,
            defaults={
                'multiplier': units_per_pack,
                'is_active': True,
            }
        )

        # Create or update the cost source (cost per pack)
        cost_source, cost_created = ItemCostSource.objects.update_or_create(
            tenant=self.tenant,
            store_location=self.store_location,
            product=product,
            unit=pack_unit,
            defaults={
                'unit_cost': pack_cost,
                'source_type': 'manual',
                'effective_at': timezone.now(),
                'created_by': user,
            }
        )

        # Also create/update base unit cost for convenience
        # This makes direct cost lookup faster
        base_unit_cost = (pack_cost / units_per_pack).quantize(
            Decimal("0.0001"),
            rounding=ROUND_HALF_UP
        )
        base_cost_source, base_created = ItemCostSource.objects.update_or_create(
            tenant=self.tenant,
            store_location=self.store_location,
            product=product,
            unit=base_unit,
            defaults={
                'unit_cost': base_unit_cost,
                'source_type': 'manual',
                'effective_at': timezone.now(),
                'created_by': user,
            }
        )

        return {
            'conversion': {
                'id': conversion.id,
                'created': conv_created,
                'from_unit': pack_unit.code,
                'to_unit': base_unit.code,
                'multiplier': str(units_per_pack),
            },
            'pack_cost': {
                'id': cost_source.id,
                'created': cost_created,
                'unit': pack_unit.code,
                'unit_cost': str(pack_cost),
            },
            'base_unit_cost': {
                'id': base_cost_source.id,
                'created': base_created,
                'unit': base_unit.code,
                'unit_cost': str(base_unit_cost),
            }
        }
