"""
URL configuration for sync app.

All endpoints use DeviceSignatureAuthentication + IsAuthenticatedTerminal.
"""
from django.urls import path
from .views import (
    # Dataset sync views
    CatalogSyncView,
    CategoriesSyncView,
    TaxesSyncView,
    ProductTypesSyncView,
    ModifierSetsSyncView,
    DiscountsSyncView,
    InventorySyncView,
    InventoryLocationsSyncView,
    SettingsSyncView,
    UsersSyncView,
    # Ingest views
    OfflineOrderIngestView,
    OfflineInventoryIngestView,
    OfflineApprovalsIngestView,
)

app_name = 'sync'

urlpatterns = [
    # Dataset sync endpoints
    path('catalog/', CatalogSyncView.as_view(), name='catalog-sync'),
    path('categories/', CategoriesSyncView.as_view(), name='categories-sync'),
    path('taxes/', TaxesSyncView.as_view(), name='taxes-sync'),
    path('product-types/', ProductTypesSyncView.as_view(), name='product-types-sync'),
    path('modifiers/', ModifierSetsSyncView.as_view(), name='modifiers-sync'),
    path('discounts/', DiscountsSyncView.as_view(), name='discounts-sync'),
    path('inventory/', InventorySyncView.as_view(), name='inventory-sync'),
    path('inventory-locations/', InventoryLocationsSyncView.as_view(), name='inventory-locations-sync'),
    path('settings/', SettingsSyncView.as_view(), name='settings-sync'),
    path('users/', UsersSyncView.as_view(), name='users-sync'),

    # Offline ingest endpoints
    path('offline-orders/', OfflineOrderIngestView.as_view(), name='offline-orders-ingest'),
    path('offline-inventory/', OfflineInventoryIngestView.as_view(), name='offline-inventory-ingest'),
    path('offline-approvals/', OfflineApprovalsIngestView.as_view(), name='offline-approvals-ingest'),

    # Conflict tracking (to be implemented)
    # path('conflicts/', ConflictListView.as_view(), name='conflicts-list'),
]
