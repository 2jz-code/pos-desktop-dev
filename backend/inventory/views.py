from django.db.models import Q
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from datetime import timedelta
from rest_framework import generics, permissions, status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from .models import Location, InventoryStock, Recipe, RecipeItem
from .serializers import (
    LocationSerializer,
    FullInventoryStockSerializer,
    OptimizedInventoryStockSerializer,
    RecipeSerializer,
    StockAdjustmentSerializer,
    StockTransferSerializer,
)
from .services import InventoryService
from products.models import Product
from settings.config import app_settings
from core_backend.base.viewsets import BaseViewSet
from core_backend.base import SerializerOptimizedMixin

# Create your views here.

# --- Model-based Views ---


class LocationViewSet(BaseViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAdminUser]


class RecipeViewSet(BaseViewSet):
    queryset = Recipe.objects.all()
    serializer_class = RecipeSerializer
    permission_classes = [permissions.IsAdminUser]


class InventoryStockViewSet(BaseViewSet):
    queryset = InventoryStock.objects.all()
    permission_classes = [permissions.IsAdminUser]

    def get_serializer_class(self):
        """Use optimized serializer for list view to reduce N+1 queries"""
        if self.action == "list":
            return OptimizedInventoryStockSerializer
        return FullInventoryStockSerializer


class InventoryStockListView(SerializerOptimizedMixin, generics.ListAPIView):
    serializer_class = OptimizedInventoryStockSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        # Override base queryset to add archiving filter first
        # Then let the mixin apply serializer optimizations
        self.queryset = InventoryStock.objects.filter(archived_at__isnull=True)
        queryset = super().get_queryset()

        location_id = self.request.query_params.get("location", None)
        search_query = self.request.query_params.get("search", None)
        is_low_stock = self.request.query_params.get("is_low_stock", None)
        is_expiring_soon = self.request.query_params.get("is_expiring_soon", None)

        if location_id:
            queryset = queryset.filter(location_id=location_id)

        if search_query:
            queryset = queryset.filter(
                Q(product__name__icontains=search_query)
                | Q(product__barcode__icontains=search_query)
            )

        # Filter by low stock (using effective thresholds)
        if is_low_stock and is_low_stock.lower() == "true":
            from django.db.models import F, Case, When, Value
            from settings.config import app_settings

            # Use item-specific threshold if set, otherwise use global default
            queryset = queryset.filter(
                quantity__lte=Case(
                    When(
                        low_stock_threshold__isnull=False, then=F("low_stock_threshold")
                    ),
                    default=Value(app_settings.default_low_stock_threshold),
                )
            )

        # Filter by expiring soon
        if is_expiring_soon and is_expiring_soon.lower() == "true":
            from django.db.models import Case, When, DateField
            from django.db.models.functions import Cast

            today = timezone.now().date()
            # We need to use raw SQL or handle this differently since F() + timedelta is complex
            # For simplicity, let's use a subquery approach
            expiring_stock_ids = []
            for stock in queryset.filter(expiration_date__isnull=False):
                threshold_date = today + timedelta(
                    days=stock.effective_expiration_threshold
                )
                if stock.expiration_date <= threshold_date:
                    expiring_stock_ids.append(stock.id)

            if expiring_stock_ids:
                queryset = queryset.filter(id__in=expiring_stock_ids)
            else:
                queryset = queryset.none()

        return queryset


