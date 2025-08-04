from rest_framework import serializers
from products.models import Product, Category


class BaseModelSerializer(serializers.ModelSerializer):
    """
    Base serializer that provides common functionality.
    
    Features:
    - Automatic optimization field detection
    - Common validation patterns
    - Consistent error handling
    """
    
    class Meta:
        # Default optimization fields (can be overridden)
        select_related_fields = []
        prefetch_related_fields = []
    
    def validate(self, data):
        """
        Base validation that can be extended by child classes.
        """
        data = super().validate(data)
        
        # Add any project-wide validation logic here
        
        return data


# Common lightweight serializers used across multiple apps
class BasicProductSerializer(serializers.ModelSerializer):
    """Lightweight product serializer for dropdowns and references"""
    
    class Meta:
        model = Product
        fields = ["id", "name", "barcode", "price"]


class BasicCategorySerializer(serializers.ModelSerializer):
    """Lightweight category serializer for dropdowns and references"""
    
    class Meta:
        model = Category
        fields = ["id", "name", "order"]


class TimestampedSerializer(serializers.ModelSerializer):
    """
    Base serializer for models with created_at/updated_at fields.
    Provides consistent timestamp handling.
    """
    
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    
    class Meta:
        abstract = True
