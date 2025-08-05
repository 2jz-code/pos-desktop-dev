from core_backend.base import BaseFilterSet
from .models import Discount


class DiscountFilter(BaseFilterSet):
    class Meta:
        model = Discount
        fields = {
            "type": ["exact"],
            "is_active": ["exact"],
            "scope": ["exact"],
        }
