from rest_framework import serializers
from .models import (
    Category, Tax, Product, ProductType,
    ModifierSet, ModifierOption, ProductModifierSet
)
from .services import ProductService
from rest_framework.fields import ImageField
from django.conf import settings
from collections import defaultdict

from core_backend.base.serializers import BaseModelSerializer


class ModifierOptionSerializer(BaseModelSerializer):
    class Meta:
        model = ModifierOption
        fields = [
            "id",
            "name",
            "price_delta",
            "display_order",
            "modifier_set",
            "is_product_specific",
        ]


class ModifierSetSerializer(BaseModelSerializer):
    options = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    related_products = serializers.SerializerMethodField()

    class Meta:
        model = ModifierSet
        fields = [
            "id",
            "name",
            "internal_name",
            "selection_type",
            "min_selections",
            "max_selections",
            "triggered_by_option",
            "options",
            "product_count",
            "related_products",
        ]
        prefetch_related_fields = ["options", "product_modifier_sets__product"]

    def get_options(self, obj):
        # Only return non-product-specific options for global modifier set views
        global_options = obj.options.filter(is_product_specific=False)
        return ModifierOptionSerializer(global_options, many=True).data

    def get_product_count(self, obj):
        """Return the count of products using this modifier set"""
        return obj.product_modifier_sets.count()

    def get_related_products(self, obj):
        """Return basic info about products using this modifier set"""
        # Access the prefetched products to avoid N+1 queries
        products = [pms.product for pms in obj.product_modifier_sets.all()]
        return BasicProductSerializer(products, many=True).data


class ProductModifierSetSerializer(BaseModelSerializer):
    # Include the full modifier set data instead of just the ID
    id = serializers.IntegerField(source="modifier_set.id", read_only=True)
    name = serializers.CharField(source="modifier_set.name", read_only=True)
    internal_name = serializers.CharField(
        source="modifier_set.internal_name", read_only=True
    )
    selection_type = serializers.CharField(
        source="modifier_set.selection_type", read_only=True
    )
    min_selections = serializers.IntegerField(
        source="modifier_set.min_selections", read_only=True
    )
    max_selections = serializers.IntegerField(
        source="modifier_set.max_selections", read_only=True
    )
    options = serializers.SerializerMethodField()
    
    # Add the field needed for creation
    modifier_set_id = serializers.PrimaryKeyRelatedField(
        source="modifier_set",
        queryset=ModifierSet.objects.all(),
        write_only=True
    )

    class Meta:
        model = ProductModifierSet
        fields = [
            "id",
            "name",
            "internal_name",
            "selection_type",
            "min_selections",
            "max_selections",
            "display_order",
            "options",
            "modifier_set_id",
        ]
        select_related_fields = ["modifier_set", "product"]
        prefetch_related_fields = ["modifier_set__options", "hidden_options", "extra_options"]

    def get_options(self, obj):
        # Get all options from the modifier set (already prefetched)
        all_options = list(obj.modifier_set.options.all())

        # Get hidden option IDs for this product
        hidden_ids = {opt.id for opt in obj.hidden_options.all()}

        # Get extra product-specific options
        extra_options = list(obj.extra_options.all())

        # Combine global options (non-product-specific) with product-specific options
        global_options = [opt for opt in all_options if not opt.is_product_specific]
        final_options = global_options + extra_options

        # Filter out hidden options and mark visibility
        visible_options = []
        for option in final_options:
            if option.id not in hidden_ids:
                option_data = {
                    "id": option.id,
                    "name": option.name,
                    "price_delta": str(option.price_delta),
                    "display_order": option.display_order,
                    "is_hidden": False,
                }
                visible_options.append(option_data)

        # Sort by display order
        visible_options.sort(key=lambda x: x["display_order"])
        return visible_options


# --- Optimized Read-Only Serializers for Product Detail View ---


