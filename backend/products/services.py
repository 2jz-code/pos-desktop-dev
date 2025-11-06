from .models import Product, Category, Tax, ProductType, ModifierSet, ModifierOption, ProductModifierSet
from django.db import transaction
from rest_framework.exceptions import ValidationError
from core_backend.infrastructure.cache_utils import cache_static_data, cache_dynamic_data
from collections import defaultdict
from typing import Optional, Dict, Any, List


class ProductService:
    @staticmethod
    @transaction.atomic
    def create_product(tenant=None, **kwargs):
        """
        Creates a new product.

        Args:
            tenant: Tenant from request.tenant (required for tenant isolation)
            **kwargs: The data for the product.

        Raises:
            ValueError: If tenant is not provided or if related objects don't belong to tenant
        """
        if not tenant:
            raise ValueError("Tenant is required to create a product")

        category_id = kwargs.pop("category_id", None)
        tax_ids = kwargs.pop("tax_ids", [])
        # Keep the image_file in kwargs so the model gets it and the signal can process it
        # image_file = kwargs.pop("image", None)  # Don't remove the image from kwargs

        # Extract inventory-related data
        initial_stock = kwargs.pop("initial_stock", 0)
        location_id = kwargs.pop("location_id", None)

        # Validate and set category (must belong to same tenant)
        if category_id:
            try:
                category = Category.objects.get(id=category_id, tenant=tenant)
                kwargs["category"] = category
            except Category.DoesNotExist:
                raise ValueError(f"Category with ID {category_id} not found or does not belong to this tenant")

        # Set tenant on the product
        kwargs["tenant"] = tenant

        product = Product.objects.create(**kwargs)

        # Remove manual image processing - let the signal handle it
        # if image_file:
        #     processed_image = ImageService.process_image(image_file)
        #     product.image.save(processed_image.name, processed_image, save=True)
        #     product.save()  # Save product again to update image field

        # Validate and set taxes (must belong to same tenant)
        if tax_ids:
            taxes = Tax.objects.filter(id__in=tax_ids, tenant=tenant)
            if taxes.count() != len(tax_ids):
                raise ValueError("One or more tax IDs not found or do not belong to this tenant")
            product.taxes.set(taxes)

        # Create initial stock record if tracking inventory
        if product.track_inventory:
            from inventory.models import InventoryStock, Location
            from settings.models import StoreLocation

            # Use provided location or default location
            if location_id:
                try:
                    location = Location.objects.get(id=location_id, tenant=tenant)
                except Location.DoesNotExist:
                    raise ValueError(f"Location with ID {location_id} not found or does not belong to this tenant")
            else:
                # Get first store location for this tenant
                store_location = StoreLocation.objects.filter(tenant=tenant).first()
                if not store_location:
                    raise ValueError("No store location found for this tenant. Please create a store location first.")

                # Get or create default inventory location for this store
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

            # Create the stock record
            InventoryStock.objects.create(
                product=product,
                location=location,
                store_location=location.store_location,  # Denormalized from location
                quantity=float(initial_stock),
                tenant=tenant
            )

        return product

    @staticmethod
    @cache_static_data(timeout=3600*2)  # 2 hours in static cache
    def get_cached_products_list():
        """Cache the most common product query in static data cache with hierarchical ordering"""
        from django.db import models
        return list(Product.objects.select_related(
            "category", "category__parent", "product_type"
        ).prefetch_related(
            "taxes",
            "modifier_sets",
            "product_modifier_sets__modifier_set__options",
            "product_modifier_sets__hidden_options",
            "product_modifier_sets__extra_options",
            "product_type__default_taxes"
        ).filter(is_active=True).annotate(
            # Calculate parent order for hierarchical sorting
            parent_order=models.Case(
                models.When(category__parent_id__isnull=True, then=models.F('category__order')),
                default=models.F('category__parent__order'),
                output_field=models.IntegerField()
            ),
            # Mark category level (0 for parent, 1 for child)
            category_level=models.Case(
                models.When(category__parent_id__isnull=True, then=models.Value(0)),
                default=models.Value(1),
                output_field=models.IntegerField()
            )
        ).order_by('parent_order', 'category_level', 'category__order', 'category__name', 'name'))

    @staticmethod
    @cache_static_data(timeout=3600*2)  # 2 hours in static cache
    def get_cached_active_products_list():
        """Cache specifically for is_active=true POS requests with hierarchical ordering"""
        from django.db import models
        return list(Product.objects.select_related(
            "category", "category__parent", "product_type"
        ).prefetch_related(
            "taxes",
            "modifier_sets",
            "product_modifier_sets__modifier_set__options",
            "product_modifier_sets__hidden_options",
            "product_modifier_sets__extra_options",
            "product_type__default_taxes"
        ).filter(is_active=True).annotate(
            # Calculate parent order for hierarchical sorting
            parent_order=models.Case(
                models.When(category__parent_id__isnull=True, then=models.F('category__order')),
                default=models.F('category__parent__order'),
                output_field=models.IntegerField()
            ),
            # Mark category level (0 for parent, 1 for child)
            category_level=models.Case(
                models.When(category__parent_id__isnull=True, then=models.Value(0)),
                default=models.Value(1),
                output_field=models.IntegerField()
            )
        ).order_by('parent_order', 'category_level', 'category__order', 'category__name', 'name'))
    
    @staticmethod
    @cache_static_data(timeout=3600*8)  # 8 hours - categories change rarely
    def get_cached_category_tree():
        """Cache category hierarchy in hierarchical order - changes infrequently"""
        return Category.objects.all_hierarchical_order().select_related("parent").prefetch_related("children")
    
    @staticmethod
    @cache_static_data(timeout=3600*24)  # 24 hours - very static
    def get_cached_product_types():
        """Cache product types - very static"""
        return list(ProductType.objects.all())
    
    @staticmethod
    @cache_static_data(timeout=3600*12)  # 12 hours - taxes change infrequently
    def get_cached_taxes():
        """Cache taxes - relatively static"""
        return list(Tax.objects.all())
    
    @staticmethod
    @cache_static_data(timeout=3600*6)  # 6 hours - moderate changes
    def get_cached_modifier_sets():
        """Cache modifier sets with options"""
        return list(ModifierSet.objects.prefetch_related(
            'options',
            'product_modifier_sets__product'
        ))
    
    @staticmethod
    @cache_static_data(timeout=3600*4)  # 4 hours - complete POS layout
    def get_pos_menu_layout():
        """Cache complete POS menu structure for fast startup"""
        try:
            # Get all the cached components
            categories = ProductService.get_cached_category_tree()
            products = ProductService.get_cached_active_products_list()
            modifiers = ProductService.get_cached_modifier_sets()
            taxes = ProductService.get_cached_taxes()
            product_types = ProductService.get_cached_product_types()
            
            # Get inventory status
            from inventory.services import InventoryService
            availability = InventoryService.get_inventory_availability_status()
            
            # Build comprehensive menu layout
            layout = {
                'categories': [
                    {
                        'id': cat.id if hasattr(cat, 'id') else cat['id'],
                        'name': cat.name if hasattr(cat, 'name') else cat['name'],
                        'order': getattr(cat, 'order', 0),
                        'parent_id': cat.parent_id if hasattr(cat, 'parent_id') else cat.get('parent_id'),
                        'level': getattr(cat, 'level', 0)
                    }
                    for cat in categories
                ],
                'products': [
                    {
                        'id': prod.id if hasattr(prod, 'id') else prod['id'],
                        'name': prod.name if hasattr(prod, 'name') else prod['name'],
                        'price': float(prod.price if hasattr(prod, 'price') else prod['price']),
                        'category_id': prod.category_id if hasattr(prod, 'category_id') else prod.get('category_id'),
                        'product_type_id': prod.product_type_id if hasattr(prod, 'product_type_id') else prod.get('product_type_id'),
                        'is_active': prod.is_active if hasattr(prod, 'is_active') else prod.get('is_active', True),
                        'track_inventory': prod.track_inventory if hasattr(prod, 'track_inventory') else prod.get('track_inventory', False),
                        'availability': availability.get(prod.id if hasattr(prod, 'id') else prod['id'], {
                            'status': 'unknown',
                            'stock_level': 0,
                            'can_make': False
                        })
                    }
                    for prod in products
                ],
                'modifier_sets': [
                    {
                        'id': mod.id if hasattr(mod, 'id') else mod['id'],
                        'name': mod.name if hasattr(mod, 'name') else mod['name'],
                        'selection_type': mod.selection_type if hasattr(mod, 'selection_type') else mod.get('selection_type'),
                        'min_selections': mod.min_selections if hasattr(mod, 'min_selections') else mod.get('min_selections', 0),
                        'max_selections': mod.max_selections if hasattr(mod, 'max_selections') else mod.get('max_selections')
                    }
                    for mod in modifiers
                ],
                'taxes': [
                    {
                        'id': tax.id if hasattr(tax, 'id') else tax['id'],
                        'name': tax.name if hasattr(tax, 'name') else tax['name'],
                        'rate': float(tax.rate if hasattr(tax, 'rate') else tax['rate'])
                    }
                    for tax in taxes
                ],
                'product_types': [
                    {
                        'id': pt.id if hasattr(pt, 'id') else pt['id'],
                        'name': pt.name if hasattr(pt, 'name') else pt['name']
                    }
                    for pt in product_types
                ],
                'metadata': {
                    'total_categories': len(categories),
                    'total_products': len(products),
                    'total_modifiers': len(modifiers),
                    'total_taxes': len(taxes),
                    'cache_generated_at': 'cached'
                }
            }
            
            return layout
            
        except Exception as e:
            # Return minimal layout on error
            return {
                'categories': [],
                'products': [],
                'modifier_sets': [],
                'taxes': [],
                'product_types': [],
                'metadata': {
                    'error': f'Failed to generate menu layout: {str(e)}',
                    'total_categories': 0,
                    'total_products': 0,
                    'total_modifiers': 0,
                    'total_taxes': 0
                }
            }

    @staticmethod
    @cache_static_data(timeout=3600)  # 1-hour cache for category-specific product lists
    def get_cached_products_by_category(category_id=None, is_active=True):
        """Cache product retrieval with category filtering for faster category browsing"""
        from django.db import models
        
        queryset = Product.objects.select_related(
            "category", "category__parent", "product_type"
        ).prefetch_related(
            "taxes",
            "modifier_sets",
            "product_modifier_sets__modifier_set__options",
            "product_modifier_sets__hidden_options", 
            "product_modifier_sets__extra_options"
        )
        
        # Apply category filter if specified
        if category_id:
            queryset = queryset.filter(category_id=category_id)
            
        # Apply active filter
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
            
        return list(queryset.annotate(
            # Calculate parent order for hierarchical sorting
            parent_order=models.Case(
                models.When(category__parent_id__isnull=True, then=models.F('category__order')),
                default=models.F('category__parent__order'),
                output_field=models.IntegerField()
            ),
            # Mark category level (0 for parent, 1 for child)
            category_level=models.Case(
                models.When(category__parent_id__isnull=True, then=models.Value(0)),
                default=models.Value(1),
                output_field=models.IntegerField()
            )
        ).order_by('parent_order', 'category_level', 'category__order', 'category__name', 'name'))
    
    @staticmethod
    @cache_static_data(timeout=1800)  # 30-minute cache for inventory-aware product data
    def get_cached_products_with_inventory_status(location_id=None):
        """Cache products with current inventory status for POS interfaces"""
        try:
            # Get all active products
            products = ProductService.get_cached_active_products_list()
            
            # Get inventory status
            from inventory.services import InventoryService
            
            if location_id:
                availability = InventoryService.get_inventory_availability_for_location(location_id)
            else:
                availability = InventoryService.get_inventory_availability_status()
            
            # Enhance products with inventory data
            enhanced_products = []
            for product in products:
                product_id = product.id if hasattr(product, 'id') else product['id']
                inventory_info = availability.get(product_id, {
                    'status': 'unknown',
                    'stock_level': 0,
                    'can_make': False
                })
                
                # Create enhanced product dict
                enhanced_product = {
                    'id': product_id,
                    'name': product.name if hasattr(product, 'name') else product['name'],
                    'price': float(product.price if hasattr(product, 'price') else product['price']),
                    'category_id': product.category_id if hasattr(product, 'category_id') else product.get('category_id'),
                    'is_active': product.is_active if hasattr(product, 'is_active') else product.get('is_active', True),
                    'track_inventory': product.track_inventory if hasattr(product, 'track_inventory') else product.get('track_inventory', False),
                    'inventory': inventory_info
                }
                enhanced_products.append(enhanced_product)
            
            return enhanced_products
            
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to generate products with inventory status: {e}")
            # Return basic product list on error
            return ProductService.get_cached_active_products_list()
    
    @staticmethod
    def invalidate_product_cache(product_id, tenant=None):
        """
        Invalidate product-related caches when products change

        Args:
            product_id: ID of the product that changed
            tenant: Tenant instance for proper cache scoping (if None, uses current tenant context)
        """
        from core_backend.infrastructure.cache_utils import invalidate_cache_pattern

        cache_patterns = [
            f'*product_{product_id}*',
            '*get_cached_products_list*',
            '*get_cached_active_products_list*',
            '*get_cached_products_by_category*',
            '*get_cached_products_with_inventory_status*',
            '*get_pos_menu_layout*',
            '*get_cached_category_tree*'
        ]

        # CRITICAL: Pass tenant to ensure proper tenant-scoped cache invalidation
        for pattern in cache_patterns:
            invalidate_cache_pattern(pattern, tenant=tenant)
    
    @staticmethod
    def get_structured_modifier_groups_for_product(product, context=None):
        """
        Get structured modifier groups for a product.
        Moved from ProductSerializer to service layer for better architecture.
        
        Args:
            product: Product instance (must have prefetched modifier data)
            context: Serializer context (for request parameters)
            
        Returns:
            Dict with structured modifier group data ready for serialization
        """
        # Validate that we have prefetched data
        if not hasattr(product, "product_modifier_sets"):
            return {'sets_to_return': [], 'options_map': {}, 'triggered_map': {}}

        # Only clear cache if we're in a context where modifiers might have changed
        # For normal read operations (serialization), use prefetched data for performance
        if context and context.get('force_refresh_modifiers', False):
            prefetch_cache = getattr(product, '_prefetched_objects_cache', {})
            prefetch_cache.pop('product_modifier_sets', None)
        
        product_modifier_sets = product.product_modifier_sets.all()

        # If there are no modifier sets, return empty structure
        if not product_modifier_sets:
            return {'sets_to_return': [], 'options_map': {}, 'triggered_map': {}}

        # Build data structures
        all_sets_data = {}
        options_map = {}
        triggered_map = defaultdict(list)

        # Extract parameters from context
        request = context.get('request') if context else None
        
        # Handle both DRF Request (has query_params) and Django WSGIRequest (has GET)
        query_params = getattr(request, 'query_params', getattr(request, 'GET', {})) if request else {}
        visible_only = query_params.get('visible_only', '').lower() == 'true'
        include_all_modifiers = query_params.get('include_all_modifiers', '').lower() == 'true'
        
        # For cart/order contexts, always include all modifiers if the product has any
        if not include_all_modifiers and product_modifier_sets:
            include_all_modifiers = True
        
        for pms in product_modifier_sets:
            ms = pms.modifier_set
            all_sets_data[ms.id] = {
                "id": ms.id,
                "name": ms.name,
                "internal_name": ms.internal_name,
                "selection_type": ms.selection_type,
                "min_selections": 1 if pms.is_required_override else ms.min_selections,
                "max_selections": ms.max_selections,
                "triggered_by_option_id": ms.triggered_by_option_id,
            }

            # Get all options (global + product-specific)
            global_options = {
                opt.id: opt for opt in ms.options.filter(is_product_specific=False)
            }
            extra_options = {opt.id: opt for opt in pms.extra_options.all()}
            all_options = {**global_options, **extra_options}
            
            # Get hidden option IDs
            hidden_ids = {opt.id for opt in pms.hidden_options.all()}
            
            if visible_only:
                # Filter out hidden options for customer-facing endpoints
                final_options = [
                    opt for opt in all_options.values() if opt.id not in hidden_ids
                ]
            else:
                # Include all options with is_hidden field for admin/management
                final_options = list(all_options.values())
                # Mark which options are hidden
                for opt in final_options:
                    opt.is_hidden_for_product = opt.id in hidden_ids
            
            final_options = sorted(final_options, key=lambda o: o.display_order)
            options_map[ms.id] = final_options

        # Process triggered sets
        for set_id, set_data in all_sets_data.items():
            trigger_id = set_data.pop("triggered_by_option_id")
            if trigger_id:
                triggered_map[trigger_id].append(set_data)

        # Determine which sets to return based on include_all_modifiers parameter
        if include_all_modifiers:
            # Return all modifier sets associated with the product (for management UI)
            sets_to_return = list(all_sets_data.values())
        else:
            # Find sets that are not triggered by any option (root-level sets only)
            triggered_set_ids = {
                s["id"] for sets_list in triggered_map.values() for s in sets_list
            }
            root_level_sets = [
                data
                for data in all_sets_data.values()
                if data["id"] not in triggered_set_ids
            ]
            
            # Also include conditional sets that are being used as standalone base modifiers
            standalone_conditional_sets = []
            for set_data in all_sets_data.values():
                trigger_option_id = set_data.get("triggered_by_option_id")
                if trigger_option_id and set_data["id"] not in [
                    s["id"] for s in root_level_sets
                ]:
                    # This is a triggered set, check if its trigger option is available in this product
                    trigger_option_in_product = any(
                        trigger_option_id
                        in [opt.id for opt in options_map.get(ms_id, [])]
                        for ms_id in all_sets_data.keys()
                    )
                    if not trigger_option_in_product:
                        # Trigger option not available in this product, treat as standalone
                        standalone_conditional_sets.append(set_data)
            
            sets_to_return = root_level_sets + standalone_conditional_sets
        
        return {
            'sets_to_return': sets_to_return,
            'options_map': options_map,
            'triggered_map': dict(triggered_map)
        }

    @staticmethod
    @transaction.atomic
    def bulk_update_products(product_ids, update_fields):
        """
        Updates multiple products atomically.

        Args:
            product_ids: List of product IDs to update
            update_fields: Dictionary of fields to update (category, product_type)

        Returns:
            Dictionary with success/failure counts and any errors
        """
        from .models import Product, Category, ProductType

        updated_count = 0
        errors = []

        # Validate and prepare update data
        update_data = {}

        if 'category' in update_fields:
            category_id = update_fields['category']
            if category_id is not None:
                try:
                    category = Category.objects.get(id=category_id)
                    update_data['category'] = category
                except Category.DoesNotExist:
                    return {
                        'success': False,
                        'updated_count': 0,
                        'error': f'Category with ID {category_id} not found'
                    }
            else:
                update_data['category'] = None

        if 'product_type' in update_fields:
            product_type_id = update_fields['product_type']
            if product_type_id is not None:
                try:
                    product_type = ProductType.objects.get(id=product_type_id)
                    update_data['product_type'] = product_type
                except ProductType.DoesNotExist:
                    return {
                        'success': False,
                        'updated_count': 0,
                        'error': f'Product type with ID {product_type_id} not found'
                    }
            else:
                update_data['product_type'] = None

        # Perform bulk update
        try:
            # Process in batches to avoid memory issues with large updates
            BATCH_SIZE = 500
            total_updated = 0

            # Split product_ids into batches
            for i in range(0, len(product_ids), BATCH_SIZE):
                batch_ids = product_ids[i:i + BATCH_SIZE]
                products = Product.objects.filter(id__in=batch_ids)

                if not products.exists():
                    continue

                # Use bulk_update for performance - much faster than individual saves
                products_to_update = []
                for product in products:
                    for field, value in update_data.items():
                        setattr(product, field, value)
                    products_to_update.append(product)

                # Bulk update all products in this batch at once
                if products_to_update:
                    Product.objects.bulk_update(
                        products_to_update,
                        list(update_data.keys()),
                        batch_size=500
                    )
                    total_updated += len(products_to_update)

            if total_updated == 0:
                return {
                    'success': False,
                    'updated_count': 0,
                    'error': 'No products found with the provided IDs'
                }

            # Invalidate caches in bulk (using centralized function with tenant scoping)
            from core_backend.infrastructure.cache_utils import invalidate_cache_pattern
            from tenant.managers import get_current_tenant
            tenant = get_current_tenant()
            invalidate_cache_pattern('*get_cached_products_list*', tenant=tenant)
            invalidate_cache_pattern('*get_cached_active_products_list*', tenant=tenant)

            return {
                'success': True,
                'updated_count': total_updated,
                'total_requested': len(product_ids),
                'errors': None
            }

        except Exception as e:
            return {
                'success': False,
                'updated_count': updated_count,
                'error': str(e)
            }


