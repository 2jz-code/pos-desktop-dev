"""
Orders services package - modular service layer for order management.

This package splits the original monolithic OrderService into focused, maintainable modules:
- OrderService: Core order lifecycle (create, update, complete, void)
- OrderCalculationService: Tax and totals calculation
- OrderItemService: Item management (add, update, remove)
- OrderDiscountService: Discount operations
- OrderAdjustmentService: One-off discounts and price overrides
- KitchenService: Kitchen operations (receipts, grouping, printing)
- GuestSessionService: Guest sessions and conversion
- GuestConversionService: Guest to user conversion
- WebOrderNotificationService: Web order notifications
"""

# Core order operations
from .order_service import OrderService

# Calculation operations
from .calculation_service import OrderCalculationService

# Item management
from .item_service import OrderItemService

# Discount operations
from .discount_service import OrderDiscountService

# Adjustment operations (one-off discounts, price overrides)
from .adjustment_service import OrderAdjustmentService

# Kitchen operations
from .kitchen_service import KitchenService

# Guest operations
from .guest_service import GuestSessionService, GuestConversionService

# Notification operations
from .notification_service import WebOrderNotificationService, web_order_notification_service

__all__ = [
    # Core
    'OrderService',
    # Calculations
    'OrderCalculationService',
    # Items
    'OrderItemService',
    # Discounts
    'OrderDiscountService',
    # Adjustments
    'OrderAdjustmentService',
    # Kitchen
    'KitchenService',
    # Guest
    'GuestSessionService',
    'GuestConversionService',
    # Notifications
    'WebOrderNotificationService',
    'web_order_notification_service',
]
