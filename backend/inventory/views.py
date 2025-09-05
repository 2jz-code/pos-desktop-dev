from django.db.models import Q
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from datetime import timedelta
from rest_framework import generics, permissions, status, viewsets, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from users.permissions import IsAdminOrHigher
from .models import Location, InventoryStock, Recipe, RecipeItem, StockHistoryEntry
from .serializers import (
    LocationSerializer,
    FullInventoryStockSerializer,
    OptimizedInventoryStockSerializer,
    RecipeSerializer,
    StockAdjustmentSerializer,
    StockTransferSerializer,
    BulkStockAdjustmentSerializer,
    BulkStockTransferSerializer,
    StockHistoryEntrySerializer,
)
from .services import InventoryService
from products.models import Product
from settings.config import app_settings
from core_backend.base.viewsets import BaseViewSet, ReadOnlyBaseViewSet
from core_backend.base import SerializerOptimizedMixin

# Create your views here.

# --- Model-based Views ---


class LocationViewSet(BaseViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [IsAdminOrHigher]


class RecipeViewSet(BaseViewSet):
    queryset = Recipe.objects.all()
    serializer_class = RecipeSerializer
    permission_classes = [IsAdminOrHigher]


class InventoryStockViewSet(BaseViewSet):
    queryset = InventoryStock.objects.all()
    permission_classes = [IsAdminOrHigher]

    def get_serializer_class(self):
        """Use optimized serializer for list view to reduce N+1 queries"""
        if self.action == "list":
            return OptimizedInventoryStockSerializer
        return FullInventoryStockSerializer


class InventoryStockListView(SerializerOptimizedMixin, generics.ListAPIView):
    serializer_class = OptimizedInventoryStockSerializer
    permission_classes = [IsAdminOrHigher]
    
    # Base queryset that the mixin will optimize
    queryset = InventoryStock.objects.filter(archived_at__isnull=True)

    def get_queryset(self):
        # First get the base optimized queryset from the mixin
        queryset = super().get_queryset()
        
        # Then apply filtering logic from service
        # Convert QueryDict to plain dict, taking first value from lists
        filters = {}
        for key, value in self.request.query_params.items():
            filters[key] = value
            
        # Apply filters to the already-optimized queryset
        return InventoryService.apply_stock_filters(queryset, filters)


class ProductStockListView(SerializerOptimizedMixin, generics.ListAPIView):
    serializer_class = FullInventoryStockSerializer
    permission_classes = [IsAdminOrHigher]

    def get_queryset(self):
        product_id = self.kwargs.get("product_id")
        # Set base queryset, then let mixin apply optimizations
        self.queryset = InventoryStock.objects.filter(product_id=product_id)
        return super().get_queryset()


# --- Barcode-based Views ---


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def barcode_stock_lookup(request, barcode):
    """
    Look up inventory stock by product barcode.
    Returns stock information for the default location.
    """
    result = InventoryService.search_inventory_by_barcode(barcode)
    
    if result["success"]:
        return Response(result)
    else:
        return Response(result, status=status.HTTP_404_NOT_FOUND)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def barcode_stock_adjustment(request, barcode):
    """
    Adjust stock by scanning barcode.
    Body should contain: {"quantity": 10, "adjustment_type": "add|subtract"}
    """
    quantity = request.data.get("quantity")
    adjustment_type = request.data.get("adjustment_type", "add")
    
    result = InventoryService.perform_barcode_stock_adjustment(
        barcode=barcode,
        quantity=quantity,
        adjustment_type=adjustment_type,
        user=request.user,
        reason=request.data.get("reason", "Barcode stock adjustment")
    )
    
    if result["success"]:
        return Response(result)
    else:
        status_code = status.HTTP_404_NOT_FOUND if "not found" in result["error"] else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)


# --- Service-driven Views ---


