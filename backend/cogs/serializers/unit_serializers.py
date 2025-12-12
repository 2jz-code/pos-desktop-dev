"""
Unit and UnitConversion serializers.
"""
from rest_framework import serializers

from measurements.models import Unit, UnitCategory
from cogs.models import UnitConversion


class UnitSerializer(serializers.ModelSerializer):
    """
    Serializer for Unit model - read-only.

    Units are GLOBAL reference data seeded on deployment.
    No create/update/delete operations are allowed via the API.
    """

    class Meta:
        model = Unit
        fields = ['id', 'code', 'name', 'category']
        read_only_fields = ['id', 'code', 'name', 'category']


class UnitConversionSerializer(serializers.ModelSerializer):
    """Serializer for UnitConversion model - read operations."""
    from_unit_code = serializers.CharField(source='from_unit.code', read_only=True)
    from_unit_name = serializers.CharField(source='from_unit.name', read_only=True)
    to_unit_code = serializers.CharField(source='to_unit.code', read_only=True)
    to_unit_name = serializers.CharField(source='to_unit.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True, allow_null=True)

    class Meta:
        model = UnitConversion
        fields = [
            'id',
            'product', 'product_name',
            'from_unit', 'from_unit_code', 'from_unit_name',
            'to_unit', 'to_unit_code', 'to_unit_name',
            'multiplier'
        ]
        read_only_fields = ['id']


class UnitConversionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating UnitConversion records."""

    class Meta:
        model = UnitConversion
        fields = ['product', 'from_unit', 'to_unit', 'multiplier']

    def validate_multiplier(self, value):
        if value <= 0:
            raise serializers.ValidationError("Multiplier must be positive.")
        return value

    def validate(self, data):
        if data['from_unit'] == data['to_unit']:
            raise serializers.ValidationError("From unit and to unit cannot be the same.")
        return data