class BaseSelectionStrategy:
    def validate(self, pms, options_in_set):
        raise NotImplementedError("Subclasses must implement this method.")


class SingleSelectionStrategy(BaseSelectionStrategy):
    def validate(self, pms, options_in_set):
        is_required = pms.is_required_override or (pms.modifier_set.min_selections > 0)
        if is_required and not options_in_set:
            raise ValidationError(
                f"A selection is required for '{pms.modifier_set.name}'."
            )
        if len(options_in_set) > 1:
            raise ValidationError(
                f"Only one option can be selected for '{pms.modifier_set.name}'."
            )


class MultipleSelectionStrategy(BaseSelectionStrategy):
    def validate(self, pms, options_in_set):
        num_options = len(options_in_set)
        min_selections = pms.modifier_set.min_selections
        max_selections = pms.modifier_set.max_selections

        if num_options < min_selections:
            raise ValidationError(
                f"You must select at least {min_selections} options for '{pms.modifier_set.name}'."
            )
        if max_selections is not None and num_options > max_selections:
            raise ValidationError(
                f"You can select at most {max_selections} options for '{pms.modifier_set.name}'."
            )


class ModifierValidationService:
    STRATEGIES = {
        "SINGLE": SingleSelectionStrategy(),
        "MULTIPLE": MultipleSelectionStrategy(),
    }

    @classmethod
    def validate_product_selection(cls, product, selected_option_ids):
        if not selected_option_ids:
            # If no options are selected, we only need to check if any required groups were missed.
            required_sets = ProductModifierSet.objects.filter(
                product=product, is_required_override=True
            )
            if required_sets.exists():
                raise ValidationError(
                    f"A selection for '{required_sets.first().modifier_set.name}' is required."
                )
            return

        selected_ids_set = set(selected_option_ids)
        product_modifier_sets = (
            product.product_modifier_sets.all()
            .select_related("modifier_set")
            .prefetch_related(
                "modifier_set__options",
                "hidden_options",
                "extra_options",
                "modifier_set__triggered_by_option",
            )
        )

        all_valid_option_ids = set()
        selections_by_pms = {pms.id: [] for pms in product_modifier_sets}

        for pms in product_modifier_sets:
            valid_options = (
                set(pms.modifier_set.options.filter(is_product_specific=False)) | set(pms.extra_options.all())
            ) - set(pms.hidden_options.all())
            valid_ids_for_set = {opt.id for opt in valid_options}
            all_valid_option_ids.update(valid_ids_for_set)

            for opt_id in selected_ids_set:
                if opt_id in valid_ids_for_set:
                    selections_by_pms[pms.id].append(opt_id)

        # 1. Check for any invalid or disallowed options
        if not selected_ids_set.issubset(all_valid_option_ids):
            invalid_options = selected_ids_set - all_valid_option_ids
            raise ValidationError(
                f"Invalid modifier option(s) selected: {invalid_options}"
            )

        # 2. Validate rules for each group and check for conditional logic violations
        for pms in product_modifier_sets:
            # If a group is conditional, its trigger option MUST be selected
            trigger_option = pms.modifier_set.triggered_by_option
            if trigger_option and trigger_option.id not in selected_ids_set:
                # Check if this conditional set is being used as a standalone base modifier
                # This happens when the trigger option doesn't belong to any modifier set associated with this product
                trigger_option_in_product = any(
                    trigger_option.id in {opt.id for opt in other_pms.modifier_set.options.all()}
                    for other_pms in product_modifier_sets
                )
                
                if trigger_option_in_product:
                    # Normal conditional logic - trigger option exists in product's modifier sets
                    if selections_by_pms[
                        pms.id
                    ]:  # A selection was made for a group that shouldn't be visible
                        raise ValidationError(
                            f"Cannot select options from '{pms.modifier_set.name}' without selecting its trigger option '{trigger_option.name}'."
                        )
                    continue  # Skip validation for non-triggered conditional groups
                else:
                    # Standalone conditional set - treat as base modifier set
                    # The trigger option is not available in this product, so this set acts as a base set
                    pass  # Continue to validation below

            strategy = cls.STRATEGIES.get(pms.modifier_set.selection_type)
            if strategy:
                strategy.validate(pms, selections_by_pms[pms.id])


