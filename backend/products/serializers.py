from rest_framework import serializers
from .models import (
    Category, Tax, Product, ProductType,
    ModifierSet, ModifierOption, ProductModifierSet
)
from .services import ProductService
from rest_framework.fields import ImageField
from django.conf import settings
from collections import defaultdict

from core_backend.base.serializers import BaseModelSerializer, TenantFilteredSerializerMixin, FieldsetMixin


class ModifierOptionSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
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


class NestedModifierOptionSerializer(serializers.Serializer):
    """
    Serializer for creating/updating options nested within a ModifierSet.
    This is used for validation only - the actual creation happens in ModifierSetSerializer.
    Does not require modifier_set field since it's set by the parent.
    """
    name = serializers.CharField(max_length=255)
    price_delta = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    display_order = serializers.IntegerField(default=0)
    is_product_specific = serializers.BooleanField(default=False)


class ModifierSetSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
    # For reading: return all options with full details
    options = ModifierOptionSerializer(many=True, read_only=True)

    # For writing: accept options data to create/update (no modifier_set required)
    options_data = NestedModifierOptionSerializer(many=True, write_only=True, required=False)

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
            "options_data",  # Write-only field for creating/updating options
            "product_count",
            "related_products",
        ]
        prefetch_related_fields = ["options", "product_modifier_sets__product"]

    def get_product_count(self, obj):
        """Return the count of products using this modifier set"""
        return obj.product_modifier_sets.count()

    def get_related_products(self, obj):
        """Return basic info about products using this modifier set"""
        # Access the prefetched products to avoid N+1 queries
        products = [pms.product for pms in obj.product_modifier_sets.all()]
        # Use unified ProductSerializer with 'reference' fieldset
        context = self.context.copy() if self.context else {}
        context['view_mode'] = 'reference'
        return ProductSerializer(products, many=True, context=context).data

    def create(self, validated_data):
        """Create modifier set with tenant validation and nested options"""
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        if not tenant:
            raise serializers.ValidationError("Tenant is required to create a modifier set")

        # Validate triggered_by_option belongs to tenant if provided
        triggered_by_option = validated_data.get('triggered_by_option')
        if triggered_by_option and triggered_by_option.tenant != tenant:
            raise serializers.ValidationError({
                "triggered_by_option": "Trigger option does not belong to this tenant"
            })

        # Extract options_data before creating the set
        options_data = validated_data.pop('options_data', [])

        # Set tenant on new modifier set
        validated_data['tenant'] = tenant
        modifier_set = super().create(validated_data)

        # Create nested options
        for option_data in options_data:
            ModifierOption.objects.create(
                modifier_set=modifier_set,
                tenant=tenant,
                **option_data
            )

        return modifier_set

    def update(self, instance, validated_data):
        """Update modifier set with tenant validation and nested options"""
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        # Validate triggered_by_option belongs to tenant if being updated
        triggered_by_option = validated_data.get('triggered_by_option')
        if triggered_by_option and tenant and triggered_by_option.tenant != tenant:
            raise serializers.ValidationError({
                "triggered_by_option": "Trigger option does not belong to this tenant"
            })

        # Extract options_data if provided
        options_data = validated_data.pop('options_data', None)

        # Update the modifier set
        instance = super().update(instance, validated_data)

        # If options_data provided, replace existing options
        if options_data is not None:
            # Delete existing options (only non-product-specific ones)
            instance.options.filter(is_product_specific=False).delete()

            # Create new options
            for option_data in options_data:
                ModifierOption.objects.create(
                    modifier_set=instance,
                    tenant=tenant,
                    **option_data
                )

        return instance


class ProductModifierSetSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
    # Include the full modifier set data instead of just the ID
    id = serializers.IntegerField(source="modifier_set.id", read_only=True)
    relationship_id = serializers.IntegerField(source="id", read_only=True)
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
        queryset=ModifierSet.objects.all(),  # Mixin auto-filters by tenant
        write_only=True
    )

    class Meta:
        model = ProductModifierSet
        fields = [
            "id",
            "relationship_id",
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
                    "is_product_specific": option.is_product_specific,
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
            "is_product_specific",
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


class BasicTaxSerializer(BaseModelSerializer):
    class Meta:
        model = Tax
        fields = ["id", "name", "rate"]


class ProductTypeSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified ProductType serializer using FieldsetMixin for dynamic field control.

    Usage:
    - List view: context={'view_mode': 'list'}
    - Detail view: context={'view_mode': 'detail'} or no view_mode
    - FK references: context={'view_mode': 'reference'}
    - Expand relationships: context={'expand': {'default_taxes'}}
    """

    default_taxes = BasicTaxSerializer(many=True, read_only=True)
    default_taxes_ids = serializers.PrimaryKeyRelatedField(
        source="default_taxes",
        many=True,
        queryset=Tax.objects.all(),  # Mixin auto-filters by tenant
        required=False,
        write_only=True,
        allow_empty=True,
    )

    class Meta:
        model = ProductType
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            # Inventory policy
            "inventory_behavior",
            "stock_enforcement",
            "allow_negative_stock",
            # Tax & pricing
            "tax_inclusive",
            "default_taxes",
            "default_taxes_ids",
            "pricing_method",
            "default_markup_percent",
            # Prep metadata
            "standard_prep_minutes",
            # Order controls
            "max_quantity_per_item",
            "exclude_from_discounts",
        ]

        # View mode fieldsets
        fieldsets = {
            # Minimal reference (for FK references)
            'reference': [
                'id', 'name'
            ],

            # Lightweight list view
            'list': [
                'id', 'name', 'description', 'is_active'
            ],

            # Full detail view (default) - all fields for editing
            'detail': [
                'id', 'name', 'description', 'is_active',
                'inventory_behavior', 'stock_enforcement', 'allow_negative_stock',
                'tax_inclusive', 'default_taxes', 'default_taxes_ids',
                'pricing_method', 'default_markup_percent',
                'standard_prep_minutes',
                'max_quantity_per_item', 'exclude_from_discounts',
            ],
        }

        # Expandable relationships (?expand=default_taxes)
        expandable = {
            'default_taxes': (BasicTaxSerializer, {'source': 'default_taxes', 'many': True}),
        }

        # Optimization hints
        prefetch_related_fields = ["default_taxes"]

        # Required fields (always included even if not in fieldset)
        required_fields = {'id'}

    def create(self, validated_data):
        """Create product type with tenant validation"""
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        if not tenant:
            raise serializers.ValidationError("Tenant is required to create a product type")

        taxes = validated_data.pop("default_taxes", None)

        # Validate taxes belong to tenant
        if taxes:
            for tax in taxes:
                if tax.tenant != tenant:
                    raise serializers.ValidationError({
                        "default_taxes_ids": "One or more taxes do not belong to this tenant"
                    })

        # Set tenant on new product type
        validated_data['tenant'] = tenant
        instance = super().create(validated_data)

        if taxes is not None:
            instance.default_taxes.set(taxes)
        return instance

    def update(self, instance, validated_data):
        """Update product type with tenant validation"""
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        taxes = validated_data.pop("default_taxes", None)

        # Validate taxes belong to tenant
        if taxes and tenant:
            for tax in taxes:
                if tax.tenant != tenant:
                    raise serializers.ValidationError({
                        "default_taxes_ids": "One or more taxes do not belong to this tenant"
                    })

        instance = super().update(instance, validated_data)
        if taxes is not None:
            instance.default_taxes.set(taxes)
        return instance


class CategorySerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified Category serializer using FieldsetMixin for dynamic field control.

    Replaces:
    - BasicCategorySerializer → fieldsets['reference']

    Usage:
    - List view: context={'view_mode': 'list'}
    - Detail view: context={'view_mode': 'detail'} or no view_mode
    - FK references: context={'view_mode': 'reference'}
    - Expand relationships: context={'expand': {'parent'}}
    """

    # parent_id handles both read and write - maps directly to the parent_id column
    # DRF automatically converts between ID and FK object
    parent_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),  # Mixin auto-filters by tenant
        source="parent",  # Maps to the parent ForeignKey
        allow_null=True,
        required=False,
    )

    # Nested parent object (for detail view with full parent data)
    parent = serializers.SerializerMethodField()

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

        # View mode fieldsets
        fieldsets = {
            # Minimal reference (replaces BasicCategorySerializer)
            # IMPORTANT: Includes parent_id for hierarchical ordering
            'reference': [
                'id', 'name', 'order', 'parent_id'
            ],

            # Lightweight list view
            # Includes both parent_id (for logic) and parent (for display)
            'list': [
                'id', 'name', 'order', 'parent_id', 'parent', 'is_active', 'is_public'
            ],

            # Full detail view (default)
            'detail': [
                'id', 'name', 'description', 'parent', 'parent_id',
                'order', 'is_public', 'is_active'
            ],
        }

        # Expandable relationships (?expand=parent)
        expandable = {
            'parent': (None, {'source': 'parent', 'many': False}),  # Uses SerializerMethodField
        }

        # Optimization hints
        select_related_fields = ["parent"]
        prefetch_related_fields = ["children"]

        # Required fields (always included even if not in fieldset)
        required_fields = {'id'}

    def get_parent(self, obj):
        """Return minimal parent info (id, name, order) without using deprecated serializer"""
        if obj.parent:
            return {
                "id": obj.parent.id,
                "name": obj.parent.name,
                "order": obj.parent.order
            }
        return None

    def create(self, validated_data):
        """Create category with tenant validation"""
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        if not tenant:
            raise serializers.ValidationError("Tenant is required to create a category")

        # Validate parent belongs to tenant if provided
        parent = validated_data.get('parent')
        if parent and parent.tenant != tenant:
            raise serializers.ValidationError({
                "parent_id": "Parent category does not belong to this tenant"
            })

        # Set tenant on new category
        validated_data['tenant'] = tenant
        return super().create(validated_data)

    def update(self, instance, validated_data):
        """Update category with tenant validation"""
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        # Validate parent belongs to tenant if being updated
        parent = validated_data.get('parent')
        if parent and tenant and parent.tenant != tenant:
            raise serializers.ValidationError({
                "parent_id": "Parent category does not belong to this tenant"
            })

        return super().update(instance, validated_data)


