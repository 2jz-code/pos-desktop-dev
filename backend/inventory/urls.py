from django.urls import path
from .views import (
    LocationListCreateView,
    LocationDetailView,
    RecipeListCreateView,
    RecipeDetailView,
    InventoryStockListView,
    AdjustStockView,
    TransferStockView,
)

app_name = "inventory"

urlpatterns = [
    # Locations
    path("locations/", LocationListCreateView.as_view(), name="location-list-create"),
    path("locations/<int:pk>/", LocationDetailView.as_view(), name="location-detail"),
    # Recipes
    path("recipes/", RecipeListCreateView.as_view(), name="recipe-list-create"),
    path("recipes/<int:pk>/", RecipeDetailView.as_view(), name="recipe-detail"),
    # Stock Levels (Read-only view)
    path("stock/", InventoryStockListView.as_view(), name="stock-list"),
    # Stock Management Actions
    path("stock/adjust/", AdjustStockView.as_view(), name="stock-adjust"),
    path("stock/transfer/", TransferStockView.as_view(), name="stock-transfer"),
]
