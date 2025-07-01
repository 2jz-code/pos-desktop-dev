from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    GlobalSettingsViewSet,
    StoreLocationViewSet,
    TerminalRegistrationViewSet,
    SyncStripeLocationsView,
    PrinterConfigurationViewSet,
    TerminalLocationViewSet,
    TerminalReaderListView,
    WebOrderSettingsViewSet,
)

app_name = "settings"

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r"global-settings", GlobalSettingsViewSet, basename="global-settings")
router.register(r"store-locations", StoreLocationViewSet, basename="store-locations")
router.register(
    r"terminal-registrations",
    TerminalRegistrationViewSet,
    basename="terminal-registrations",
)
# Custom URL for singleton printer config instead of using the router
# router.register(r"printer-config", PrinterConfigurationViewSet, basename="printer-config")
router.register(
    r"terminal-locations", TerminalLocationViewSet, basename="terminal-location"
)

# The API URLs are now determined automatically by the router.
urlpatterns = [
    # Include the router-generated URLs
    path("", include(router.urls)),
    # Custom singleton printer configuration endpoints
    path(
        "printer-config/",
        PrinterConfigurationViewSet.as_view(
            {
                "get": "list",
                "put": "update",
                "patch": "partial_update",
                "post": "create",
            }
        ),
        name="printer-config",
    ),
    # Custom singleton web order settings endpoints
    path(
        "web-order-settings/",
        WebOrderSettingsViewSet.as_view(
            {
                "get": "list",
                "put": "update",
                "patch": "partial_update",
                "post": "create",
            }
        ),
        name="web-order-settings",
    ),
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