class FinalModifierOptionSerializer(BaseModelSerializer):
    triggered_sets = serializers.SerializerMethodField()
    is_hidden = serializers.SerializerMethodField()

    class Meta:
        model = ModifierOption
        fields = [
            "id",
            "name",
            "price_delta",
            "display_order",
            "triggered_sets",
            "is_hidden",
        ]

    def get_triggered_sets(self, obj):
        triggered_sets_data = self.context.get("triggered_sets_for_option", {}).get(
            obj.id, []
        )
        # Serialize the triggered sets properly so they include their options
        return FinalProductModifierSetSerializer(
            triggered_sets_data, many=True, context=self.context
        ).data

    def get_is_hidden(self, obj):
        # Check if this option is marked as hidden for the current product
        return getattr(obj, "is_hidden_for_product", False)


class FinalProductModifierSetSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    internal_name = serializers.CharField()
    selection_type = serializers.CharField()
    min_selections = serializers.IntegerField()
    max_selections = serializers.IntegerField(allow_null=True)
    options = serializers.SerializerMethodField()

    def get_options(self, obj):
        options_data = self.context.get("options_for_set", {}).get(obj["id"], [])
        return FinalModifierOptionSerializer(
            options_data, many=True, context=self.context
        ).data


# --- Existing Serializers ---


class BasicCategorySerializer(BaseModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "order"]


class BasicProductSerializer(BaseModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "barcode"]


class ProductTypeSerializer(BaseModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "description", "is_active"]
        # No relationships to optimize


class CategorySerializer(BaseModelSerializer):
    parent = BasicCategorySerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent",
        queryset=Category.objects.all(),
        allow_null=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "description",
            "parent",
            "parent_id",
            "order",
            "is_public",
            "is_active",
        ]
        select_related_fields = ["parent"]
        prefetch_related_fields = ["children"]


class TaxSerializer(BaseModelSerializer):
    class Meta:
        model = Tax
        fields = ["id", "name", "rate"]


class ProductSerializer(BaseModelSerializer):
    category = CategorySerializer(read_only=True)
    parent_category = CategorySerializer(source="category.parent", read_only=True)
    taxes = TaxSerializer(many=True, read_only=True)
    product_type = ProductTypeSerializer(read_only=True)
    image = ImageField(required=False)
    image_url = serializers.SerializerMethodField()
    original_filename = serializers.CharField(read_only=True)
    modifier_groups = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "category",
            "parent_category",
            "taxes",
            "is_active",
            "is_public",
            "track_inventory",
            "product_type",
            "barcode",
            "created_at",
            "updated_at",
            "image",
            "image_url",
            "original_filename",
            "modifier_groups",
        ]
        select_related_fields = ["category", "product_type"]
        prefetch_related_fields = [
            "taxes",
            "product_modifier_sets__modifier_set__options",
            "product_modifier_sets__hidden_options",
            "product_modifier_sets__extra_options",
        ]

    def get_image_url(self, obj):
        """
        Get image URL using ProductImageService.
        Business logic extracted to service layer.
        """
        from .services import ProductImageService
        return ProductImageService.get_image_url(obj, self.context.get("request"))

    def get_modifier_groups(self, obj):
        """Get modifier groups using service layer"""
        try:
            # Use service layer for complex business logic
            structured_data = ProductService.get_structured_modifier_groups_for_product(
                obj, context=self.context
            )
            
            # Update context with processed data
            context = self.context.copy()
            context["options_for_set"] = structured_data['options_map']
            context["triggered_sets_for_option"] = structured_data['triggered_map']
            
            # Serialize the structured data
            return FinalProductModifierSetSerializer(
                structured_data['sets_to_return'], many=True, context=context
            ).data
            
        except Exception as e:
            # Log error and return empty list for graceful degradation
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error getting modifier groups for product {obj.id}: {e}")
            return []


class OptimizedProductSerializer(BaseModelSerializer):
    """Lightweight for list views"""
    category = BasicCategorySerializer(read_only=True)
    
    class Meta:
        model = Product
        fields = ['id', 'name', 'price', 'barcode', 'is_active', 'category']
        select_related_fields = ['category']


