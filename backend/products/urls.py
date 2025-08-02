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

# Create main router
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"modifier-sets", ModifierSetViewSet, basename="modifier-set")
router.register(r"modifier-options", ModifierOptionViewSet, basename="modifier-option")

# No need for products_router anymore since we're using explicit paths
# Nested router for product modifier sets - create a minimal router just for nesting
temp_router = DefaultRouter()
temp_router.register(r"", ProductViewSet, basename="product-temp")
products_nested_router = nested_routers.NestedSimpleRouter(temp_router, r"", lookup="product")
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
    # Products ViewSet actions - explicit mapping FIRST to avoid API root conflicts
    path("", ProductViewSet.as_view({'get': 'list', 'post': 'create'}), name="product-list"),
    path("<int:pk>/", ProductViewSet.as_view({
        'get': 'retrieve', 
        'put': 'update', 
        'patch': 'partial_update', 
        'delete': 'destroy'
    }), name="product-detail"),
    # Archive actions
    path("<int:pk>/archive/", ProductViewSet.as_view({'post': 'archive'}), name="product-archive"),
    path("<int:pk>/unarchive/", ProductViewSet.as_view({'post': 'unarchive'}), name="product-unarchive"),
    path("bulk_archive/", ProductViewSet.as_view({'post': 'bulk_archive'}), name="product-bulk-archive"),
    path("bulk_unarchive/", ProductViewSet.as_view({'post': 'bulk_unarchive'}), name="product-bulk-unarchive"),
    # Include other routers (categories, modifier-sets, etc.) - these have explicit prefixes
    path("", include(router.urls)),
    # Include nested router for product modifier sets
    path("", include(products_nested_router.urls)),
]
