from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    GlobalSettingsViewSet,
    POSDeviceViewSet,
    TerminalLocationViewSet,
    SyncStripeLocationsView,
)

app_name = "settings"

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r"global-settings", GlobalSettingsViewSet, basename="global-settings")
router.register(r"pos-devices", POSDeviceViewSet, basename="pos-devices")
router.register(
    r"terminal-locations", TerminalLocationViewSet, basename="terminal-locations"
)

# The API URLs are now determined automatically by the router.
urlpatterns = [
    # Include the router-generated URLs
    path("", include(router.urls)),
    path(
        "sync-stripe-locations/",
        SyncStripeLocationsView.as_view(),
        name="sync-stripe-locations",
    ),
]