class ProductValidationService:
    """
    Service layer for product validation and business rules.
    Extracts validation logic from serializers and views.
    """
    
    @staticmethod
    def validate_barcode_format(barcode: str) -> str:
        """
        Validate and normalize barcode format.
        
        Extracted from ProductSyncSerializer.validate_barcode().
        
        Args:
            barcode: The barcode string to validate
            
        Returns:
            str: Normalized barcode (None for empty values)
            
        Raises:
            ValidationError: If barcode format is invalid
        """
        if barcode == "" or barcode is None:
            return None
            
        # Additional barcode validation rules can be added here
        barcode = barcode.strip()
        
        if len(barcode) < 3:
            raise ValidationError("Barcode must be at least 3 characters long")
            
        if len(barcode) > 50:
            raise ValidationError("Barcode cannot exceed 50 characters")
            
        # Check for valid characters (alphanumeric and common barcode symbols)
        import re
        if not re.match(r'^[A-Za-z0-9\-_]+$', barcode):
            raise ValidationError("Barcode contains invalid characters. Use only alphanumeric, dash, and underscore.")
            
        return barcode
    
    @staticmethod
    def validate_product_data(data: dict, exclude_product_id: int = None) -> dict:
        """
        Validate product data with business rules.
        
        Args:
            data: Dictionary of product data
            exclude_product_id: Product ID to exclude from uniqueness checks (for updates)
            
        Returns:
            dict: Validated and normalized product data
            
        Raises:
            ValidationError: If validation fails
        """
        validated_data = data.copy()
        
        # Validate required fields
        if not validated_data.get('name', '').strip():
            raise ValidationError("Product name is required")
            
        # Validate price
        price = validated_data.get('price')
        if price is not None:
            if price < 0:
                raise ValidationError("Product price cannot be negative")
            if price > 99999.99:
                raise ValidationError("Product price cannot exceed $99,999.99")
        
        # Validate barcode if provided
        if 'barcode' in validated_data:
            validated_data['barcode'] = ProductValidationService.validate_barcode_format(
                validated_data['barcode']
            )
            
        # Check for duplicate barcode
        if validated_data.get('barcode'):
            barcode_query = Product.objects.filter(
                barcode=validated_data['barcode']
            )
            
            # Exclude current product during updates
            if exclude_product_id:
                barcode_query = barcode_query.exclude(id=exclude_product_id)
            
            existing_product = barcode_query.first()
            
            if existing_product:
                raise ValidationError(f"Product with barcode '{validated_data['barcode']}' already exists")
        
        return validated_data
    
    @staticmethod
    def validate_category_assignment(product_id: int, category_id: int) -> None:
        """
        Validate that a product can be assigned to a category.
        
        Args:
            product_id: ID of the product
            category_id: ID of the category
            
        Raises:
            ValidationError: If assignment is not valid
        """
        if category_id:
            try:
                category = Category.objects.get(id=category_id)
                if not category.is_active:
                    raise ValidationError("Cannot assign product to inactive category")
            except Category.DoesNotExist:
                raise ValidationError(f"Category with ID {category_id} does not exist")
    
    @staticmethod
    def validate_price_rules(price: float, cost: float = None) -> None:
        """
        Validate pricing business rules.
        
        Args:
            price: The selling price
            cost: The cost price (optional)
            
        Raises:
            ValidationError: If pricing rules are violated
        """
        if price < 0:
            raise ValidationError("Price cannot be negative")
            
        if cost is not None:
            if cost < 0:
                raise ValidationError("Cost cannot be negative")
            if cost > price:
                # Warning rather than error - allow negative margin but warn
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Product cost ({cost}) exceeds price ({price}) - negative margin")


