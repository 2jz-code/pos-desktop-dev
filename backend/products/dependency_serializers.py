"""
Serializers for dependency validation and archiving warnings.

Provides structured responses for frontend consumption when dealing
with archiving operations that affect dependent records.
"""

from rest_framework import serializers
from .models import Product, Category, ProductType


class DependentProductSerializer(serializers.Serializer):
    """Serializer for products that depend on categories or product types."""
    
    id = serializers.IntegerField()
    name = serializers.CharField()
    price = serializers.CharField()
    product_type_name = serializers.CharField(source='product_type', allow_null=True, required=False)
    category_name = serializers.CharField(source='category', allow_null=True, required=False)
    is_public = serializers.BooleanField()
    price_display = serializers.SerializerMethodField()
    
    def get_price_display(self, obj):
        """Format price for display."""
        try:
            if isinstance(obj, dict):
                price_str = obj.get('price', '0')
            else:
                price_str = str(obj.price)
            
            # Convert to float and format
            price_float = float(price_str)
            return f"${price_float:.2f}"
        except (ValueError, TypeError):
            return f"${obj.get('price', '0')}" if isinstance(obj, dict) else f"${obj.price}"


class CategoryDependencySerializer(serializers.Serializer):
    """Serializer for category dependency information."""
    
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    dependent_products_count = serializers.IntegerField()
    dependent_products = DependentProductSerializer(many=True)
    has_more_products = serializers.BooleanField()


class ProductTypeDependencySerializer(serializers.Serializer):
    """Serializer for product type dependency information."""
    
    product_type_id = serializers.IntegerField()
    product_type_name = serializers.CharField()
    dependent_products_count = serializers.IntegerField()
    dependent_products = DependentProductSerializer(many=True)
    has_more_products = serializers.BooleanField()


class ArchiveValidationSerializer(serializers.Serializer):
    """Serializer for archive validation results."""
    
    can_archive = serializers.BooleanField()
    requires_confirmation = serializers.BooleanField()
    warnings = serializers.ListField(child=serializers.CharField())


class CategoryArchiveValidationSerializer(ArchiveValidationSerializer):
    """Serializer for category archive validation results."""
    
    dependencies = CategoryDependencySerializer()


class ProductTypeArchiveValidationSerializer(ArchiveValidationSerializer):
    """Serializer for product type archive validation results."""
    
    dependencies = ProductTypeDependencySerializer()


class ArchiveOperationResultSerializer(serializers.Serializer):
    """Serializer for archive operation results."""
    
    success = serializers.BooleanField()
    category_archived = serializers.BooleanField(required=False)
    product_type_archived = serializers.BooleanField(required=False)
    products_affected = serializers.IntegerField()
    products_archived = serializers.IntegerField(required=False, default=0)
    products_reassigned = serializers.IntegerField(required=False, default=0)
    errors = serializers.ListField(child=serializers.CharField(), required=False)


class AlternativeOptionSerializer(serializers.Serializer):
    """Serializer for alternative categories or product types."""
    
    id = serializers.IntegerField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)


class AlternativeCategorySerializer(AlternativeOptionSerializer):
    """Serializer for alternative category options."""
    
    parent = serializers.CharField(allow_null=True)


class AlternativeProductTypeSerializer(AlternativeOptionSerializer):
    """Serializer for alternative product type options."""
    pass


class BulkArchiveRequestSerializer(serializers.Serializer):
    """Serializer for bulk archive requests."""
    
    category_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )
    product_type_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )
    force = serializers.BooleanField(default=False)
    handle_products = serializers.ChoiceField(
        choices=['set_null', 'archive', 'reassign'],
        default='set_null'
    )


class BulkArchiveResponseSerializer(serializers.Serializer):
    """Serializer for bulk archive responses."""
    
    categories_processed = serializers.IntegerField(default=0)
    product_types_processed = serializers.IntegerField(default=0)
    categories_archived = serializers.IntegerField(default=0)
    product_types_archived = serializers.IntegerField(default=0)
    products_affected = serializers.IntegerField(default=0)
    products_archived = serializers.IntegerField(default=0)
    errors = serializers.ListField(child=serializers.CharField(), required=False)
    warnings = serializers.ListField(child=serializers.CharField(), required=False)


class ReassignmentRequestSerializer(serializers.Serializer):
    """Serializer for product reassignment requests."""
    
    product_ids = serializers.ListField(child=serializers.IntegerField())
    new_category_id = serializers.IntegerField(required=False, allow_null=True)
    new_product_type_id = serializers.IntegerField(required=False, allow_null=True)
    
    def validate(self, data):
        """Validate that at least one reassignment field is provided."""
        if not data.get('new_category_id') and not data.get('new_product_type_id'):
            raise serializers.ValidationError(
                "At least one of new_category_id or new_product_type_id must be provided."
            )
        return data


class ReassignmentResponseSerializer(serializers.Serializer):
    """Serializer for product reassignment responses."""
    
    products_reassigned = serializers.IntegerField()
    category_reassigned = serializers.BooleanField(default=False)
    product_type_reassigned = serializers.BooleanField(default=False)
    errors = serializers.ListField(child=serializers.CharField(), required=False)