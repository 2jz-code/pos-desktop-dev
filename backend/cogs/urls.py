"""
URL configuration for the COGS app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from cogs.views import (
    UnitViewSet,
    UnitConversionViewSet,
    IngredientConfigViewSet,
    ItemCostSourceViewSet,
    MenuItemCOGSListView,
    MenuItemCOGSDetailView,
    MenuItemFastSetupView,
)

# Create router for ViewSets
router = DefaultRouter()
router.register(r'units', UnitViewSet, basename='unit')
router.register(r'conversions', UnitConversionViewSet, basename='unit-conversion')
router.register(r'ingredient-configs', IngredientConfigViewSet, basename='ingredient-config')
router.register(r'costs', ItemCostSourceViewSet, basename='item-cost-source')

urlpatterns = [
    # ViewSet routes
    path('', include(router.urls)),

    # Menu item COGS routes
    path('menu-items/', MenuItemCOGSListView.as_view(), name='menu-item-cogs-list'),
    path('menu-items/<int:pk>/', MenuItemCOGSDetailView.as_view(), name='menu-item-cogs-detail'),
    path('menu-items/<int:pk>/fast-setup/', MenuItemFastSetupView.as_view(), name='menu-item-fast-setup'),
]