class ProductSearchService:
    """
    Service layer for product search and filtering operations.
    Extracts search logic from views and provides advanced search capabilities.
    """
    
    @staticmethod
    def search_products_by_barcode(barcode: str, include_inactive: bool = False):
        """
        Search for products by barcode with business logic.
        
        Extracted from barcode_lookup view function (25+ lines).
        
        Args:
            barcode: The barcode to search for
            include_inactive: Whether to include inactive products
            
        Returns:
            Product instance or None if not found
            
        Raises:
            ValidationError: If barcode format is invalid
        """
        # Validate barcode format first
        normalized_barcode = ProductValidationService.validate_barcode_format(barcode)
        if not normalized_barcode:
            return None
            
        # Build query
        queryset = Product.objects.select_related(
            "category", "product_type"
        ).prefetch_related(
            "taxes",
            "product_modifier_sets__modifier_set__options",
            "product_modifier_sets__hidden_options", 
            "product_modifier_sets__extra_options"
        ).filter(barcode=normalized_barcode)
        
        # Filter by active status unless specifically including inactive
        if not include_inactive:
            queryset = queryset.filter(is_active=True)
            
        return queryset.first()
    
    @staticmethod
    def get_products_for_website(include_archived: bool = False):
        """
        Get products suitable for public website display.
        
        Extracted from ProductViewSet.get_queryset() business logic.
        
        Args:
            include_archived: Whether to include archived products
            
        Returns:
            QuerySet of public products
        """
        queryset = Product.objects.select_related(
            "category", "product_type"
        ).prefetch_related(
            "taxes",
            "product_modifier_sets__modifier_set__options",
            "product_modifier_sets__hidden_options", 
            "product_modifier_sets__extra_options"
        )
        
        if include_archived:
            queryset = queryset.with_archived()
            
        # Business rules for public website
        queryset = queryset.filter(
            is_public=True,
            category__is_public=True,
            category__is_active=True
        )
        
        return queryset.order_by(
            "category__order", "category__name", "name"
        )
    
    @staticmethod
    def get_products_modified_since(modified_since_str: str):
        """
        Get products modified since a specific datetime.
        
        Extracted from ProductViewSet.get_queryset() delta sync logic.
        
        Args:
            modified_since_str: ISO datetime string
            
        Returns:
            QuerySet of modified products or None if invalid date
        """
        from django.utils.dateparse import parse_datetime
        
        try:
            modified_since_dt = parse_datetime(modified_since_str)
            if modified_since_dt:
                return Product.objects.filter(updated_at__gte=modified_since_dt)
        except (ValueError, TypeError):
            pass
            
        return None
    
    @staticmethod
    def search_products_advanced(
        query: str = None,
        category_id: int = None,
        is_active: bool = None,
        is_public: bool = None,
        price_min: float = None,
        price_max: float = None,
        for_website: bool = False
    ):
        """
        Advanced product search with multiple filters.
        
        Args:
            query: Search query for name/description/barcode
            category_id: Filter by category
            is_active: Filter by active status
            is_public: Filter by public status
            price_min: Minimum price filter
            price_max: Maximum price filter
            for_website: Apply website-specific filters
            
        Returns:
            QuerySet of matching products
        """
        queryset = Product.objects.select_related(
            "category", "product_type"
        ).prefetch_related("taxes")
        
        # Apply website-specific filters
        if for_website:
            queryset = queryset.filter(
                is_public=True,
                category__is_public=True,
                category__is_active=True
            )
        
        # Text search
        if query:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(description__icontains=query) |
                Q(barcode__icontains=query)
            )
        
        # Category filter
        if category_id:
            queryset = queryset.filter(category_id=category_id)
            
        # Status filters
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
            
        if is_public is not None:
            queryset = queryset.filter(is_public=is_public)
            
        # Price filters
        if price_min is not None:
            queryset = queryset.filter(price__gte=price_min)
            
        if price_max is not None:
            queryset = queryset.filter(price__lte=price_max)
            
        return queryset.order_by(
            "category__order", "category__name", "name"
        )


