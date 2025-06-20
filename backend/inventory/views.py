from django.shortcuts import render
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Location, InventoryStock, Recipe, RecipeItem
from .serializers import (
    LocationSerializer,
    InventoryStockSerializer,
    RecipeSerializer,
    RecipeItemSerializer,
    StockAdjustmentSerializer,
    StockTransferSerializer,
)
from .services import InventoryService
from products.models import Product
from settings.config import app_settings

# Create your views here.

# --- Model-based Views ---


class LocationListCreateView(generics.ListCreateAPIView):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAdminUser]


class LocationDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAdminUser]


class RecipeListCreateView(generics.ListCreateAPIView):
    queryset = Recipe.objects.all()
    serializer_class = RecipeSerializer
    permission_classes = [permissions.IsAdminUser]


class RecipeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Recipe.objects.all()
    serializer_class = RecipeSerializer
    permission_classes = [permissions.IsAdminUser]


class InventoryStockListView(generics.ListAPIView):
    queryset = InventoryStock.objects.select_related("product", "location").all()
    serializer_class = InventoryStockSerializer
    permission_classes = [permissions.IsAdminUser]
    # Advanced filtering (e.g., by location or product) could be added here later.


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
            if hasattr(product, 'recipe') and product.recipe:
                is_available = InventoryService.check_recipe_availability(
                    product, default_location, 1
                )
            
            return Response({
                "product_id": product_id,
                "product_name": product.name,
                "stock_level": stock_level,
                "is_available": is_available,
                "location": default_location.name,
                "has_recipe": hasattr(product, 'recipe') and product.recipe is not None
            })
        except Product.DoesNotExist:
            return Response(
                {"error": "Product not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BulkStockCheckView(APIView):
    """
    Check stock availability for multiple products at once.
    Used for cart validation and product grid display.
    """
    
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        product_ids = request.data.get('product_ids', [])
        
        if not product_ids:
            return Response(
                {"error": "product_ids required"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            default_location = app_settings.get_default_location()
            results = []
            
            for product_id in product_ids:
                try:
                    product = Product.objects.get(id=product_id)
                    stock_level = InventoryService.get_stock_level(product, default_location)
                    
                    # Check if item is available (considering recipes)
                    is_available = InventoryService.check_stock_availability(
                        product, default_location, 1
                    )
                    
                    results.append({
                        "product_id": product_id,
                        "product_name": product.name,
                        "stock_level": stock_level,
                        "is_available": is_available,
                        "has_recipe": hasattr(product, 'recipe') and product.recipe is not None
                    })
                except Product.DoesNotExist:
                    results.append({
                        "product_id": product_id,
                        "error": "Product not found"
                    })
            
            return Response({
                "location": default_location.name,
                "products": results
            })
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InventoryDashboardView(APIView):
    """
    Get inventory overview data for dashboard display.
    """
    
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        try:
            default_location = app_settings.get_default_location()
            
            # Get all stock records for the default location
            stock_records = InventoryStock.objects.filter(
                location=default_location
            ).select_related('product')
            
            total_products = stock_records.count()
            low_stock_threshold = 10  # This could be configurable per product later
            low_stock_count = stock_records.filter(quantity__lt=low_stock_threshold).count()
            out_of_stock_count = stock_records.filter(quantity=0).count()
            
            # Calculate total inventory value (basic calculation)
            total_value = sum(
                stock.quantity * stock.product.price 
                for stock in stock_records
            )
            
            return Response({
                "location": default_location.name,
                "summary": {
                    "total_products": total_products,
                    "low_stock_count": low_stock_count,
                    "out_of_stock_count": out_of_stock_count,
                    "total_value": total_value
                },
                "low_stock_items": [
                    {
                        "product_id": stock.product.id,
                        "product_name": stock.product.name,
                        "quantity": stock.quantity,
                        "price": stock.product.price
                    }
                    for stock in stock_records.filter(quantity__lt=low_stock_threshold)[:10]
                ]
            })
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class QuickStockAdjustmentView(APIView):
    """
    Quick stock adjustment for when items are found but not recorded in system.
    Useful for busy restaurant operations where stock updates lag behind reality.
    """
    
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        try:
            product_id = request.data.get('product_id')
            quantity = request.data.get('quantity')
            reason = request.data.get('reason', 'Quick adjustment during service')
            adjustment_type = request.data.get('adjustment_type', 'FOUND_STOCK')
            
            if not product_id or quantity is None:
                return Response(
                    {"error": "product_id and quantity are required"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                product = Product.objects.get(id=product_id)
                default_location = app_settings.get_default_location()
                
                # Add the found stock
                stock = InventoryService.add_stock(product, default_location, quantity)
                
                # Log the adjustment for audit trail
                print(f"QUICK STOCK ADJUSTMENT: Added {quantity} of {product.name} - {reason}")
                
                return Response({
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
                    }
                })
                
            except Product.DoesNotExist:
                return Response(
                    {"error": "Product not found"}, 
                    status=status.HTTP_404_NOT_FOUND
                )
                
        except Exception as e:
            return Response(
                {"error": f"Failed to adjust stock: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
