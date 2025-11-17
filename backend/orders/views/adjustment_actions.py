from django.db import models
from rest_framework import viewsets, status, generics
from core_backend.base import BaseViewSet
from rest_framework.exceptions import NotFound
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from rest_framework.request import Request
import stripe
import logging

from orders.models import Order, OrderItem
from orders.serializers import (
    UnifiedOrderSerializer,
    OrderCreateSerializer,
    AddItemSerializer,
    UpdateOrderItemSerializer,
    UpdateOrderStatusSerializer,
    OrderItemSerializer,
    OrderCustomerInfoSerializer,
    OrderAdjustmentSerializer,
    ApplyOneOffDiscountSerializer,
    ApplyPriceOverrideSerializer,
)
from orders.services import OrderService, GuestSessionService  # Re-exported from services/__init__.py
from orders.filters import OrderFilter
from core_backend.base.mixins import FieldsetQueryParamsMixin, TenantScopedQuerysetMixin
from orders.permissions import (
    IsAuthenticatedOrGuestOrder,
    IsGuestOrAuthenticated,
)
from rest_framework.permissions import AllowAny
from users.permissions import IsAdminOrHigher
from customers.authentication import CustomerCookieJWTAuthentication
from users.authentication import CookieJWTAuthentication
from products.models import Product
from payments.models import Payment
from payments.strategies import StripeTerminalStrategy
from notifications.services import EmailService

logger = logging.getLogger(__name__)




class AdjustmentActionsMixin:
    """
    Mixin for order adjustment actions (discounts, price overrides)

    This mixin provides action methods for OrderViewSet.
    """

    def list_adjustments(self, request, pk=None):
        """
        Lists all adjustments applied to an order.

        Returns a list of OrderAdjustment instances with details about
        one-off discounts and price overrides.
        """
        order = self.get_object()
        from orders.services import OrderAdjustmentService

        adjustments = OrderAdjustmentService.get_order_adjustments(order)
        serializer = OrderAdjustmentSerializer(adjustments, many=True)
        return Response(serializer.data)


    def apply_one_off_discount(self, request, pk=None):
        """
        Applies a one-off discount to an order.

        Required POST data:
            - discount_type: 'PERCENTAGE' or 'FIXED'
            - discount_value: The discount value (percentage or fixed amount)
            - reason: Reason for the discount (audit trail)

        Returns either:
            - 200: Discount applied successfully (returns updated order)
            - 202: Approval required (returns approval request info)
            - 400: Validation error
        """
        order = self.get_object()
        serializer = ApplyOneOffDiscountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = serializer.save(order=order, user=request.user)

            # Check if approval is required
            if isinstance(result, dict) and result.get('status') == 'pending_approval':
                return Response(result, status=status.HTTP_202_ACCEPTED)

            # Discount applied successfully - broadcast to WebSocket for real-time cart sync
            from approvals.handlers import broadcast_order_update
            broadcast_order_update(result['order'])

            # Return updated order
            response_serializer = UnifiedOrderSerializer(
                result['order'], context={"request": request, "view_mode": "detail"}
            )
            return Response(response_serializer.data)

        except Exception as e:
            logger.error(f"Error applying one-off discount to order {pk}: {e}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


    def apply_price_override(self, request, pk=None):
        """
        Applies a price override to an order item.

        Required POST data:
            - order_item_id: ID of the order item to override price for
            - new_price: New price for the item
            - reason: Reason for the price override (audit trail)

        Returns either:
            - 200: Price override applied successfully (returns updated order)
            - 202: Approval required (returns approval request info)
            - 400: Validation error
        """
        order = self.get_object()
        serializer = ApplyPriceOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = serializer.save(order=order, user=request.user)

            # Check if approval is required
            if isinstance(result, dict) and result.get('status') == 'pending_approval':
                return Response(result, status=status.HTTP_202_ACCEPTED)

            # Price override applied successfully - broadcast to WebSocket for real-time cart sync
            from approvals.handlers import broadcast_order_update
            broadcast_order_update(result['order'])

            # Return updated order
            response_serializer = UnifiedOrderSerializer(
                result['order'], context={"request": request, "view_mode": "detail"}
            )
            return Response(response_serializer.data)

        except Exception as e:
            logger.error(f"Error applying price override to order {pk}: {e}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


    def remove_adjustment(self, request, pk=None, adjustment_id=None):
        """
        Remove an adjustment (one-off discount or price override) from an order.

        Returns:
            200: Adjustment removed successfully (returns updated order)
            400: Validation error
            404: Adjustment not found
        """
        from orders.models import OrderAdjustment

        order = self.get_object()

        try:
            # Get the adjustment
            adjustment = OrderAdjustment.objects.get(id=adjustment_id, order=order)

            # Store details for logging
            adjustment_type = adjustment.get_adjustment_type_display()
            adjustment_details = f"{adjustment_type}"
            if adjustment.adjustment_type == OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT:
                adjustment_details += f" ({adjustment.get_discount_type_display()}: {adjustment.discount_value})"

            # If this is a price override, restore the original price to the order item
            if adjustment.adjustment_type == OrderAdjustment.AdjustmentType.PRICE_OVERRIDE and adjustment.order_item:
                order_item = adjustment.order_item
                if order_item.product and adjustment.original_price is not None:
                    # Restore to the original price that was stored when override was applied
                    order_item.price_at_sale = adjustment.original_price
                    order_item.save(update_fields=['price_at_sale'])
                    logger.info(
                        f"Restored price for item {order_item.id} from ${order_item.price_at_sale} to original ${adjustment.original_price}"
                    )

            # Delete the adjustment (will trigger recalculation via signal if needed)
            adjustment.delete()

            logger.info(
                f"Removed adjustment {adjustment_id} ({adjustment_details}) from order {order.order_number}"
            )

            # Trigger recalculation
            from orders.signals import order_needs_recalculation
            order_needs_recalculation.send(sender=Order, order=order)

            # Refresh order from DB
            order.refresh_from_db()

            # Broadcast to WebSocket for real-time cart sync
            from approvals.handlers import broadcast_order_update
            broadcast_order_update(order)

            # Return updated order
            response_serializer = UnifiedOrderSerializer(
                order, context={"request": request, "view_mode": "detail"}
            )
            return Response(response_serializer.data)

        except OrderAdjustment.DoesNotExist:
            return Response(
                {"error": "Adjustment not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error removing adjustment {adjustment_id} from order {pk}: {e}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