class CategoryBulkUpdateSerializer(serializers.Serializer):
    """
    Serializer for bulk category updates.
    Validates the request payload and delegates business logic to CategoryService.
    """
    updates = serializers.ListSerializer(
        child=serializers.DictField(),
        help_text="List of category update objects with id and fields to update"
    )
    
    def validate_updates(self, value):
        """Validate the updates list structure"""
        if not value:
            raise serializers.ValidationError("Updates list cannot be empty")
            
        for i, update in enumerate(value):
            if not isinstance(update, dict):
                raise serializers.ValidationError(f"Update at index {i} must be a dictionary")
                
            if 'id' not in update:
                raise serializers.ValidationError(f"Update at index {i} missing required 'id' field")
                
            # Validate ID is a valid integer
            try:
                int(update['id'])
            except (ValueError, TypeError):
                raise serializers.ValidationError(f"Update at index {i}: 'id' must be a valid integer")
        
        return value
    
    def create(self, validated_data):
        """Handle bulk update through CategoryService"""
        from .services import CategoryService

        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        updates = validated_data['updates']
        result = CategoryService.bulk_update_categories(updates, tenant=tenant)

        # Serialize the updated categories for response
        if result['updated_categories']:
            result['updated_categories'] = CategorySerializer(
                result['updated_categories'],
                many=True,
                context=self.context
            ).data

        return result


class ProductBulkUpdateSerializer(serializers.Serializer):
    """
    Serializer for bulk product updates.
    Validates the request payload and delegates business logic to ProductService.
    """
    product_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text="List of product IDs to update"
    )
    category = serializers.IntegerField(required=False, allow_null=True)
    product_type = serializers.IntegerField(required=False, allow_null=True)

    def validate_product_ids(self, value):
        """Validate product_ids list"""
        if not value:
            raise serializers.ValidationError("Product IDs list cannot be empty")

        # Check for duplicates
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Product IDs list contains duplicates")

        return value

    def validate(self, data):
        """Validate that at least one update field is provided"""
        if 'category' not in data and 'product_type' not in data:
            raise serializers.ValidationError(
                "At least one field to update must be provided (category or product_type)"
            )
        return data

    def create(self, validated_data):
        """Handle bulk update through ProductService"""
        product_ids = validated_data.pop('product_ids')
        update_fields = validated_data  # Remaining fields are the updates

        result = ProductService.bulk_update_products(product_ids, update_fields)
        return result


