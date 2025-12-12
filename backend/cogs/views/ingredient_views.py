"""
Ingredient configuration and cost views.
"""
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django_filters import rest_framework as filters

from cogs.models import IngredientConfig, ItemCostSource
from cogs.serializers import (
    IngredientConfigSerializer,
    IngredientConfigCreateSerializer,
    ItemCostSourceSerializer,
    ItemCostSourceCreateSerializer,
    ItemCostSourceUpdateSerializer,
)
from cogs.permissions import CanManageCOGS, CanViewCOGS


class IngredientConfigFilter(filters.FilterSet):
    """Filter for IngredientConfig."""
    product = filters.NumberFilter(field_name='product_id')
    base_unit = filters.NumberFilter(field_name='base_unit_id')

    class Meta:
        model = IngredientConfig
        fields = ['product', 'base_unit']


class IngredientConfigViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing IngredientConfigs.

    list: Get all ingredient configs for the tenant.
    retrieve: Get a specific config.
    create: Create a new config (manager+).
    update: Update a config (manager+).
    destroy: Soft delete a config (manager+).
    """
    permission_classes = [IsAuthenticated, CanViewCOGS]
    serializer_class = IngredientConfigSerializer
    filterset_class = IngredientConfigFilter

    def get_queryset(self):
        return IngredientConfig.objects.select_related(
            'product', 'base_unit'
        ).order_by('product__name')

    def get_serializer_class(self):
        if self.action in ['create']:
            return IngredientConfigCreateSerializer
        return IngredientConfigSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), CanManageCOGS()]
        return [IsAuthenticated(), CanViewCOGS()]

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class ItemCostSourceFilter(filters.FilterSet):
    """Filter for ItemCostSource."""
    product = filters.NumberFilter(field_name='product_id')
    store_location = filters.NumberFilter(field_name='store_location_id')
    source_type = filters.CharFilter(field_name='source_type')
    effective_after = filters.DateTimeFilter(field_name='effective_at', lookup_expr='gte')
    effective_before = filters.DateTimeFilter(field_name='effective_at', lookup_expr='lte')

    class Meta:
        model = ItemCostSource
        fields = ['product', 'store_location', 'source_type']


class ItemCostSourceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing ItemCostSources.

    list: Get all cost sources for the tenant.
    retrieve: Get a specific cost source.
    create: Create a new cost source (manager+).
    update: Update a cost source (manager+).
    destroy: Soft delete a cost source (manager+).
    latest: Get the latest cost for a product at a store.
    """
    permission_classes = [IsAuthenticated, CanViewCOGS]
    serializer_class = ItemCostSourceSerializer
    filterset_class = ItemCostSourceFilter

    def get_queryset(self):
        return ItemCostSource.objects.select_related(
            'product', 'store_location', 'unit', 'created_by'
        ).order_by('-effective_at', '-created_at')

    def get_serializer_class(self):
        if self.action == 'create':
            return ItemCostSourceCreateSerializer
        if self.action in ['update', 'partial_update']:
            return ItemCostSourceUpdateSerializer
        return ItemCostSourceSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), CanManageCOGS()]
        return [IsAuthenticated(), CanViewCOGS()]

    def perform_create(self, serializer):
        serializer.save(
            tenant=self.request.tenant,
            created_by=self.request.user
        )

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """
        Get the latest cost for a product at a store location.

        Query params:
        - product: Product ID (required)
        - store_location: Store location ID (required)
        """
        product_id = request.query_params.get('product')
        store_location_id = request.query_params.get('store_location')

        if not product_id or not store_location_id:
            return Response(
                {'error': 'Both product and store_location are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        cost_source = ItemCostSource.objects.filter(
            product_id=product_id,
            store_location_id=store_location_id
        ).order_by('-effective_at', '-created_at').first()

        if not cost_source:
            return Response(
                {'error': 'No cost found for this product at this location.'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ItemCostSourceSerializer(cost_source)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_product(self, request):
        """
        Get cost history for a specific product.

        Query params:
        - product: Product ID (required)
        - store_location: Store location ID (optional, filters to specific store)
        - limit: Max records to return (default 10)
        """
        product_id = request.query_params.get('product')
        if not product_id:
            return Response(
                {'error': 'Product ID is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(product_id=product_id)

        store_location_id = request.query_params.get('store_location')
        if store_location_id:
            queryset = queryset.filter(store_location_id=store_location_id)

        limit = int(request.query_params.get('limit', 10))
        queryset = queryset[:limit]

        serializer = ItemCostSourceSerializer(queryset, many=True)
        return Response(serializer.data)