class ProductImageService:
    """
    Service layer for product image handling.
    Centralizes image processing business logic.
    """
    
    @staticmethod
    def get_image_url(product, request=None):
        """
        Get the full image URL for a product.
        
        Extracted from ProductSerializer.get_image_url() method.
        
        Args:
            product: Product instance
            request: HTTP request for building absolute URL
            
        Returns:
            str: Full image URL or None if no image
        """
        if not product.image:
            return None
            
        if request:
            return request.build_absolute_uri(product.image.url)
        else:
            image_url = product.image.url
            if image_url.startswith("http"):
                return image_url
            else:
                from django.conf import settings
                base_url = getattr(settings, "BASE_URL", "http://127.0.0.1:8001")
                return f"{base_url}{image_url}"


class ProductAnalyticsService:
    """
    Service for product and modifier analytics operations.
    Extracted from ModifierSetViewSet for better architecture.
    """

    @staticmethod
    def get_modifier_set_usage_analytics(modifier_set) -> Dict[str, Any]:
        """
        Get usage analytics for a specific modifier set.
        Extracted from ModifierSetViewSet.get_usage_analytics()
        """
        from .serializers import ProductSerializer  # Import here to avoid circular imports

        # Get basic usage statistics
        product_count = modifier_set.product_modifier_sets.count()

        # Get list of products using this modifier set
        product_modifier_sets = modifier_set.product_modifier_sets.select_related(
            "product"
        ).all()
        products = [pms.product for pms in product_modifier_sets]

        # Serialize products using unified serializer with 'reference' fieldset
        # Returns: id, name, barcode only (no price)
        products_data = ProductSerializer(
            products,
            many=True,
            context={'view_mode': 'reference'}
        ).data

        # Calculate analytics data
        usage_data = {
            "modifier_set_id": modifier_set.id,
            "modifier_set_name": modifier_set.name,
            "product_count": product_count,
            "products": products_data,
            "is_used": product_count > 0,
            "usage_level": ProductAnalyticsService._get_usage_level(product_count),
            "option_count": modifier_set.options.count(),
            "selection_type": modifier_set.selection_type,
            "min_selections": modifier_set.min_selections,
            "max_selections": modifier_set.max_selections,
            "is_conditional": modifier_set.triggered_by_option is not None,
        }

        return usage_data

    @staticmethod
    def get_products_using_modifier_set(modifier_set) -> List[Dict[str, Any]]:
        """
        Get detailed information about products using a modifier set.
        Extracted from ModifierSetViewSet.get_products_using_modifier_set()
        """
        # Get products using this modifier set with their configurations
        product_modifier_sets = (
            modifier_set.product_modifier_sets.select_related("product")
            .prefetch_related("hidden_options", "extra_options")
            .all()
        )

        products_data = []
        for pms in product_modifier_sets:
            product = pms.product

            # Get hidden and extra options for this product
            hidden_options = list(pms.hidden_options.values("id", "name"))
            extra_options = list(
                pms.extra_options.values("id", "name", "price_delta")
            )

            product_data = {
                "id": product.id,
                "name": product.name,
                "barcode": product.barcode,
                "price": float(product.price),
                "is_active": product.is_active,
                "category": product.category.name if product.category else None,
                "modifier_config": {
                    "display_order": pms.display_order,
                    "is_required_override": pms.is_required_override,
                    "hidden_options": hidden_options,
                    "extra_options": extra_options,
                    "hidden_option_count": len(hidden_options),
                    "extra_option_count": len(extra_options),
                },
            }
            products_data.append(product_data)

        # Sort by display order, then by product name
        products_data.sort(
            key=lambda x: (x["modifier_config"]["display_order"], x["name"])
        )

        return products_data

    @staticmethod
    def get_modifier_sets_analytics_summary() -> Dict[str, Any]:
        """
        Get overall analytics summary for all modifier sets.
        Extracted from ModifierSetViewSet.get_analytics_summary()
        """
        from django.db import models

        modifier_sets = ModifierSet.objects.all()
        
        total_sets = modifier_sets.count()
        used_sets = (
            modifier_sets.filter(product_modifier_sets__isnull=False)
            .distinct()
            .count()
        )
        unused_sets = total_sets - used_sets

        # Calculate total products using modifiers
        total_products_with_modifiers = (
            Product.objects.filter(product_modifier_sets__isnull=False)
            .distinct()
            .count()
        )

        # Get modifier set usage distribution
        usage_distribution = {
            "unused": modifier_sets.filter(
                product_modifier_sets__isnull=True
            ).count(),
            "low_usage": modifier_sets.annotate(
                product_count=models.Count("product_modifier_sets")
            )
            .filter(product_count__gt=0, product_count__lte=3)
            .count(),
            "medium_usage": modifier_sets.annotate(
                product_count=models.Count("product_modifier_sets")
            )
            .filter(product_count__gt=3, product_count__lte=10)
            .count(),
            "high_usage": modifier_sets.annotate(
                product_count=models.Count("product_modifier_sets")
            )
            .filter(product_count__gt=10)
            .count(),
        }

        # Calculate average options per set
        avg_options_per_set = (
            modifier_sets.annotate(option_count=models.Count("options")).aggregate(
                models.Avg("option_count")
            )["option_count__avg"]
            or 0
        )

        summary_data = {
            "total_modifier_sets": total_sets,
            "used_modifier_sets": used_sets,
            "unused_modifier_sets": unused_sets,
            "usage_percentage": round(
                (used_sets / total_sets * 100) if total_sets > 0 else 0, 1
            ),
            "total_products_with_modifiers": total_products_with_modifiers,
            "average_options_per_set": round(avg_options_per_set, 1),
            "usage_distribution": usage_distribution,
            "most_used_sets": ProductAnalyticsService._get_most_used_sets(),
            "least_used_sets": ProductAnalyticsService._get_least_used_sets(),
        }

        return summary_data

    @staticmethod
    def _get_usage_level(product_count: int) -> str:
        """Helper method to determine usage level based on product count."""
        if product_count == 0:
            return "unused"
        elif product_count <= 3:
            return "low"
        elif product_count <= 10:
            return "medium"
        else:
            return "high"

    @staticmethod
    def _get_most_used_sets() -> List[Dict[str, Any]]:
        """Get the top 5 most used modifier sets."""
        from django.db import models
        return list(
            ModifierSet.objects.annotate(
                product_count=models.Count("product_modifier_sets")
            )
            .filter(product_count__gt=0)
            .order_by("-product_count")[:5]
            .values("id", "name", "internal_name", "product_count")
        )

    @staticmethod
    def _get_least_used_sets() -> List[Dict[str, Any]]:
        """Get modifier sets that are unused or have low usage."""
        from django.db import models
        return list(
            ModifierSet.objects.annotate(
                product_count=models.Count("product_modifier_sets")
            )
            .filter(product_count__lte=1)
            .order_by("product_count", "name")[:10]
            .values("id", "name", "internal_name", "product_count")
        )


