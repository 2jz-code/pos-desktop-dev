from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TaxListCreateView,
    TaxDetailView,
    ProductTypeListView,
    ProductTypeDetailView,
    CategoryViewSet,
    ProductViewSet,
)

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"", ProductViewSet, basename="product")

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
    path("", include(router.urls)),
]