class AdjustStockView(APIView):
    """
    An endpoint to add or remove stock from a single location.
    - Positive quantity: adds stock.
    - Negative quantity: removes stock.
    """

    permission_classes = [IsAdminOrHigher]

    def post(self, request, *args, **kwargs):
        mutable_data = request.data.copy()
        mutable_data['user_id'] = request.user.id
        serializer = StockAdjustmentSerializer(data=mutable_data)
        if serializer.is_valid():
            try:
                serializer.save()
                return Response(
                    {"status": "success", "message": "Stock adjusted successfully."},
                    status=status.HTTP_200_OK,
                )
            except ValueError as e:
                return Response(
                    {"status": "error", "message": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TransferStockView(APIView):
    """
    An endpoint to transfer stock between two locations.
    """

    permission_classes = [IsAdminOrHigher]

    def post(self, request, *args, **kwargs):
        mutable_data = request.data.copy()
        mutable_data['user_id'] = request.user.id
        serializer = StockTransferSerializer(data=mutable_data)
        if serializer.is_valid():
            try:
                serializer.save()
                return Response(
                    {"status": "success", "message": "Stock transferred successfully."},
                    status=status.HTTP_200_OK,
                )
            except ValueError as e:
                return Response(
                    {"status": "error", "message": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BulkAdjustStockView(APIView):
    permission_classes = [IsAdminOrHigher]

    def post(self, request, *args, **kwargs):
        mutable_data = request.data.copy()
        mutable_data['user_id'] = request.user.id
        serializer = BulkStockAdjustmentSerializer(data=mutable_data)
        if serializer.is_valid():
            try:
                serializer.save()
                return Response(
                    {"status": "success", "message": "Bulk stock adjusted successfully."},
                    status=status.HTTP_200_OK,
                )
            except ValueError as e:
                return Response(
                    {"status": "error", "message": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BulkTransferStockView(APIView):
    permission_classes = [IsAdminOrHigher]

    def post(self, request, *args, **kwargs):
        mutable_data = request.data.copy()
        mutable_data['user_id'] = request.user.id
        serializer = BulkStockTransferSerializer(data=mutable_data)
        if serializer.is_valid():
            try:
                serializer.save()
                return Response(
                    {"status": "success", "message": "Bulk stock transferred successfully."},
                    status=status.HTTP_200_OK,
                )
            except ValueError as e:
                return Response(
                    {"status": "error", "message": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductStockCheckView(APIView):
    """
    Check stock availability for a specific product.
    Used by POS system before adding items to cart.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, product_id):
        result = InventoryService.get_product_stock_details(product_id)
        
        if result["success"]:
            return Response(result)
        else:
            status_code = status.HTTP_404_NOT_FOUND if "not found" in result["error"] else status.HTTP_500_INTERNAL_SERVER_ERROR
            return Response(result, status=status_code)


class BulkStockCheckView(APIView):
    """
    Check stock availability for multiple products at once.
    Used for cart validation and product grid display.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        product_ids = request.data.get("product_ids", [])
        
        result = InventoryService.check_bulk_stock_availability(product_ids)
        
        if "error" in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response(result)


class InventoryDashboardView(APIView):
    """
    Get inventory overview data for dashboard display.
    Shows aggregated inventory data across ALL locations.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = InventoryService.get_inventory_dashboard_data()
        
        if "error" in result:
            return Response(result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        else:
            return Response(result)


class QuickStockAdjustmentView(APIView):
    """
    Quick stock adjustment for when items are found but not recorded in system.
    Useful for busy restaurant operations where stock updates lag behind reality.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        product_id = request.data.get("product_id")
        quantity = request.data.get("quantity")
        reason = request.data.get("reason", "Quick adjustment during service")
        adjustment_type = request.data.get("adjustment_type", "FOUND_STOCK")
        
        result = InventoryService.perform_quick_stock_adjustment(
            product_id=product_id,
            quantity=quantity,
            reason=reason,
            adjustment_type=adjustment_type,
            user_id=request.user.id if request.user else None
        )
        
        if result["success"]:
            # Add performed_by field for compatibility
            result["adjustment"]["performed_by"] = request.user.username if request.user else "Unknown"
            return Response(result)
        else:
            status_code = status.HTTP_404_NOT_FOUND if "not found" in result["error"] else status.HTTP_400_BAD_REQUEST
            return Response(result, status=status_code)


class InventoryDefaultsView(APIView):
    """
    Get the global inventory default settings.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            return Response(
                {
                    "default_low_stock_threshold": float(
                        app_settings.default_low_stock_threshold
                    ),
                    "default_expiration_threshold": app_settings.default_expiration_threshold,
                }
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# --- Stock History Views ---

class StockHistoryListView(SerializerOptimizedMixin, generics.ListAPIView):
    """
    List all stock history entries with filtering and pagination support.
    Uses SerializerOptimizedMixin for automatic query optimization.
    """
    queryset = StockHistoryEntry.objects.all()
    serializer_class = StockHistoryEntrySerializer
    permission_classes = [IsAdminOrHigher]
    
    # Enable search and filtering via filter backends
    filter_backends = [
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ['product__name', 'product__barcode', 'reason', 'notes', 'reference_id']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        # Get the optimized queryset from SerializerOptimizedMixin
        queryset = super().get_queryset()
        
        # Apply manual filtering for query parameters that aren't handled by filter backends
        location = self.request.query_params.get('location')
        if location:
            queryset = queryset.filter(location_id=location)
        
        operation_type = self.request.query_params.get('operation_type')
        if operation_type:
            queryset = queryset.filter(operation_type=operation_type)
        
        user = self.request.query_params.get('user')
        if user:
            queryset = queryset.filter(user_id=user)
        
        # Note: reference_id filtering is now handled by the unified search field
        
        # Apply custom date range filtering
        date_range = self.request.query_params.get('date_range')
        if date_range:
            now = timezone.now()
            if date_range == 'today':
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
                queryset = queryset.filter(timestamp__gte=start_date)
            elif date_range == 'week':
                start_date = now - timedelta(days=7)
                queryset = queryset.filter(timestamp__gte=start_date)
            elif date_range == 'month':
                start_date = now - timedelta(days=30)
                queryset = queryset.filter(timestamp__gte=start_date)
            elif date_range == 'quarter':
                start_date = now - timedelta(days=90)
                queryset = queryset.filter(timestamp__gte=start_date)
        
        # Filter by tab (operation type groups)
        tab = self.request.query_params.get('tab')
        if tab == 'adjustments':
            queryset = queryset.filter(
                operation_type__in=['CREATED', 'ADJUSTED_ADD', 'ADJUSTED_SUBTRACT', 'BULK_ADJUSTMENT']
            )
        elif tab == 'transfers':
            queryset = queryset.filter(
                operation_type__in=['TRANSFER_FROM', 'TRANSFER_TO', 'BULK_TRANSFER']
            )
        
        return queryset


@api_view(["GET"])
@permission_classes([IsAdminOrHigher])
def get_related_stock_operations(request, reference_id):
    """
    Get all stock operations that share the same reference_id.
    Useful for viewing grouped operations like bulk transfers or corrections.
    """
    if not reference_id or not reference_id.strip():
        return Response(
            {"error": "Reference ID is required"}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Get all operations with the same reference_id
    related_operations = StockHistoryEntry.objects.select_related(
        'product__category', 'product__product_type', 'location', 'user'
    ).filter(
        reference_id__iexact=reference_id.strip()
    ).order_by('-timestamp')
    
    if not related_operations.exists():
        return Response(
            {"error": "No operations found with this reference ID"}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    serializer = StockHistoryEntrySerializer(related_operations, many=True)
    return Response({
        "reference_id": reference_id,
        "count": related_operations.count(),
        "operations": serializer.data
    })
