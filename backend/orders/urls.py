# desktop-combined/backend/orders/urls.py

from django.urls import path, include
from rest_framework import routers
from rest_framework_nested import routers as nested_routers
from .views import OrderViewSet, OrderItemViewSet

app_name = "orders"

router = routers.DefaultRouter()
router.register(r"orders", OrderViewSet, basename="order")

orders_router = nested_routers.NestedSimpleRouter(router, r"orders", lookup="order")
orders_router.register(r"items", OrderItemViewSet, basename="order-item")

urlpatterns = [
    # Include the nested router URLs first for precedence.
    path("", include(orders_router.urls)),
    # Include the main router URLs.
    path("", include(router.urls)),
    # REMOVED: path("orders/<uuid:pk>/items/", OrderViewSet.as_view({"delete": "clear_items"}), name="order-clear-items"),
]
