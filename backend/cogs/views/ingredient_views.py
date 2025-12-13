"""
Ingredient configuration and cost views.
"""
from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django_filters import rest_framework as filters

from products.models import Product
from settings.models import StoreLocation
from measurements.models import Unit
from cogs.models import IngredientConfig, ItemCostSource
from cogs.serializers import (
    IngredientConfigSerializer,
    IngredientConfigCreateSerializer,
    ItemCostSourceSerializer,
    ItemCostSourceCreateSerializer,
    ItemCostSourceUpdateSerializer,
)
from cogs.permissions import CanManageCOGS, CanViewCOGS
from cogs.services import CostingService


class PackCostCalculatorSerializer(serializers.Serializer):
    """Serializer for pack cost calculator input."""
    product_id = serializers.IntegerField(help_text="Product to set pack cost for")
    store_location_id = serializers.IntegerField(help_text="Store location for the cost")
    pack_unit_id = serializers.IntegerField(help_text="Pack unit (e.g., case, box)")
    base_unit_id = serializers.IntegerField(help_text="Base unit (e.g., each, lb)")
    units_per_pack = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="How many base units in one pack (e.g., 48)"
    )
    pack_cost = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Total cost of one pack (e.g., 24.00)"
    )

    def validate_units_per_pack(self, value):
        if value <= 0:
            raise serializers.ValidationError("Units per pack must be greater than 0")
        return value

    def validate_pack_cost(self, value):
        if value < 0:
            raise serializers.ValidationError("Pack cost cannot be negative")
        return value


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


class PackCostCalculatorView(APIView):
    """
    Calculate and save pack-based costs for ingredients.

    Example: A case of 48 cans for $24 → $0.50 per can

    POST /api/cogs/pack-calculator/
    {
        "product_id": 123,
        "store_location_id": 1,
        "pack_unit_id": 5,     // "case" unit
        "base_unit_id": 1,     // "each" unit
        "units_per_pack": 48,
        "pack_cost": "24.00"
    }

    Creates:
    1. Product-specific UnitConversion (case → each = 48)
    2. ItemCostSource for pack (case @ $24.00)
    3. ItemCostSource for base unit (each @ $0.50)
    """
    permission_classes = [IsAuthenticated, CanManageCOGS]

    def post(self, request):
        serializer = PackCostCalculatorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Fetch related objects
        try:
            product = Product.objects.get(
                id=data['product_id'],
                tenant=request.tenant
            )
        except Product.DoesNotExist:
            return Response(
                {'error': 'Product not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            store_location = StoreLocation.objects.get(
                id=data['store_location_id'],
                tenant=request.tenant
            )
        except StoreLocation.DoesNotExist:
            return Response(
                {'error': 'Store location not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            pack_unit = Unit.objects.get(id=data['pack_unit_id'])
        except Unit.DoesNotExist:
            return Response(
                {'error': 'Pack unit not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            base_unit = Unit.objects.get(id=data['base_unit_id'])
        except Unit.DoesNotExist:
            return Response(
                {'error': 'Base unit not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate units are different
        if pack_unit.id == base_unit.id:
            return Response(
                {'error': 'Pack unit and base unit must be different.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create the pack cost via CostingService
        costing_service = CostingService(
            tenant=request.tenant,
            store_location=store_location
        )

        result = costing_service.create_pack_cost(
            product=product,
            pack_unit=pack_unit,
            base_unit=base_unit,
            units_per_pack=data['units_per_pack'],
            pack_cost=data['pack_cost'],
            user=request.user
        )

        # Add derived cost per base unit to response
        derived_cost = (data['pack_cost'] / data['units_per_pack']).quantize(
            Decimal("0.0001")
        )

        return Response({
            'success': True,
            'product_id': product.id,
            'product_name': product.name,
            'pack_unit': pack_unit.name,
            'base_unit': base_unit.name,
            'pack_cost': str(data['pack_cost']),
            'units_per_pack': str(data['units_per_pack']),
            'derived_base_unit_cost': str(derived_cost),
            'details': result
        }, status=status.HTTP_201_CREATED)
