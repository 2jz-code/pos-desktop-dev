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

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"modifier-sets", ModifierSetViewSet, basename="modifier-set")
router.register(r"modifier-options", ModifierOptionViewSet, basename="modifier-option")
router.register(r"products", ProductViewSet, basename="product")

products_router = nested_routers.NestedSimpleRouter(router, r"products", lookup="product")
products_router.register(r"modifier-sets", ProductModifierSetViewSet, basename="product-modifier-set")

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
    path("", include(router.urls)),
    path("", include(products_router.urls)),
]
