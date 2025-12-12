"""
Menu item COGS views - cost breakdown and fast setup.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination

from products.models import Product, ProductType
from inventory.models import Recipe, RecipeItem
from settings.models import StoreLocation
from cogs.models import Unit, IngredientConfig, ItemCostSource
from cogs.serializers import (
    MenuItemCostBreakdownSerializer,
    MenuItemCostSummarySerializer,
    FastSetupRequestSerializer,
)
from cogs.services import CostingService, ConversionService
from cogs.permissions import CanManageCOGS, CanViewCOGS, CanCreateIngredients


class MenuItemCOGSPagination(PageNumberPagination):
    """Pagination for menu item COGS list."""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class MenuItemCOGSListView(APIView):
    """
    List menu items with COGS summary.

    GET /api/cogs/menu-items/
    Query params:
    - store_location: Store location ID (required)
    - page: Page number
    - page_size: Items per page
    - category: Filter by category ID
    - search: Search by name
    - has_recipe: Filter to items with/without recipes (true/false)
    """
    permission_classes = [IsAuthenticated, CanViewCOGS]

    def get(self, request):
        store_location_id = request.query_params.get('store_location')
        if not store_location_id:
            return Response(
                {'error': 'store_location is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Tenant-scoped lookup for store location
        try:
            store_location = StoreLocation.objects.get(
                id=store_location_id,
                tenant=request.tenant
            )
        except StoreLocation.DoesNotExist:
            return Response(
                {'error': 'Store location not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get menu items - Product.objects already tenant-scoped via TenantSoftDeleteManager
        queryset = Product.objects.filter(
            is_active=True
        ).select_related('category', 'product_type').order_by('name')

        # Filter to menu items (those with RECIPE inventory behavior)
        queryset = queryset.filter(
            product_type__inventory_behavior=ProductType.InventoryBehavior.RECIPE
        )

        # Apply filters
        category_id = request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(name__icontains=search)

        # Apply has_recipe filter BEFORE pagination using subquery
        has_recipe = request.query_params.get('has_recipe')
        if has_recipe is not None:
            has_recipe_bool = has_recipe.lower() == 'true'
            recipe_exists = Recipe.objects.filter(
                menu_item=OuterRef('pk'),
                is_active=True
            )
            if has_recipe_bool:
                queryset = queryset.filter(Exists(recipe_exists))
            else:
                queryset = queryset.exclude(Exists(recipe_exists))

        # Paginate
        paginator = MenuItemCOGSPagination()
        page = paginator.paginate_queryset(queryset, request)

        # Compute COGS for each menu item
        costing_service = CostingService(request.tenant, store_location)
        summaries = costing_service.compute_menu_items_summary(page)

        serializer = MenuItemCostSummarySerializer(summaries, many=True)
        return paginator.get_paginated_response(serializer.data)


class MenuItemCOGSDetailView(APIView):
    """
    Get detailed COGS breakdown for a single menu item.

    GET /api/cogs/menu-items/:id/
    Query params:
    - store_location: Store location ID (required)
    """
    permission_classes = [IsAuthenticated, CanViewCOGS]

    def get(self, request, pk):
        store_location_id = request.query_params.get('store_location')
        if not store_location_id:
            return Response(
                {'error': 'store_location is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Tenant-scoped lookup for store location
        try:
            store_location = StoreLocation.objects.get(
                id=store_location_id,
                tenant=request.tenant
            )
        except StoreLocation.DoesNotExist:
            return Response(
                {'error': 'Store location not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Tenant-scoped lookup for menu item
        # Product.objects is already tenant-scoped via TenantSoftDeleteManager
        try:
            menu_item = Product.objects.get(id=pk)
        except Product.DoesNotExist:
            return Response(
                {'error': 'Menu item not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        costing_service = CostingService(request.tenant, store_location)
        breakdown = costing_service.compute_menu_item_cost(menu_item)

        serializer = MenuItemCostBreakdownSerializer(breakdown)
        return Response(serializer.data)


class MenuItemFastSetupView(APIView):
    """
    Fast setup for menu item COGS.

    POST /api/cogs/menu-items/:id/fast-setup/

    Allows quick setup of ingredients and costs for a menu item.
    - Creates/matches ingredient products
    - Creates IngredientConfig for each ingredient
    - Creates/updates ItemCostSource for each ingredient with cost
    - Creates/updates RecipeItem for each ingredient
    """
    permission_classes = [IsAuthenticated, CanManageCOGS]

    @transaction.atomic
    def post(self, request, pk):
        # Validate request
        serializer = FastSetupRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Tenant-scoped lookup for menu item
        # Product.objects is already tenant-scoped via TenantSoftDeleteManager
        try:
            menu_item = Product.objects.get(id=pk)
        except Product.DoesNotExist:
            return Response(
                {'error': 'Menu item not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Tenant-scoped lookup for store location
        try:
            store_location = StoreLocation.objects.get(
                id=data['store_location'],
                tenant=request.tenant
            )
        except StoreLocation.DoesNotExist:
            return Response(
                {'error': 'Store location not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get or create recipe (tenant-scoped)
        recipe, _ = Recipe.objects.get_or_create(
            tenant=request.tenant,
            menu_item=menu_item,
            defaults={'name': f"{menu_item.name} Recipe"}
        )

        conversion_service = ConversionService(request.tenant)
        errors = []
        processed_ingredients = []

        for idx, ingredient_data in enumerate(data['ingredients']):
            result = self._process_ingredient(
                request,
                ingredient_data,
                idx,
                recipe,
                store_location,
                conversion_service
            )

            if 'error' in result:
                errors.append(result)
            else:
                processed_ingredients.append(result)

        if errors:
            return Response(
                {
                    'error': 'Some ingredients could not be processed.',
                    'validation_errors': errors,
                    'processed_count': len(processed_ingredients),
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Return updated cost breakdown
        costing_service = CostingService(request.tenant, store_location)
        breakdown = costing_service.compute_menu_item_cost(menu_item)
        result_serializer = MenuItemCostBreakdownSerializer(breakdown)

        return Response({
            'message': f'Successfully set up {len(processed_ingredients)} ingredients.',
            'cost_breakdown': result_serializer.data,
        })

    def _process_ingredient(
        self,
        request,
        ingredient_data,
        index,
        recipe,
        store_location,
        conversion_service
    ):
        """
        Process a single ingredient from fast setup.

        Returns dict with either 'product' key (success) or 'error' key (failure).
        """
        name = ingredient_data['name']
        quantity = ingredient_data['quantity']
        unit_string = ingredient_data['unit']
        unit_cost = ingredient_data.get('unit_cost')
        ingredient_id = ingredient_data.get('ingredient_id')

        # 1. Resolve or create the ingredient product (tenant-scoped)
        if ingredient_id:
            # Use specified product - Product.objects is tenant-scoped
            try:
                product = Product.objects.get(id=ingredient_id)
            except Product.DoesNotExist:
                return {
                    'error': True,
                    'ingredient_index': index,
                    'ingredient_name': name,
                    'error_type': 'not_found',
                    'message': f'Product with ID {ingredient_id} not found.',
                }
        else:
            # Try to match by name (tenant-scoped via Product.objects)
            normalized_name = name.strip().lower()
            matches = Product.objects.filter(
                name__iexact=normalized_name
            )

            if matches.count() == 1:
                product = matches.first()
            elif matches.count() > 1:
                return {
                    'error': True,
                    'ingredient_index': index,
                    'ingredient_name': name,
                    'error_type': 'multiple_matches',
                    'message': f'Multiple products match "{name}". Please select one.',
                    'matches': [
                        {'id': p.id, 'name': p.name}
                        for p in matches[:5]
                    ]
                }
            else:
                # No match - create new product
                if not CanCreateIngredients().has_permission(request, self):
                    return {
                        'error': True,
                        'ingredient_index': index,
                        'ingredient_name': name,
                        'error_type': 'permission_denied',
                        'message': 'You do not have permission to create new ingredients.',
                    }

                # Get or create an "Ingredient" product type (tenant-scoped)
                ingredient_type, _ = ProductType.objects.get_or_create(
                    tenant=request.tenant,
                    name='Ingredient',
                    defaults={
                        'inventory_behavior': ProductType.InventoryBehavior.QUANTITY,
                        'stock_enforcement': ProductType.StockEnforcement.WARN,
                    }
                )

                product = Product.objects.create(
                    tenant=request.tenant,
                    name=name.strip(),
                    product_type=ingredient_type,
                    price=Decimal('0.00'),  # Ingredients don't have a selling price
                    is_public=False,  # Not visible to customers
                    track_inventory=True,
                )

        # 2. Resolve the unit (tenant-scoped via conversion_service)
        unit = conversion_service.map_string_to_unit(unit_string)
        if not unit:
            return {
                'error': True,
                'ingredient_index': index,
                'ingredient_name': name,
                'error_type': 'invalid_unit',
                'message': f'Unknown unit "{unit_string}". Please use a standard unit.',
            }

        # 3. Ensure IngredientConfig exists (tenant-scoped)
        ingredient_config, _ = IngredientConfig.objects.get_or_create(
            tenant=request.tenant,
            product=product,
            defaults={'base_unit': unit}
        )

        # 4. Create/update cost if provided (tenant-scoped)
        if unit_cost is not None:
            ItemCostSource.objects.update_or_create(
                tenant=request.tenant,
                store_location=store_location,
                product=product,
                unit=unit,
                defaults={
                    'unit_cost': unit_cost,
                    'source_type': 'manual',
                    'effective_at': timezone.now(),
                    'created_by': request.user,
                }
            )

        # 5. Create/update RecipeItem (tenant-scoped)
        RecipeItem.objects.update_or_create(
            tenant=request.tenant,
            recipe=recipe,
            product=product,
            defaults={
                'quantity': quantity,
                'unit': unit_string,
            }
        )

        return {
            'product': product,
            'unit': unit,
            'quantity': quantity,
            'cost_set': unit_cost is not None,
        }
