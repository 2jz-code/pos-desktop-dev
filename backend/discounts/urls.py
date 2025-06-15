from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DiscountViewSet, AvailableDiscountListView

router = DefaultRouter()
router.register(r"discounts", DiscountViewSet)

urlpatterns = [
    path(
        "available/",  # Corrected path
        AvailableDiscountListView.as_view(),
        name="available-discounts",
    ),
    path("", include(router.urls)),
]
