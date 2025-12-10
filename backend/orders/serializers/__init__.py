"""
Orders serializers package - modular serializer layer.
"""

# Order item serializers
from .order_item_serializers import (
    OrderItemModifierSerializer,
    OrderItemSerializer,
    UpdateOrderItemSerializer,
)

# Order serializers
from .order_serializers import (
    OrderCustomerInfoSerializer,
    OrderCreateSerializer,
    AddItemSerializer,
)

# Unified serializer
from .unified_serializer import UnifiedOrderSerializer

# Adjustment serializers
from .adjustment_serializers import (
    OrderAdjustmentSerializer,
    ApplyOneOffDiscountSerializer,
    ApplyPriceOverrideSerializer,
)

# Discount serializers
from .discount_serializers import (
    OrderDiscountSerializer,
    ApplyDiscountSerializer,
    RemoveDiscountSerializer,
)

# Status serializers
from .status_serializers import UpdateOrderStatusSerializer

__all__ = [
    # Order items
    'OrderItemModifierSerializer',
    'OrderItemSerializer',
    'UpdateOrderItemSerializer',
    # Orders
    'OrderCustomerInfoSerializer',
    'OrderCreateSerializer',
    'AddItemSerializer',
    # Unified
    'UnifiedOrderSerializer',
    # Adjustments
    'OrderAdjustmentSerializer',
    'ApplyOneOffDiscountSerializer',
    'ApplyPriceOverrideSerializer',
    # Discounts
    'OrderDiscountSerializer',
    'ApplyDiscountSerializer',
    'RemoveDiscountSerializer',
    # Status
    'UpdateOrderStatusSerializer',
]
