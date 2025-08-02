from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LocationViewSet,
    RecipeViewSet,
    InventoryStockViewSet,
    InventoryStockListView,
    ProductStockListView,
    AdjustStockView,
    TransferStockView,
    ProductStockCheckView,
    BulkStockCheckView,
    InventoryDashboardView,
    QuickStockAdjustmentView,
    InventoryDefaultsView,
    barcode_stock_lookup,
    barcode_stock_adjustment,
)

# Create router and register viewsets
router = DefaultRouter()
router.register(r'locations', LocationViewSet)
router.register(r'recipes', RecipeViewSet)
router.register(r'stock-management', InventoryStockViewSet)

app_name = "inventory"

urlpatterns = [
    # Include router URLs (provides CRUD + archiving endpoints)
    path('', include(router.urls)),
    # Stock Levels (Read-only view)
    path("stock/", InventoryStockListView.as_view(), name="stock-list"),
    path(
        "stock/product/<int:product_id>/",
        ProductStockListView.as_view(),
        name="product-stock-list",
    ),
    # Stock Management Actions
    path("stock/adjust/", AdjustStockView.as_view(), name="stock-adjust"),
    path("stock/transfer/", TransferStockView.as_view(), name="stock-transfer"),
    # Barcode-based Operations
    path(
        "barcode/<str:barcode>/stock/",
        barcode_stock_lookup,
        name="barcode-stock-lookup",
    ),
    path(
        "barcode/<str:barcode>/adjust/",
        barcode_stock_adjustment,
        name="barcode-stock-adjustment",
    ),
    # Stock Checking for POS Integration
    path(
        "stock/check/<int:product_id>/",
        ProductStockCheckView.as_view(),
        name="product-stock-check",
    ),
    path("stock/check-bulk/", BulkStockCheckView.as_view(), name="bulk-stock-check"),
    # Dashboard
    path("dashboard/", InventoryDashboardView.as_view(), name="inventory-dashboard"),
    # Quick Stock Adjustment for busy restaurant operations
    path(
        "stock/quick-adjust/",
        QuickStockAdjustmentView.as_view(),
        name="quick-stock-adjustment",
    ),
    # Global defaults
    path("defaults/", InventoryDefaultsView.as_view(), name="inventory-defaults"),
]
