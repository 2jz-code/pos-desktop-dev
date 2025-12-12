"""
Ingredient configuration and cost serializers.
"""
from rest_framework import serializers

from cogs.models import IngredientConfig, ItemCostSource, CostSourceType


class IngredientConfigSerializer(serializers.ModelSerializer):
    """Serializer for IngredientConfig model - read operations."""
    product_name = serializers.CharField(source='product.name', read_only=True)
    base_unit_code = serializers.CharField(source='base_unit.code', read_only=True)
    base_unit_name = serializers.CharField(source='base_unit.name', read_only=True)

    class Meta:
        model = IngredientConfig
        fields = [
            'id',
            'product', 'product_name',
            'base_unit', 'base_unit_code', 'base_unit_name'
        ]
        read_only_fields = ['id']


class IngredientConfigCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating IngredientConfig records."""

    class Meta:
        model = IngredientConfig
        fields = ['product', 'base_unit']


class ItemCostSourceSerializer(serializers.ModelSerializer):
    """Serializer for ItemCostSource model - read operations."""
    product_name = serializers.CharField(source='product.name', read_only=True)
    store_location_name = serializers.CharField(source='store_location.name', read_only=True)
    unit_code = serializers.CharField(source='unit.code', read_only=True)
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    source_type_display = serializers.CharField(source='get_source_type_display', read_only=True)

    class Meta:
        model = ItemCostSource
        fields = [
            'id',
            'store_location', 'store_location_name',
            'product', 'product_name',
            'unit_cost',
            'unit', 'unit_code', 'unit_name',
            'source_type', 'source_type_display',
            'effective_at',
            'notes',
            'created_at', 'updated_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None


class ItemCostSourceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating ItemCostSource records."""

    class Meta:
        model = ItemCostSource
        fields = [
            'store_location', 'product',
            'unit_cost', 'unit',
            'source_type', 'effective_at',
            'notes'
        ]

    def validate_unit_cost(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit cost cannot be negative.")
        return value


class ItemCostSourceUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating ItemCostSource records."""

    class Meta:
        model = ItemCostSource
        fields = ['unit_cost', 'unit', 'effective_at', 'notes']

    def validate_unit_cost(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit cost cannot be negative.")
        return value
