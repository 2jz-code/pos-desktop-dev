"""
Fast Setup serializers - for the simplified COGS setup flow.
"""
from rest_framework import serializers


class FastSetupIngredientSerializer(serializers.Serializer):
    """
    Serializer for a single ingredient in fast setup.

    Supports:
    - Using existing ingredient by ID
    - Creating new ingredient by name (with deduplication)
    - Optionally setting cost
    """
    ingredient_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of existing product to use as ingredient. If null, will try to match/create by name."
    )
    name = serializers.CharField(
        max_length=200,
        help_text="Ingredient name. Used for matching/creating if ingredient_id not provided."
    )
    quantity = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Quantity needed for the recipe."
    )
    unit = serializers.CharField(
        max_length=50,
        help_text="Unit of measure (e.g., 'g', 'kg', 'oz', 'each')."
    )
    unit_cost = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        required=False,
        allow_null=True,
        help_text="Cost per unit. If provided, creates/updates ItemCostSource."
    )

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive.")
        return value

    def validate_unit_cost(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Unit cost cannot be negative.")
        return value


class FastSetupRequestSerializer(serializers.Serializer):
    """
    Request serializer for fast setup endpoint.

    POST /api/cogs/menu-items/:id/fast-setup/
    """
    store_location = serializers.IntegerField(
        help_text="ID of the store location to set up costs for."
    )
    ingredients = FastSetupIngredientSerializer(
        many=True,
        help_text="List of ingredients with quantities and optional costs."
    )

    def validate_ingredients(self, value):
        if not value:
            raise serializers.ValidationError("At least one ingredient is required.")
        return value


class FastSetupIngredientMatchSerializer(serializers.Serializer):
    """
    Response serializer when ingredient name matches multiple products.
    """
    name = serializers.CharField()
    matches = serializers.ListField(
        child=serializers.DictField(),
        help_text="List of matching products with id and name."
    )


class FastSetupValidationErrorSerializer(serializers.Serializer):
    """
    Response serializer for fast setup validation errors.
    """
    ingredient_index = serializers.IntegerField()
    ingredient_name = serializers.CharField()
    error_type = serializers.ChoiceField(choices=[
        'multiple_matches',
        'invalid_unit',
        'permission_denied',
    ])
    message = serializers.CharField()
    matches = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        help_text="For multiple_matches error, list of matching products."
    )
