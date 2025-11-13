from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    GlobalSettingsViewSet,
    StoreLocationViewSet,
    SyncStripeLocationsView,
    PrinterViewSet,
    KitchenZoneViewSet,
    PrinterConfigurationViewSet,
    TerminalLocationViewSet,
    TerminalReaderListView,
    StockActionReasonConfigViewSet,
)

app_name = "settings"

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r"global-settings", GlobalSettingsViewSet, basename="global-settings")
router.register(r"store-locations", StoreLocationViewSet, basename="store-locations")
router.register(r"printers", PrinterViewSet, basename="printer")
router.register(r"kitchen-zones", KitchenZoneViewSet, basename="kitchen-zone")
router.register(
    r"terminal-locations", TerminalLocationViewSet, basename="terminal-location"
)
router.register(
    r"stock-action-reasons", StockActionReasonConfigViewSet, basename="stock-action-reasons"
)

# The API URLs are now determined automatically by the router.
urlpatterns = [
    # Include the router-generated URLs
    path("", include(router.urls)),
    # Backward-compatible printer configuration endpoint (read-only)
    # Use /printers/ and /kitchen-zones/ endpoints for create/update/delete
    path(
        "printer-config/",
        PrinterConfigurationViewSet.as_view({"get": "list"}),
        name="printer-config",
    ),
    # Web order settings endpoint REMOVED - settings now managed directly on StoreLocation
    path(
        "sync-stripe-locations/",
        SyncStripeLocationsView.as_view(),
        name="sync-stripe-locations",
    ),
    path(
        "terminal-readers/",
        TerminalReaderListView.as_view(),
        name="terminal-readers",
    ),
]
