from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers
from .views import (
    TaxViewSet,
    ProductTypeViewSet,
    CategoryViewSet,
    ProductViewSet,
    ModifierSetViewSet,
    ModifierOptionViewSet,
    ProductModifierSetViewSet,
    barcode_lookup,
)
from .dependency_views import (
    validate_category_archiving,
    validate_product_type_archiving,
    archive_category,
    archive_product_type,
    get_alternative_categories,
    get_alternative_product_types,
    BulkArchiveView,
    ProductReassignmentView,
)

# Create main router
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"taxes", TaxViewSet, basename="tax")
router.register(r"product-types", ProductTypeViewSet, basename="product-type")
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
    path("bulk-update/", ProductViewSet.as_view({'patch': 'bulk_update'}), name="product-bulk-update"),
    
    # Dependency validation endpoints
    path("categories/<int:category_id>/validate-archive/", validate_category_archiving, name="validate-category-archive"),
    path("product-types/<int:product_type_id>/validate-archive/", validate_product_type_archiving, name="validate-product-type-archive"),
    
    # Dependency-aware archiving endpoints
    path("categories/<int:category_id>/archive/", archive_category, name="category-archive"),
    path("product-types/<int:product_type_id>/archive/", archive_product_type, name="product-type-archive"),
    
    # Alternative options endpoints
    path("categories/alternatives/", get_alternative_categories, name="alternative-categories"),
    path("product-types/alternatives/", get_alternative_product_types, name="alternative-product-types"),
    
    # Bulk operations endpoints
    path("bulk-archive/", BulkArchiveView.as_view(), name="bulk-archive"),
    path("reassign-products/", ProductReassignmentView.as_view(), name="reassign-products"),
    
    # Include other routers (categories, modifier-sets, etc.) - these have explicit prefixes
    path("", include(router.urls)),
    # Include nested router for product modifier sets
    path("", include(products_nested_router.urls)),
]
