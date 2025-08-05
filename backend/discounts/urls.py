from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DiscountViewSet, AvailableDiscountListView, apply_discount_code

router = DefaultRouter()
router.register(r"discounts", DiscountViewSet)

urlpatterns = [
    path('apply-code/', apply_discount_code, name='apply-discount-code'),
    path(
        "available/",  # Corrected path
        AvailableDiscountListView.as_view({'get': 'list'}),
        name="available-discounts",
    ),
    path("", include(router.urls)),
]
