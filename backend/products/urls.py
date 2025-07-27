from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers
from .views import (
    TaxListCreateView,
    TaxDetailView,
    ProductTypeListView,
    ProductTypeDetailView,
    CategoryViewSet,
    ProductViewSet,
    ModifierSetViewSet,
    ModifierOptionViewSet,
    ProductModifierSetViewSet,
    barcode_lookup,
)

# Create routers
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"modifier-sets", ModifierSetViewSet, basename="modifier-set")
router.register(r"modifier-options", ModifierOptionViewSet, basename="modifier-option")

# Products router without the "products" prefix
products_router = DefaultRouter()
products_router.register(r"", ProductViewSet, basename="product")

# Nested router for product modifier sets
products_nested_router = nested_routers.NestedSimpleRouter(products_router, r"", lookup="product")
products_nested_router.register(r"modifier-sets", ProductModifierSetViewSet, basename="product-modifier-set")

# The API URLs are now determined automatically by the router.
urlpatterns = [
    path("taxes/", TaxListCreateView.as_view(), name="tax-list"),
    path("taxes/<int:pk>/", TaxDetailView.as_view(), name="tax-detail"),
    path("product-types/", ProductTypeListView.as_view(), name="product-type-list"),
    path(
        "product-types/<int:pk>/",
        ProductTypeDetailView.as_view(),
        name="product-type-detail",
    ),
    path("barcode/<str:barcode>/", barcode_lookup, name="barcode-lookup"),
    # Explicit product routes first (most specific)
    path("", ProductViewSet.as_view({'get': 'list', 'post': 'create'}), name="product-list"),
    path("<int:pk>/", ProductViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name="product-detail"),
    path("by-name/<str:name>/", ProductViewSet.as_view({'get': 'get_by_name'}), name="product-by-name"),
    # Include other routers (categories, modifier-sets, etc.)
    path("", include(router.urls)),
    # Include nested router for product modifier sets
    path("", include(products_nested_router.urls)),
]
