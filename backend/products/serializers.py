from rest_framework import serializers
from .models import (
    Category, Tax, Product, ProductType,
    ModifierSet, ModifierOption, ProductModifierSet
)
from .services import ProductService
from rest_framework.fields import ImageField
from django.conf import settings
from collections import defaultdict

class ModifierOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModifierOption
        fields = ['id', 'name', 'price_delta', 'display_order', 'modifier_set', 'is_product_specific']

class ModifierSetSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    related_products = serializers.SerializerMethodField()

    class Meta:
        model = ModifierSet
        fields = ['id', 'name', 'internal_name', 'selection_type', 'min_selections', 'max_selections', 'triggered_by_option', 'options', 'product_count', 'related_products']
    
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

class ProductModifierSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductModifierSet
        fields = '__all__'


# --- Optimized Read-Only Serializers for Product Detail View ---

class FinalModifierOptionSerializer(serializers.ModelSerializer):
    triggered_sets = serializers.SerializerMethodField()
    is_hidden = serializers.SerializerMethodField()

    class Meta:
        model = ModifierOption
        fields = ['id', 'name', 'price_delta', 'display_order', 'triggered_sets', 'is_hidden']

    def get_triggered_sets(self, obj):
        return self.context.get('triggered_sets_for_option', {}).get(obj.id, [])
    
    def get_is_hidden(self, obj):
        # Check if this option is marked as hidden for the current product
        return getattr(obj, 'is_hidden_for_product', False)

class FinalProductModifierSetSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    internal_name = serializers.CharField()
    selection_type = serializers.CharField()
    min_selections = serializers.IntegerField()
    max_selections = serializers.IntegerField(allow_null=True)
    options = serializers.SerializerMethodField()

    def get_options(self, obj):
        options_data = self.context.get('options_for_set', {}).get(obj['id'], [])
        return FinalModifierOptionSerializer(options_data, many=True, context=self.context).data

# --- Existing Serializers ---

class BasicCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "order"]

class BasicProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "barcode"]

class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "description"]

class CategorySerializer(serializers.ModelSerializer):
    parent = BasicCategorySerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=Category.objects.all(), allow_null=True, required=False, write_only=True
    )

    class Meta:
        model = Category
        fields = ["id", "name", "description", "parent", "parent_id", "order", "is_public"]

class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ["id", "name", "rate"]

class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    subcategory = CategorySerializer(source="category.parent", read_only=True)
    taxes = TaxSerializer(many=True, read_only=True)
    product_type = ProductTypeSerializer(read_only=True)
    image = ImageField(read_only=True)
    image_url = serializers.SerializerMethodField()
    original_filename = serializers.CharField(read_only=True)
    modifier_groups = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "description", "price", "category", "subcategory", "taxes",
            "is_active", "is_public", "track_inventory", "product_type", "barcode",
            "created_at", "updated_at", "image", "image_url", "original_filename",
            "modifier_groups",
        ]

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.image.url)
            else:
                image_url = obj.image.url
                if image_url.startswith("http"):
                    return image_url
                else:
                    base_url = getattr(settings, "BASE_URL", "http://127.0.0.1:8001")
                    return f"{base_url}{image_url}"
        return None

    def get_modifier_groups(self, obj):
        product_modifier_sets = obj.product_modifier_sets.all().select_related('modifier_set').prefetch_related(
            'modifier_set__options', 'hidden_options', 'extra_options'
        )

        all_sets_data = {}
        options_map = {}
        triggered_map = defaultdict(list)

        # Check for visible_only and include_all_modifiers parameters from request
        request = self.context.get('request')
        visible_only = request and request.query_params.get('visible_only', '').lower() == 'true'
        include_all_modifiers = request and request.query_params.get('include_all_modifiers', '').lower() == 'true'
        
        for pms in product_modifier_sets:
            ms = pms.modifier_set
            all_sets_data[ms.id] = {
                'id': ms.id,
                'name': ms.name,
                'internal_name': ms.internal_name,
                'selection_type': ms.selection_type,
                'min_selections': 1 if pms.is_required_override else ms.min_selections,
                'max_selections': ms.max_selections,
                'triggered_by_option_id': ms.triggered_by_option_id
            }

            # Get all options (global + product-specific)
            global_options = {opt.id: opt for opt in ms.options.filter(is_product_specific=False)}
            extra_options = {opt.id: opt for opt in pms.extra_options.all()}
            all_options = {**global_options, **extra_options}
            
            # Get hidden option IDs
            hidden_ids = {opt.id for opt in pms.hidden_options.all()}
            
            if visible_only:
                # Filter out hidden options for customer-facing endpoints
                final_options = [opt for opt in all_options.values() if opt.id not in hidden_ids]
            else:
                # Include all options with is_hidden field for admin/management
                final_options = list(all_options.values())
                # Mark which options are hidden
                for opt in final_options:
                    opt.is_hidden_for_product = opt.id in hidden_ids
            
            final_options = sorted(final_options, key=lambda o: o.display_order)
            options_map[ms.id] = final_options

        for set_id, set_data in all_sets_data.items():
            trigger_id = set_data.pop('triggered_by_option_id')
            if trigger_id:
                triggered_map[trigger_id].append(set_data)

        context = self.context.copy()
        context['options_for_set'] = options_map
        context['triggered_sets_for_option'] = triggered_map

        # Determine which sets to return based on include_all_modifiers parameter
        if include_all_modifiers:
            # Return all modifier sets associated with the product (for management UI)
            sets_to_return = list(all_sets_data.values())
        else:
            # Find sets that are not triggered by any option (root-level sets only)
            triggered_set_ids = {s['id'] for sets_list in triggered_map.values() for s in sets_list}
            sets_to_return = [data for data in all_sets_data.values() if data['id'] not in triggered_set_ids]
        
        return FinalProductModifierSetSerializer(sets_to_return, many=True, context=context).data


class ProductSyncSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(source="category.id", read_only=True, allow_null=True)
    product_type_id = serializers.IntegerField(source="product_type.id", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "description", "price", "category_id", "product_type_id",
            "is_active", "is_public", "track_inventory", "barcode", "created_at", "updated_at",
        ]

class ProductCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(write_only=True, required=False)
    tax_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    product_type_id = serializers.IntegerField(write_only=True)
    initial_stock = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, default=0
    )
    location_id = serializers.IntegerField(write_only=True, required=False)
    image = ImageField(write_only=True, required=False)

    class Meta:
        model = Product
        fields = [
            "name", "description", "price", "is_active", "is_public", "track_inventory",
            "product_type_id", "category_id", "tax_ids", "barcode", "initial_stock",
            "location_id", "image",
        ]

    def validate_barcode(self, value):
        if value == "" or value is None:
            return None
        return value

    def create(self, validated_data):
        return ProductService.create_product(**validated_data)
