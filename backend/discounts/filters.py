from django_filters import rest_framework as filters
from .models import Discount


class DiscountFilter(filters.FilterSet):
    class Meta:
        model = Discount
        fields = {
            "type": ["exact"],
            "is_active": ["exact"],
            "scope": ["exact"],
        }