class TaxSerializer(BaseModelSerializer):
    class Meta:
        model = Tax
        fields = ["id", "name", "rate"]

    def create(self, validated_data):
        """Create tax with tenant"""
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        if not tenant:
            raise serializers.ValidationError("Tenant is required to create a tax")

        # Set tenant on new tax
        validated_data['tenant'] = tenant
        return super().create(validated_data)


class ProductSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified Product serializer using FieldsetMixin for dynamic field control.

    Replaces:
    - OptimizedProductSerializer → fieldsets['list']
    - POSProductSerializer → fieldsets['pos']
    - ProductSyncSerializer → fieldsets['sync']
    - BasicProductSerializer → fieldsets['reference']
    - OrderItemProductSerializer → fieldsets['order_item']

    Usage:
    - List view: context={'view_mode': 'list'}
    - POS view: context={'view_mode': 'pos'}
    - Sync view: context={'view_mode': 'sync'}
    - FK references: context={'view_mode': 'reference'}
    - Order items: context={'view_mode': 'order_item'}
    - Detail view: context={'view_mode': 'detail'} or no view_mode
    - Expand relationships: context={'expand': {'category', 'taxes', 'product_type', 'modifier_groups'}}
    """

    # ID fields (default representation)
    category_id = serializers.IntegerField(source="category.id", read_only=True, allow_null=True)
    product_type_id = serializers.IntegerField(source="product_type.id", read_only=True, allow_null=True)
    tax_ids = serializers.PrimaryKeyRelatedField(
        source="taxes",
        many=True,
        queryset=Tax.objects.all(),  # TenantFilteredSerializerMixin will filter by tenant
        required=False,
        help_text="Tax IDs to assign to this product"
    )

    # Computed fields
    image_url = serializers.SerializerMethodField()
    has_modifiers = serializers.SerializerMethodField()
    modifier_summary = serializers.SerializerMethodField()
    modifier_groups = serializers.SerializerMethodField()
    category_display_name = serializers.ReadOnlyField()
    is_uncategorized = serializers.ReadOnlyField()

    # POS/Order-specific nested representations (hierarchical)
    category = serializers.SerializerMethodField()
    product_type = serializers.SerializerMethodField()

    # Read-only fields
    original_filename = serializers.CharField(read_only=True)

    # Image field
    image = ImageField(required=False)

    class Meta:
        model = Product
        fields = [
            # Core fields (always present)
            "id",
            "name",
            "price",
            "barcode",

            # Status fields
            "is_active",
            "is_public",
            "track_inventory",

            # Descriptive fields
            "description",

            # Relationship IDs (default)
            "category_id",
            "product_type_id",
            "tax_ids",

            # Relationship nested (via SerializerMethodField for custom formatting)
            "category",
            "product_type",

            # Computed fields
            "image_url",
            "has_modifiers",
            "modifier_summary",
            "modifier_groups",
            "category_display_name",
            "is_uncategorized",

            # Image fields
            "image",
            "original_filename",

            # Timestamps
            "created_at",
            "updated_at",
        ]

        # View mode fieldsets
        fieldsets = {
            # Minimal list view (replaces OptimizedProductSerializer)
            'list': [
                'id', 'name', 'price', 'barcode', 'is_active', 'category_id'
            ],

            # POS terminal view (replaces POSProductSerializer)
            'pos': [
                'id', 'name', 'price', 'barcode', 'is_active',
                'category', 'product_type',
                'has_modifiers', 'modifier_summary', 'modifier_groups',
                'image'
            ],

            # Sync to Electron (replaces ProductSyncSerializer)
            'sync': [
                'id', 'name', 'description', 'price', 'barcode',
                'category_id', 'product_type_id', 'tax_ids',
                'is_active', 'is_public', 'track_inventory',
                'created_at', 'updated_at'
            ],

            # FK references only (replaces BasicProductSerializer)
            # IMPORTANT: No price field - used for nested serializers
            'reference': [
                'id', 'name', 'barcode'
            ],

            # Order item representation (for OrderItemSerializer.product field)
            'order_item': [
                'id', 'name', 'price', 'description', 'barcode',
                'is_active', 'track_inventory',
                'modifier_groups', 'image_url',
                'category', 'product_type'
            ],

            # Full detail view (default)
            'detail': [
                'id', 'name', 'description', 'price', 'barcode',
                'category_id', 'category_display_name', 'is_uncategorized',
                'product_type_id', 'tax_ids',
                'is_active', 'is_public', 'track_inventory',
                'image', 'image_url', 'original_filename',
                'modifier_groups',
                'created_at', 'updated_at'
            ],
        }

        # Expandable relationships (?expand=category,taxes,product_type,modifier_groups)
        expandable = {
            'category': (CategorySerializer, {'source': 'category', 'many': False}),
            'taxes': (TaxSerializer, {'source': 'taxes', 'many': True}),
            'product_type': (ProductTypeSerializer, {'source': 'product_type', 'many': False}),
            # Note: modifier_groups is always a SerializerMethodField, not truly expandable
        }

        # Optimization hints
        select_related_fields = ["category", "product_type"]
        prefetch_related_fields = [
            "taxes",
            "product_modifier_sets__modifier_set__options",
            "product_modifier_sets__hidden_options",
            "product_modifier_sets__extra_options",
        ]

        # Required fields (always included even if not in fieldset)
        required_fields = {'id'}

    def get_image_url(self, obj):
        """
        Get image URL using ProductImageService.
        Business logic extracted to service layer.
        """
        from .services import ProductImageService
        return ProductImageService.get_image_url(obj, self.context.get("request"))

    def get_has_modifiers(self, obj):
        """
        Check if product has any modifier sets.
        Uses prefetched cache to avoid N+1 queries.
        """
        if not hasattr(obj, 'product_modifier_sets'):
            return False
        # Cache the prefetched relation to avoid .exists() query
        modifier_sets = list(obj.product_modifier_sets.all())
        return len(modifier_sets) > 0

    def get_modifier_summary(self, obj):
        """
        Return count of modifier groups.
        Uses prefetched cache to avoid N+1 queries.
        """
        if not hasattr(obj, 'product_modifier_sets'):
            return 0
        # Cache the prefetched relation to avoid .count() query
        modifier_sets = list(obj.product_modifier_sets.all())
        return len(modifier_sets)

    def get_modifier_groups(self, obj):
        """
        Get modifier groups using service layer.
        Returns full nested structure with options and triggers.
        Uses prefetched cache to avoid N+1 queries.
        """
        # Quick check - if no modifier sets, return empty array immediately
        # Use prefetched cache instead of .exists()
        if not hasattr(obj, 'product_modifier_sets'):
            return []

        modifier_sets = list(obj.product_modifier_sets.all())
        if not modifier_sets:
            return []

        try:
            # Use service layer for complex business logic
            structured_data = ProductService.get_structured_modifier_groups_for_product(
                obj, context=self.context
            )

            # Update context with processed data
            context = self.context.copy() if self.context else {}
            context["options_for_set"] = structured_data['options_map']
            context["triggered_sets_for_option"] = structured_data['triggered_map']

            # Serialize the structured data
            return FinalProductModifierSetSerializer(
                structured_data['sets_to_return'],
                many=True,
                context=context
            ).data

        except Exception as e:
            # Log error and return empty list for graceful degradation
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error getting modifier groups for product {obj.id}: {e}")
            return []

    def get_category(self, obj):
        """
        Return category info with parent relationship for hierarchical display.
        Used for POS and order views.
        """
        if obj.category:
            category_data = {
                'id': obj.category.id,
                'name': obj.category.name,
                'order': obj.category.order
            }
            # Include parent information for hierarchical grouping
            if obj.category.parent:
                category_data['parent'] = {
                    'id': obj.category.parent.id,
                    'name': obj.category.parent.name,
                    'order': obj.category.parent.order
                }
            else:
                category_data['parent'] = None
            return category_data
        return None

    def get_product_type(self, obj):
        """
        Return product type details for order views.
        Used for order item serialization.
        """
        if obj.product_type:
            return {
                'id': obj.product_type.id,
                'name': obj.product_type.name,
                'description': obj.product_type.description
            }
        return None


class ProductCreateSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
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
            "id",
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
        read_only_fields = ["id"]

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
        
        # Get current product ID for updates (to exclude from uniqueness checks)
        exclude_product_id = None
        if self.instance:
            exclude_product_id = self.instance.id
        
        # Use service for comprehensive validation
        validated_data = ProductValidationService.validate_product_data(
            data, exclude_product_id=exclude_product_id
        )
        
        # Validate category assignment if provided
        if 'category_id' in validated_data:
            ProductValidationService.validate_category_assignment(
                exclude_product_id, validated_data['category_id']
            )
        
        # Validate pricing rules
        if 'price' in validated_data:
            ProductValidationService.validate_price_rules(
                validated_data['price']
            )
        
        return validated_data

    def create(self, validated_data):
        image = validated_data.pop("image", None)

        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        # Pass tenant to service for tenant isolation
        product = ProductService.create_product(tenant=tenant, **validated_data)

        if image:
            # Process image asynchronously
            from .image_service import ImageService

            ImageService.process_image_async(product.id, image)

        return product

    def update(self, instance, validated_data):
        """
        Handle updates, including writable extras like category_id and tax_ids.
        Image updates are processed by signals; inventory adjustments are handled separately.
        """
        # Extract tenant from request (set by TenantMiddleware)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        # Extract write-only helper fields
        category_id = validated_data.pop("category_id", None)
        tax_ids = validated_data.pop("tax_ids", None)

        # Check if track_inventory is being enabled
        was_tracking = instance.track_inventory
        will_track = validated_data.get('track_inventory', was_tracking)
        newly_enabled = not was_tracking and will_track

        # Standard model fields update
        for field, value in validated_data.items():
            setattr(instance, field, value)

        # Handle category change if provided (validate tenant)
        if category_id is not None:
            if category_id:
                try:
                    category = Category.objects.get(id=category_id, tenant=tenant)
                    instance.category = category
                except Category.DoesNotExist:
                    raise serializers.ValidationError({
                        "category_id": f"Category with ID {category_id} not found or does not belong to this tenant"
                    })
            else:
                instance.category = None

        instance.save()

        # Handle taxes update if provided (validate tenant)
        if tax_ids is not None:
            if tenant:
                taxes = Tax.objects.filter(id__in=tax_ids, tenant=tenant)
                if taxes.count() != len(tax_ids):
                    raise serializers.ValidationError({
                        "tax_ids": "One or more tax IDs not found or do not belong to this tenant"
                    })
                instance.taxes.set(taxes)
            else:
                instance.taxes.set(Tax.objects.filter(id__in=tax_ids))

        # Create initial stock record if inventory tracking was just enabled
        if newly_enabled:
            from inventory.models import InventoryStock, Location
            from settings.models import StoreLocation

            # Get current store location from request context
            store_location_id = getattr(request, 'store_location_id', None) if request else None

            if store_location_id:
                store_location = StoreLocation.objects.filter(id=store_location_id, tenant=tenant).first()
            else:
                # Fallback to first store location for this tenant
                store_location = StoreLocation.objects.filter(tenant=tenant).first()

            if not store_location:
                # Can't create stock without a store location
                return instance

            # Get default inventory location for this store, or create one
            if store_location.default_inventory_location:
                location = store_location.default_inventory_location
            else:
                # Create a default location for this store if none exists
                location, created = Location.objects.get_or_create(
                    name="Main Storage",
                    tenant=tenant,
                    store_location=store_location,
                    defaults={"description": "Default inventory location"},
                )
                if created:
                    store_location.default_inventory_location = location
                    store_location.save()

            # Create stock record with quantity 0 if it doesn't exist
            InventoryStock.objects.get_or_create(
                product=instance,
                location=location,
                defaults={
                    "tenant": tenant,
                    "quantity": 0,
                    "store_location": location.store_location
                }
            )

        return instance