class CategoryService:
    """
    Service layer for category management operations.
    Follows the established architecture pattern for business logic encapsulation.
    """

    @staticmethod
    @transaction.atomic
    def bulk_update_categories(category_updates: List[Dict[str, Any]], tenant=None) -> Dict[str, Any]:
        """
        Bulk update multiple categories in a single transaction.

        Args:
            tenant: Tenant from request.tenant (required for tenant isolation)
            category_updates: List of dictionaries containing category data:
                [
                    {"id": 1, "name": "Category 1", "order": 1, ...},
                    {"id": 2, "name": "Category 2", "order": 2, ...},
                ]

        Returns:
            Dict containing update results:
            {
                "success": True,
                "updated_count": 5,
                "updated_categories": [...],
                "errors": [...]
            }

        Raises:
            ValidationError: If validation fails for any category
        """
        if not tenant:
            raise ValueError("Tenant is required for bulk category updates")

        if not category_updates:
            raise ValidationError("No category updates provided")

        updated_categories = []
        errors = []

        for update_data in category_updates:
            category_id = update_data.get("id")
            if not category_id:
                errors.append({"error": "Missing category ID in update data"})
                continue

            try:
                # Get the category instance (validate tenant)
                category = Category.objects.select_for_update().get(id=category_id, tenant=tenant)

                # Validate and update fields
                CategoryService._update_category_fields(category, update_data, tenant=tenant)

                # Save the category
                category.save()

                # Add to successful updates
                updated_categories.append(category)
                
            except Category.DoesNotExist:
                errors.append({
                    "id": category_id, 
                    "error": "Category not found"
                })
            except ValidationError as e:
                errors.append({
                    "id": category_id,
                    "error": str(e)
                })
            except Exception as e:
                errors.append({
                    "id": category_id,
                    "error": f"Unexpected error: {str(e)}"
                })
        
        # Invalidate caches after successful bulk update
        if updated_categories:
            CategoryService._invalidate_category_caches()
        
        return {
            "success": len(updated_categories) > 0,
            "updated_count": len(updated_categories),
            "updated_categories": updated_categories,
            "errors": errors if errors else None
        }
    
    @staticmethod
    def _update_category_fields(category: 'Category', update_data: Dict[str, Any], tenant=None) -> None:
        """
        Update category fields with validation.

        Args:
            category: Category instance to update
            update_data: Dictionary of fields to update
            tenant: Tenant for validation (required)

        Raises:
            ValidationError: If validation fails
        """
        if not tenant:
            raise ValueError("Tenant is required for category field updates")

        # Update name with validation
        if "name" in update_data:
            name = update_data["name"]
            if not name or not name.strip():
                raise ValidationError("Category name cannot be empty")
            category.name = name.strip()

        # Update description
        if "description" in update_data:
            category.description = update_data["description"] or ""

        # Update order with validation
        if "order" in update_data:
            order = update_data["order"]
            if order is not None:
                try:
                    category.order = int(order)
                except (ValueError, TypeError):
                    raise ValidationError("Order must be a valid integer")

        # Update parent with validation (must belong to same tenant)
        if "parent_id" in update_data:
            parent_id = update_data["parent_id"]
            if parent_id is None:
                category.parent = None
            else:
                try:
                    parent_id = int(parent_id)
                    # Prevent self-reference
                    if parent_id == category.id:
                        raise ValidationError("Cannot set category as its own parent")

                    # Validate parent belongs to same tenant
                    parent = Category.objects.get(id=parent_id, tenant=tenant)
                    if not parent.is_active:
                        raise ValidationError("Cannot set inactive category as parent")

                    category.parent = parent
                except (ValueError, TypeError):
                    raise ValidationError("Parent ID must be a valid integer")
                except Category.DoesNotExist:
                    raise ValidationError(f"Parent category with ID {parent_id} does not exist or does not belong to this tenant")

        # Update public status
        if "is_public" in update_data:
            category.is_public = bool(update_data["is_public"])
    
    @staticmethod
    def _invalidate_category_caches() -> None:
        """
        Invalidate category-related caches after updates.
        Follows the established caching pattern.
        """
        # Clear static data caches related to categories
        from core_backend.infrastructure.cache_utils import invalidate_cache_pattern
        
        # Clear category tree cache
        invalidate_cache_pattern("*get_cached_category_tree*")
        
        # Clear product caches that include category data
        invalidate_cache_pattern("*get_cached_products_list*")
        invalidate_cache_pattern("*get_cached_active_products_list*")
        invalidate_cache_pattern("*get_pos_menu_layout*")
    
    @staticmethod
    def validate_category_hierarchy(category_id: int, parent_id: int = None) -> None:
        """
        Validate category hierarchy to prevent circular references.
        
        Args:
            category_id: ID of the category being updated
            parent_id: ID of the proposed parent category
            
        Raises:
            ValidationError: If hierarchy would create circular reference
        """
        if not parent_id:
            return
        
        if category_id == parent_id:
            raise ValidationError("Cannot set category as its own parent")
        
        # Check if the proposed parent is a descendant of this category
        def is_descendant(potential_parent_id: int, ancestor_id: int) -> bool:
            """Check if potential_parent is a descendant of ancestor"""
            try:
                parent = Category.objects.get(id=potential_parent_id)
                if parent.parent_id is None:
                    return False
                if parent.parent_id == ancestor_id:
                    return True
                return is_descendant(parent.parent_id, ancestor_id)
            except Category.DoesNotExist:
                return False
        
        if is_descendant(parent_id, category_id):
            raise ValidationError("Cannot create circular reference in category hierarchy")
    
    @staticmethod
    def reorder_categories_in_level(parent_id: int = None, category_orders: List[Dict[str, Any]] = None, tenant=None) -> List['Category']:
        """
        Reorder categories within the same hierarchical level.

        Args:
            parent_id: ID of parent category (None for root level)
            category_orders: List of {"id": int, "order": int} dictionaries
            tenant: Tenant from request.tenant (required for tenant isolation)

        Returns:
            List of updated Category instances

        Raises:
            ValidationError: If validation fails
        """
        if not tenant:
            raise ValueError("Tenant is required for category reordering")

        if not category_orders:
            return []

        with transaction.atomic():
            updated_categories = []

            for item in category_orders:
                category_id = item.get("id")
                new_order = item.get("order")

                if not category_id or new_order is None:
                    continue

                try:
                    category = Category.objects.select_for_update().get(
                        id=category_id,
                        parent_id=parent_id,
                        tenant=tenant
                    )
                    category.order = int(new_order)
                    category.save()
                    updated_categories.append(category)

                except Category.DoesNotExist:
                    raise ValidationError(
                        f"Category {category_id} not found in specified parent level or does not belong to this tenant"
                    )
                except (ValueError, TypeError):
                    raise ValidationError(f"Invalid order value for category {category_id}")

            # Invalidate caches after reordering
            CategoryService._invalidate_category_caches()

            return updated_categories