class POSProductSerializer(BaseModelSerializer):
    """POS serializer with complete modifier data for editing functionality"""
    category = serializers.SerializerMethodField()
    has_modifiers = serializers.SerializerMethodField()
    modifier_summary = serializers.SerializerMethodField()
    modifier_groups = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = ['id', 'name', 'price', 'barcode', 'category', 'has_modifiers', 'modifier_summary', 'modifier_groups']
        select_related_fields = ['category']
        prefetch_related_fields = [
            'product_modifier_sets__modifier_set__options',
            'product_modifier_sets__hidden_options',
            'product_modifier_sets__extra_options',
        ]
    
    def get_category(self, obj):
        """Return minimal category info that POS expects"""
        if obj.category:
            return {
                'id': obj.category.id,
                'name': obj.category.name,
                'order': obj.category.order
            }
        return None
    
    def get_has_modifiers(self, obj):
        return hasattr(obj, 'product_modifier_sets') and obj.product_modifier_sets.exists()
    
    def get_modifier_summary(self, obj):
        """Return just count of modifier groups, not full data"""
        if hasattr(obj, 'product_modifier_sets'):
            return obj.product_modifier_sets.count()
        return 0
    
    def get_modifier_groups(self, obj):
        """Get modifier groups using service layer - optimized for performance"""
        from .services import ProductService
        
        # Quick check - if no modifier sets, return empty array immediately
        if not hasattr(obj, 'product_modifier_sets') or not obj.product_modifier_sets.exists():
            return []
        
        try:
            structured_data = ProductService.get_structured_modifier_groups_for_product(
                obj, context=self.context
            )
            
            context = self.context.copy() if self.context else {}
            context["options_for_set"] = structured_data['options_map']
            context["triggered_sets_for_option"] = structured_data['triggered_map']
            
            return FinalProductModifierSetSerializer(
                structured_data['sets_to_return'],
                many=True,
                context=context
            ).data
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to get modifier groups for product {obj.id}: {e}")
            return []


class ProductSyncSerializer(BaseModelSerializer):
    category_id = serializers.IntegerField(
        source="category.id", read_only=True, allow_null=True
    )
    product_type_id = serializers.IntegerField(source="product_type.id", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "category_id",
            "product_type_id",
            "is_active",
            "is_public",
            "track_inventory",
            "barcode",
            "created_at",
            "updated_at",
        ]
        select_related_fields = ["category", "product_type"]


class ProductCreateSerializer(BaseModelSerializer):
    category_id = serializers.IntegerField(write_only=True, required=False)
    tax_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    product_type_id = serializers.IntegerField(write_only=True)
    initial_stock = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, default=0
    )
    location_id = serializers.IntegerField(write_only=True, required=False)
    image = ImageField(write_only=True, required=False)

    class Meta:
        model = Product
        fields = [
            "name",
            "description",
            "price",
            "is_active",
            "is_public",
            "track_inventory",
            "product_type_id",
            "category_id",
            "tax_ids",
            "barcode",
            "initial_stock",
            "location_id",
            "image",
        ]

    def validate_barcode(self, value):
        """
        Validate barcode using ProductValidationService.
        Business logic extracted to service layer.
        """
        from .services import ProductValidationService
        return ProductValidationService.validate_barcode_format(value)
    
    def validate(self, data):
        """
        Comprehensive validation using ProductValidationService.
        Business logic extracted to service layer.
        """
        from .services import ProductValidationService
        
        # Use service for comprehensive validation
        validated_data = ProductValidationService.validate_product_data(data)
        
        # Validate category assignment if provided
        if 'category_id' in validated_data:
            ProductValidationService.validate_category_assignment(
                None, validated_data['category_id']
            )
        
        # Validate pricing rules
        if 'price' in validated_data:
            ProductValidationService.validate_price_rules(
                validated_data['price']
            )
        
        return validated_data

    def create(self, validated_data):
        image = validated_data.pop("image", None)
        product = ProductService.create_product(**validated_data)

        if image:
            # Process image asynchronously
            from .image_service import ImageService

            ImageService.process_image_async(product.id, image)

        return product