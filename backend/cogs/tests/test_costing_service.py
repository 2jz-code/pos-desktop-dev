"""
Tests for CostingService.
"""
import pytest
from decimal import Decimal

from cogs.services import CostingService


@pytest.mark.django_db
class TestCostingService:
    """Tests for the CostingService."""

    def test_resolve_product_cost_exists(
        self, tenant, store_location, cheese_ingredient, ingredient_costs
    ):
        """Test resolving cost when it exists."""
        service = CostingService(tenant, store_location)

        cost_source = service.resolve_product_cost(cheese_ingredient)

        assert cost_source is not None
        assert cost_source.unit_cost == Decimal("15.00")
        assert cost_source.unit.code == "kg"

    def test_resolve_product_cost_not_exists(
        self, tenant, store_location, cheese_ingredient
    ):
        """Test resolving cost when it doesn't exist returns None."""
        service = CostingService(tenant, store_location)

        cost_source = service.resolve_product_cost(cheese_ingredient)

        assert cost_source is None

    def test_get_product_unit_cost_same_unit(
        self, tenant, store_location, dough_ingredient, ingredient_costs, default_units
    ):
        """Test getting unit cost when cost is in same unit."""
        service = CostingService(tenant, store_location)
        each = default_units['each']

        unit_cost = service.get_product_unit_cost(dough_ingredient, each)

        assert unit_cost == Decimal("1.50")

    def test_get_product_unit_cost_converted(
        self, tenant, store_location, cheese_ingredient, ingredient_costs,
        ingredient_configs, default_units, default_conversions
    ):
        """Test getting unit cost with unit conversion."""
        service = CostingService(tenant, store_location)
        g = default_units['g']

        # Cost is $15/kg, should be $0.015/g
        unit_cost = service.get_product_unit_cost(cheese_ingredient, g)

        assert unit_cost is not None
        assert unit_cost == Decimal("0.015")  # $15/kg = $0.015/g

    def test_compute_menu_item_cost_complete(
        self, tenant, store_location, pizza_menu_item, pizza_recipe,
        pizza_recipe_items, ingredient_configs, ingredient_costs, default_conversions
    ):
        """Test computing menu item cost with all ingredients costed."""
        service = CostingService(tenant, store_location)

        breakdown = service.compute_menu_item_cost(pizza_menu_item)

        assert breakdown.is_complete is True
        assert breakdown.has_recipe is True
        assert len(breakdown.ingredients) == 3
        assert len(breakdown.missing_products) == 0

        # Check total cost calculation:
        # Cheese: 150g * $0.015/g = $2.25
        # Tomato: 100g * $0.005/g = $0.50
        # Dough: 1 each * $1.50/each = $1.50
        # Total: $4.25
        assert breakdown.total_cost == Decimal("4.25")

        # Check margin
        # Price: $12.99, Cost: $4.25
        # Margin: $12.99 - $4.25 = $8.74
        assert breakdown.margin_amount == Decimal("8.74")

    def test_compute_menu_item_cost_missing_costs(
        self, tenant, store_location, pizza_menu_item, pizza_recipe,
        pizza_recipe_items, ingredient_configs
    ):
        """Test computing menu item cost with missing ingredient costs."""
        service = CostingService(tenant, store_location)

        breakdown = service.compute_menu_item_cost(pizza_menu_item)

        assert breakdown.is_complete is False
        assert breakdown.has_recipe is True
        assert len(breakdown.missing_products) == 3  # All missing costs

    def test_compute_menu_item_cost_partial(
        self, tenant, store_location, pizza_menu_item, pizza_recipe,
        pizza_recipe_items, ingredient_configs, cheese_ingredient,
        default_units, default_conversions
    ):
        """Test computing menu item cost with some costs missing."""
        from cogs.models import ItemCostSource
        from django.utils import timezone

        # Only add cost for cheese
        ItemCostSource.objects.create(
            tenant=tenant,
            store_location=store_location,
            product=cheese_ingredient,
            unit_cost=Decimal("15.00"),
            unit=default_units['kg'],
            source_type='manual',
            effective_at=timezone.now(),
        )

        service = CostingService(tenant, store_location)
        breakdown = service.compute_menu_item_cost(pizza_menu_item)

        assert breakdown.is_complete is False
        assert breakdown.has_recipe is True
        assert len(breakdown.missing_products) == 2  # Tomato and dough missing

        # Should still have partial cost (cheese only)
        # 150g * $0.015/g = $2.25
        assert breakdown.total_cost == Decimal("2.25")

    def test_compute_menu_item_cost_no_recipe(
        self, tenant, store_location, pizza_menu_item
    ):
        """Test computing menu item cost when no recipe exists."""
        service = CostingService(tenant, store_location)

        breakdown = service.compute_menu_item_cost(pizza_menu_item)

        assert breakdown.is_complete is False
        assert breakdown.has_recipe is False
        assert breakdown.total_cost is None

    def test_compute_menu_items_summary(
        self, tenant, store_location, pizza_menu_item, pizza_recipe,
        pizza_recipe_items, ingredient_configs, ingredient_costs, default_conversions
    ):
        """Test computing summary for multiple menu items."""
        service = CostingService(tenant, store_location)

        summaries = service.compute_menu_items_summary([pizza_menu_item])

        assert len(summaries) == 1
        summary = summaries[0]

        assert summary['menu_item_id'] == pizza_menu_item.id
        assert summary['name'] == "Margherita Pizza"
        assert summary['price'] == Decimal("12.99")
        assert summary['cost'] == Decimal("4.25")
        assert summary['is_cost_complete'] is True
        assert summary['has_recipe'] is True
        assert summary['has_missing_costs'] is False
        assert summary['ingredient_count'] == 3


@pytest.mark.django_db
class TestCostingServiceEdgeCases:
    """Edge case tests for CostingService."""

    def test_cost_resolution_uses_latest(
        self, tenant, store_location, cheese_ingredient, default_units
    ):
        """Test that cost resolution uses the latest effective cost."""
        from cogs.models import ItemCostSource
        from django.utils import timezone
        from datetime import timedelta

        # Create old cost
        old_time = timezone.now() - timedelta(days=30)
        ItemCostSource.objects.create(
            tenant=tenant,
            store_location=store_location,
            product=cheese_ingredient,
            unit_cost=Decimal("10.00"),
            unit=default_units['kg'],
            source_type='manual',
            effective_at=old_time,
        )

        # Create new cost
        ItemCostSource.objects.create(
            tenant=tenant,
            store_location=store_location,
            product=cheese_ingredient,
            unit_cost=Decimal("15.00"),
            unit=default_units['kg'],
            source_type='manual',
            effective_at=timezone.now(),
        )

        service = CostingService(tenant, store_location)
        cost_source = service.resolve_product_cost(cheese_ingredient)

        assert cost_source.unit_cost == Decimal("15.00")

    def test_cost_caching(
        self, tenant, store_location, cheese_ingredient, ingredient_costs
    ):
        """Test that cost resolution uses caching."""
        service = CostingService(tenant, store_location)

        # First call
        cost1 = service.resolve_product_cost(cheese_ingredient)

        # Second call should use cache
        cost2 = service.resolve_product_cost(cheese_ingredient)

        assert cost1 == cost2
        # Cache key should exist
        assert len(service._cost_cache) > 0
