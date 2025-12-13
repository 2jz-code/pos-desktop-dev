"""
Menu item COGS serializers - for cost breakdown and summary responses.
"""
from rest_framework import serializers


class IngredientCostSerializer(serializers.Serializer):
    """Serializer for a single ingredient's cost breakdown."""
    product_id = serializers.IntegerField()
    product_name = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=4)
    quantity_display = serializers.DecimalField(max_digits=10, decimal_places=4)
    unit_code = serializers.CharField()
    unit_display = serializers.CharField()
    unit_cost = serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)
    extended_cost = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    has_cost = serializers.BooleanField()
    cost_type = serializers.ChoiceField(
        choices=["manual", "computed", "missing"],
        default="missing",
        help_text="How the cost was resolved: manual (direct cost entry), computed (from sub-recipe), or missing"
    )
    error = serializers.CharField(allow_null=True, required=False)


class MissingProductSerializer(serializers.Serializer):
    """Serializer for products missing cost data."""
    product_id = serializers.IntegerField()
    product_name = serializers.CharField()
    reason = serializers.CharField()


class MenuItemCostBreakdownSerializer(serializers.Serializer):
    """
    Complete cost breakdown for a single menu item.

    Used in GET /api/cogs/menu-items/:id/
    """
    menu_item_id = serializers.IntegerField()
    menu_item_name = serializers.CharField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_cost = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    margin_amount = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    margin_percent = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
    ingredients = IngredientCostSerializer(many=True)
    missing_products = MissingProductSerializer(many=True)
    is_complete = serializers.BooleanField()
    has_recipe = serializers.BooleanField()
    errors = serializers.ListField(child=serializers.CharField(), required=False)


class MenuItemCostSummarySerializer(serializers.Serializer):
    """
    Summary cost info for a sellable item.

    Used in GET /api/cogs/menu-items/ (list view).

    setup_mode determines how costs are configured:
    - "recipe": Menu items that are produced (is_producible=True) - costs come from recipes
    - "direct": Retail items that are purchased (is_purchasable=True, is_producible=False) - direct cost entry
    """
    menu_item_id = serializers.IntegerField()
    name = serializers.CharField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    cost = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    margin_amount = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    margin_percent = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
    is_cost_complete = serializers.BooleanField()
    has_recipe = serializers.BooleanField()
    has_missing_costs = serializers.BooleanField()
    missing_count = serializers.IntegerField()
    ingredient_count = serializers.IntegerField()
    # New field to distinguish recipe-based vs direct-cost items
    setup_mode = serializers.ChoiceField(
        choices=["recipe", "direct"],
        default="recipe",
        help_text="'recipe' for producible items (menu items), 'direct' for purchasable retail items"
    )