class ProductStockListView(SerializerOptimizedMixin, generics.ListAPIView):
    serializer_class = FullInventoryStockSerializer
    permission_classes = [permissions.IsAdminUser]

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
    try:
        product = get_object_or_404(Product, barcode=barcode, is_active=True)
        default_location = app_settings.get_default_location()

        stock_level = InventoryService.get_stock_level(product, default_location)

        return Response(
            {
                "success": True,
                "barcode": barcode,
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "barcode": product.barcode,
                    "track_inventory": product.track_inventory,
                },
                "stock": {
                    "location": default_location.name,
                    "quantity": stock_level,
                    "is_available": stock_level > 0,
                },
            }
        )
    except Product.DoesNotExist:
        return Response(
            {"success": False, "error": "Product with this barcode not found"},
            status=status.HTTP_404_NOT_FOUND,
        )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def barcode_stock_adjustment(request, barcode):
    """
    Adjust stock by scanning barcode.
    Body should contain: {"quantity": 10, "adjustment_type": "add|subtract"}
    """
    try:
        product = get_object_or_404(Product, barcode=barcode, is_active=True)

        if not product.track_inventory:
            return Response(
                {"success": False, "error": "This product does not track inventory"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quantity = request.data.get("quantity")
        adjustment_type = request.data.get("adjustment_type", "add")

        if not quantity:
            return Response(
                {"success": False, "error": "Quantity is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            quantity = float(quantity)
        except (ValueError, TypeError):
            return Response(
                {"success": False, "error": "Invalid quantity format"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Adjust quantity based on type
        if adjustment_type == "subtract":
            quantity = -quantity

        default_location = app_settings.get_default_location()

        # Use the existing stock adjustment logic
        if quantity > 0:
            InventoryService.increment_stock(product, default_location, quantity)
        else:
            InventoryService.decrement_stock(product, default_location, abs(quantity))

        # Get updated stock level
        new_stock_level = InventoryService.get_stock_level(product, default_location)

        return Response(
            {
                "success": True,
                "message": f"Stock adjusted successfully",
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "barcode": product.barcode,
                },
                "adjustment": {"quantity": quantity, "type": adjustment_type},
                "stock": {
                    "location": default_location.name,
                    "quantity": new_stock_level,
                },
            }
        )

    except Product.DoesNotExist:
        return Response(
            {"success": False, "error": "Product with this barcode not found"},
            status=status.HTTP_404_NOT_FOUND,
        )
    except ValueError as e:
        return Response(
            {"success": False, "error": str(e)}, status=status.HTTP_400_BAD_REQUEST
        )


# --- Service-driven Views ---


class AdjustStockView(APIView):
    """
    An endpoint to add or remove stock from a single location.
    - Positive quantity: adds stock.
    - Negative quantity: removes stock.
    """

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, *args, **kwargs):
        serializer = StockAdjustmentSerializer(data=request.data)
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

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, *args, **kwargs):
        serializer = StockTransferSerializer(data=request.data)
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


class ProductStockCheckView(APIView):
    """
    Check stock availability for a specific product.
    Used by POS system before adding items to cart.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
            default_location = app_settings.get_default_location()

            stock_level = InventoryService.get_stock_level(product, default_location)
            is_available = stock_level > 0

            # For menu items with recipes, check ingredient availability
            if hasattr(product, "recipe") and product.recipe:
                is_available = InventoryService.check_recipe_availability(
                    product, default_location, 1
                )

            return Response(
                {
                    "product_id": product_id,
                    "product_name": product.name,
                    "stock_level": stock_level,
                    "is_available": is_available,
                    "location": default_location.name,
                    "has_recipe": hasattr(product, "recipe")
                    and product.recipe is not None,
                }
            )
        except Product.DoesNotExist:
            return Response(
                {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BulkStockCheckView(APIView):
    """
    Check stock availability for multiple products at once.
    Used for cart validation and product grid display.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        product_ids = request.data.get("product_ids", [])

        if not product_ids:
            return Response(
                {"error": "product_ids required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            default_location = app_settings.get_default_location()
            results = []

            for product_id in product_ids:
                try:
                    product = Product.objects.get(id=product_id)
                    stock_level = InventoryService.get_stock_level(
                        product, default_location
                    )

                    # Check if item is available (considering recipes)
                    is_available = InventoryService.check_stock_availability(
                        product, default_location, 1
                    )

                    results.append(
                        {
                            "product_id": product_id,
                            "product_name": product.name,
                            "stock_level": stock_level,
                            "is_available": is_available,
                            "has_recipe": hasattr(product, "recipe")
                            and product.recipe is not None,
                        }
                    )
                except Product.DoesNotExist:
                    results.append(
                        {"product_id": product_id, "error": "Product not found"}
                    )

            return Response({"location": default_location.name, "products": results})
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InventoryDashboardView(APIView):
    """
    Get inventory overview data for dashboard display.
    Shows aggregated inventory data across ALL locations.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            from django.db.models import Sum, F, Case, When, Value, Q

            # Get all stock records across all locations
            all_stock_records = InventoryStock.objects.select_related(
                "product", "location"
            ).filter(archived_at__isnull=True)

            # Aggregate total quantities per product across all locations
            product_totals = all_stock_records.values("product").annotate(
                total_quantity=Sum("quantity"),
                product_name=F("product__name"),
                product_price=F("product__price"),
                product_id=F("product__id"),
            )

            total_products = product_totals.count()

            # Calculate low stock count based on aggregated quantities
            low_stock_count = 0
            out_of_stock_count = 0
            low_stock_products = []

            for product_data in product_totals:
                total_qty = product_data["total_quantity"] or 0

                # Get the most restrictive low stock threshold for this product
                product_stocks = all_stock_records.filter(
                    product_id=product_data["product_id"]
                )
                min_threshold = min(
                    stock.effective_low_stock_threshold for stock in product_stocks
                )

                if total_qty == 0:
                    out_of_stock_count += 1
                elif total_qty <= min_threshold:
                    low_stock_count += 1
                    low_stock_products.append(
                        {
                            "product_id": product_data["product_id"],
                            "product_name": product_data["product_name"],
                            "quantity": total_qty,
                            "price": product_data["product_price"],
                            "low_stock_threshold": min_threshold,
                        }
                    )

            # Calculate expiring soon items across all locations
            today = timezone.now().date()
            expiring_soon_items = []
            expiring_soon_count = 0

            for stock in all_stock_records.filter(expiration_date__isnull=False):
                threshold_date = today + timedelta(
                    days=stock.effective_expiration_threshold
                )
                if stock.expiration_date <= threshold_date:
                    expiring_soon_items.append(
                        {
                            "product_id": stock.product.id,
                            "product_name": stock.product.name,
                            "quantity": stock.quantity,
                            "price": stock.product.price,
                            "expiration_date": stock.expiration_date,
                            "expiration_threshold": stock.effective_expiration_threshold,
                            "location": stock.location.name,
                        }
                    )

            expiring_soon_count = len(expiring_soon_items)

            # Calculate total inventory value across all locations
            total_value = sum(
                (product_data["total_quantity"] or 0)
                * (product_data["product_price"] or 0)
                for product_data in product_totals
            )

            return Response(
                {
                    "scope": "All Locations",
                    "summary": {
                        "total_products": total_products,
                        "low_stock_count": low_stock_count,
                        "out_of_stock_count": out_of_stock_count,
                        "expiring_soon_count": expiring_soon_count,
                        "total_value": total_value,
                    },
                    "low_stock_items": low_stock_products[:10],
                    "expiring_soon_items": expiring_soon_items[:10],
                }
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class QuickStockAdjustmentView(APIView):
    """
    Quick stock adjustment for when items are found but not recorded in system.
    Useful for busy restaurant operations where stock updates lag behind reality.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            product_id = request.data.get("product_id")
            quantity = request.data.get("quantity")
            reason = request.data.get("reason", "Quick adjustment during service")
            adjustment_type = request.data.get("adjustment_type", "FOUND_STOCK")

            if not product_id or quantity is None:
                return Response(
                    {"error": "product_id and quantity are required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                product = Product.objects.get(id=product_id)
                default_location = app_settings.get_default_location()

                # Add the found stock
                stock = InventoryService.add_stock(product, default_location, quantity)

                # Log the adjustment for audit trail
                print(
                    f"QUICK STOCK ADJUSTMENT: Added {quantity} of {product.name} - {reason}"
                )

                return Response(
                    {
                        "success": True,
                        "message": f"Added {quantity} units of {product.name}",
                        "product": {
                            "id": product.id,
                            "name": product.name,
                        },
                        "new_stock_level": float(stock.quantity),
                        "adjustment": {
                            "quantity": float(quantity),
                            "reason": reason,
                            "type": adjustment_type,
                            "performed_by": request.user.username,
                        },
                    }
                )

            except Product.DoesNotExist:
                return Response(
                    {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
                )

        except Exception as e:
            return Response(
                {"error": f"Failed to adjust stock: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


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
