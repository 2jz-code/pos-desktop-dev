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
    # Include the full modifier set data instead of just the ID
    id = serializers.IntegerField(source='modifier_set.id', read_only=True)
    name = serializers.CharField(source='modifier_set.name', read_only=True)
    internal_name = serializers.CharField(source='modifier_set.internal_name', read_only=True)
    selection_type = serializers.CharField(source='modifier_set.selection_type', read_only=True)
    min_selections = serializers.IntegerField(source='modifier_set.min_selections', read_only=True)
    max_selections = serializers.IntegerField(source='modifier_set.max_selections', read_only=True)
    options = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductModifierSet
        fields = ['id', 'name', 'internal_name', 'selection_type', 'min_selections', 'max_selections', 'display_order', 'options']
    
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
                    'id': option.id,
                    'name': option.name,
                    'price_delta': str(option.price_delta),
                    'display_order': option.display_order,
                    'is_hidden': False
                }
                visible_options.append(option_data)
        
        # Sort by display order
        visible_options.sort(key=lambda x: x['display_order'])
        return visible_options


# --- Optimized Read-Only Serializers for Product Detail View ---

class FinalModifierOptionSerializer(serializers.ModelSerializer):
    triggered_sets = serializers.SerializerMethodField()
    is_hidden = serializers.SerializerMethodField()

    class Meta:
        model = ModifierOption
        fields = ['id', 'name', 'price_delta', 'display_order', 'triggered_sets', 'is_hidden']

    def get_triggered_sets(self, obj):
        triggered_sets_data = self.context.get('triggered_sets_for_option', {}).get(obj.id, [])
        # Serialize the triggered sets properly so they include their options
        return FinalProductModifierSetSerializer(triggered_sets_data, many=True, context=self.context).data
    
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
        fields = ["id", "name", "description", "is_active"]

class CategorySerializer(serializers.ModelSerializer):
    parent = BasicCategorySerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=Category.objects.all(), allow_null=True, required=False, write_only=True
    )

    class Meta:
        model = Category
        fields = ["id", "name", "description", "parent", "parent_id", "order", "is_public", "is_active"]
        select_related_fields = ["parent"]
        prefetch_related_fields = ["children"]

class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ["id", "name", "rate"]

class ProductSerializer(serializers.ModelSerializer):
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
            "id", "name", "description", "price", "category", "parent_category", "taxes",
            "is_active", "is_public", "track_inventory", "product_type", "barcode",
            "created_at", "updated_at", "image", "image_url", "original_filename",
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
        # This method now strictly relies on prefetched data.
        if not hasattr(obj, 'product_modifier_sets'):
            return []

        product_modifier_sets = obj.product_modifier_sets.all()

        # If there are no modifier sets, return an empty list
        if not product_modifier_sets:
            return []

        # The rest of the method logic remains the same, but it will now
        # operate on the prefetched data.
        all_sets_data = {}
        options_map = {}
        triggered_map = defaultdict(list)

        # Check for visible_only and include_all_modifiers parameters from request
        request = self.context.get('request')
        visible_only = request and request.query_params.get('visible_only', '').lower() == 'true'
        include_all_modifiers = request and request.query_params.get('include_all_modifiers', '').lower() == 'true'
        
        # For cart/order contexts, always include all modifiers if the product has any
        if not include_all_modifiers and product_modifier_sets:
            include_all_modifiers = True
        
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

        # Process triggered sets and ensure they have options loaded
        triggered_sets_to_load = []
        for set_id, set_data in all_sets_data.items():
            trigger_id = set_data.pop('triggered_by_option_id')
            if trigger_id:
                triggered_map[trigger_id].append(set_data)
                # Keep track of triggered sets that need their options loaded
                if set_id not in options_map:
                    triggered_sets_to_load.append(set_id)
        
        # This block is removed to prevent extra queries.
        # The prefetch should handle loading all necessary data.
        # if triggered_sets_to_load:
        #     ...

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
            root_level_sets = [data for data in all_sets_data.values() if data['id'] not in triggered_set_ids]
            
            # Also include conditional sets that are being used as standalone base modifiers
            # These are sets with triggers, but their trigger options are not available in this product
            standalone_conditional_sets = []
            for set_data in all_sets_data.values():
                trigger_option_id = set_data.get('triggered_by_option_id')
                if trigger_option_id and set_data['id'] not in [s['id'] for s in root_level_sets]:
                    # This is a triggered set, check if its trigger option is available in this product
                    trigger_option_in_product = any(
                        trigger_option_id in [opt.id for opt in options_map.get(ms_id, [])]
                        for ms_id in all_sets_data.keys()
                    )
                    if not trigger_option_in_product:
                        # Trigger option not available in this product, treat as standalone
                        standalone_conditional_sets.append(set_data)
            
            sets_to_return = root_level_sets + standalone_conditional_sets
        
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
        image = validated_data.pop('image', None)
        product = ProductService.create_product(**validated_data)
        
        if image:
            # Process image asynchronously
            from .image_service import ImageService
            ImageService.process_image_async(product.id, image)
        
        return product
