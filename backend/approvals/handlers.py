"""
Approval Signal Handlers

Centralized signal handlers for all approval types.
Listens to approval_request_resolved signal and executes the approved action.
"""

from django.dispatch import receiver
from approvals.signals import approval_request_resolved
import logging
import json

logger = logging.getLogger(__name__)


def broadcast_order_update(order):
    """
    Broadcast order update to WebSocket after approval-triggered changes.

    This ensures the POS cart updates in real-time when adjustments
    are applied via manager approval.
    """
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    from orders.serializers import UnifiedOrderSerializer
    from orders.consumers import convert_complex_types_to_str

    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning(f"Channel layer not available. Cannot broadcast order {order.id} update.")
        return

    # Serialize order using websocket view mode (lightweight)
    serialized_order = UnifiedOrderSerializer(order, context={'view_mode': 'websocket'}).data
    final_payload = convert_complex_types_to_str(serialized_order)

    # Broadcast to order's WebSocket group
    group_name = f"tenant_{order.tenant_id}_order_{order.id}"
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": "cart_update",
            "payload": final_payload,
            "operationId": None  # No operation ID for approval-triggered updates
        }
    )

    logger.info(f"Broadcasted order update to WebSocket group {group_name} after approval")



@receiver(approval_request_resolved)
def handle_discount_approval(sender, instance, outcome, **kwargs):
    """
    Apply discount when approval request is resolved.

    Listens to approval_request_resolved signal and applies discount
    if the request was approved and action_type is DISCOUNT.

    Handles both:
    - Predefined discounts (instance.discount is set)
    - One-off discounts (payload contains discount_type, discount_value, reason)

    Args:
        sender: Signal sender (usually ManagerApprovalService)
        instance: ManagerApprovalRequest instance
        outcome: 'approved' or 'denied'
        **kwargs: Additional signal arguments
    """
    # Import here to avoid circular dependencies
    from approvals.models import ActionType
    from discounts.services import DiscountService
    from orders.services import OrderAdjustmentService
    from decimal import Decimal

    # Only handle discount approvals
    if instance.action_type != ActionType.DISCOUNT:
        return

    # Only handle approved requests
    if outcome != 'approved':
        logger.info(
            f"Discount approval request {instance.id} was {outcome}. "
            f"Not applying discount."
        )
        return

    # Extract context
    order = instance.order
    discount = instance.discount

    if not order:
        logger.error(
            f"Discount approval request {instance.id} missing order. "
            f"Cannot apply discount."
        )
        return

    # Determine if this is a predefined discount or one-off discount
    is_one_off_discount = discount is None and instance.payload

    if is_one_off_discount:
        # Handle one-off discount from payload
        try:
            payload = instance.payload
            discount_type = payload.get('discount_type')
            discount_value = payload.get('discount_value')
            reason = payload.get('reason', 'Manager approved one-off discount')
            order_item_id = payload.get('order_item_id')

            if not discount_type or discount_value is None:
                logger.error(
                    f"One-off discount approval request {instance.id} missing required "
                    f"payload fields. discount_type: {discount_type}, discount_value: {discount_value}"
                )
                return

            # Convert discount_value to Decimal if needed
            if not isinstance(discount_value, Decimal):
                discount_value = Decimal(str(discount_value))

            # Get order_item if specified (for item-level discounts)
            order_item = None
            if order_item_id:
                from orders.models import OrderItem
                try:
                    order_item = OrderItem.objects.get(id=order_item_id, order=order)
                except OrderItem.DoesNotExist:
                    logger.error(
                        f"Order item {order_item_id} not found for one-off discount approval {instance.id}"
                    )
                    return

            # Apply one-off discount with bypass_approval_check=True
            result = OrderAdjustmentService.apply_one_off_discount(
                order=order,
                discount_type=discount_type,
                discount_value=discount_value,
                reason=reason,
                applied_by=instance.initiator,
                approved_by=instance.approver,
                order_item=order_item,  # Pass order_item for item-level discounts
                bypass_approval_check=True  # Skip approval check this time
            )

            # Log success
            approver_username = instance.approver.username if instance.approver else 'Unknown'
            if order_item:
                logger.info(
                    f"Applied one-off {discount_type} discount of {discount_value} "
                    f"(amount: {result['amount']}) to item {order_item.id} in order {order.order_number} "
                    f"after manager approval by {approver_username}. "
                    f"Approval request: {instance.id}"
                )
            else:
                logger.info(
                    f"Applied one-off {discount_type} discount of {discount_value} "
                    f"(amount: {result['amount']}) to order {order.order_number} "
                    f"after manager approval by {approver_username}. "
                    f"Approval request: {instance.id}"
                )

            # Broadcast order update to WebSocket for real-time cart sync
            broadcast_order_update(order)

        except KeyError as ke:
            logger.error(
                f"Missing required field in payload for one-off discount approval {instance.id}: {ke}",
                exc_info=True
            )

        except ValueError as ve:
            logger.error(
                f"Validation error applying one-off discount after approval {instance.id}: {ve}",
                exc_info=True
            )

        except Exception as e:
            logger.error(
                f"Failed to apply one-off discount after approval {instance.id}: {e}",
                exc_info=True,
                extra={
                    'approval_request_id': str(instance.id),
                    'order_id': str(order.id) if order else None,
                }
            )

    else:
        # Handle predefined discount
        if not discount:
            logger.error(
                f"Predefined discount approval request {instance.id} missing discount. "
                f"Cannot apply discount."
            )
            return

        try:
            # Apply discount with bypass_approval=True to skip re-checking
            result = DiscountService.apply_discount_to_order(
                order=order,
                discount=discount,
                user=instance.approver,
                bypass_approval=True  # Skip approval check this time
            )

            # Log success
            approver_username = instance.approver.username if instance.approver else 'Unknown'
            logger.info(
                f"Applied discount '{discount.name}' to order {order.order_number} "
                f"after manager approval by {approver_username}. "
                f"Approval request: {instance.id}"
            )

            # Broadcast order update to WebSocket for real-time cart sync
            broadcast_order_update(order)

            # If result is returned (shouldn't happen with bypass_approval=True),
            # log it for debugging
            if result:
                logger.warning(
                    f"Unexpected result from apply_discount_to_order with "
                    f"bypass_approval=True: {result}"
                )

        except ValueError as ve:
            # Handle validation errors
            logger.error(
                f"Validation error applying discount after approval {instance.id}: {ve}",
                exc_info=True
            )

        except Exception as e:
            # Handle any other errors
            logger.error(
                f"Failed to apply discount after approval {instance.id}: {e}",
                exc_info=True,
                extra={
                    'approval_request_id': str(instance.id),
                    'order_id': str(order.id) if order else None,
                    'discount_id': str(discount.id) if discount else None,
                }
            )


@receiver(approval_request_resolved)
def handle_void_order_approval(sender, instance, outcome, **kwargs):
    """
    Void order when approval request is resolved.

    Listens to approval_request_resolved signal and voids the order
    if the request was approved and action_type is VOID_ORDER.

    Args:
        sender: Signal sender (usually ManagerApprovalService)
        instance: ManagerApprovalRequest instance
        outcome: 'approved' or 'denied'
        **kwargs: Additional signal arguments
    """
    # Import here to avoid circular dependencies
    from approvals.models import ActionType
    from orders.services import OrderService

    # Only handle void order approvals
    if instance.action_type != ActionType.ORDER_VOID:
        return

    # Only handle approved requests
    if outcome != 'approved':
        logger.info(
            f"Void order approval request {instance.id} was {outcome}. "
            f"Not voiding order."
        )
        return

    # Extract context
    order = instance.order

    if not order:
        logger.error(
            f"Void order approval request {instance.id} missing order. "
            f"Cannot void order."
        )
        return

    try:
        # Get the refund amount for logging
        from approvals.checkers import VoidOrderApprovalChecker
        void_amount = VoidOrderApprovalChecker._get_void_amount(order)

        # Void the order with bypass_approval=True to skip re-checking
        result = OrderService.void_order_with_approval_check(
            order=order,
            user=instance.approver,
            bypass_approval=True  # Skip approval check this time
        )

        # Log success
        approver_username = instance.approver.username if instance.approver else 'Unknown'
        logger.info(
            f"Voided order {order.order_number} (refunded: ${void_amount}) "
            f"after manager approval by {approver_username}. "
            f"Approval request: {instance.id}"
        )

        # Broadcast order update to WebSocket for real-time cart sync
        broadcast_order_update(order)

        # If result is returned (shouldn't happen with bypass_approval=True),
        # log it for debugging
        if isinstance(result, dict) and result.get('status') == 'pending_approval':
            logger.warning(
                f"Unexpected result from void_order_with_approval_check with "
                f"bypass_approval=True: {result}"
            )

    except ValueError as ve:
        # Handle validation errors (e.g., invalid status transition)
        logger.error(
            f"Validation error voiding order after approval {instance.id}: {ve}",
            exc_info=True
        )

    except Exception as e:
        # Handle any other errors
        logger.error(
            f"Failed to void order after approval {instance.id}: {e}",
            exc_info=True,
            extra={
                'approval_request_id': str(instance.id),
                'order_id': str(order.id) if order else None,
            }
        )


@receiver(approval_request_resolved)
def handle_price_override_approval(sender, instance, outcome, **kwargs):
    """
    Apply price override when approval request is resolved.

    Listens to approval_request_resolved signal and applies price override
    if the request was approved and action_type is PRICE_OVERRIDE.

    Args:
        sender: Signal sender (usually ManagerApprovalService)
        instance: ManagerApprovalRequest instance
        outcome: 'approved' or 'denied'
        **kwargs: Additional signal arguments
    """
    # Import here to avoid circular dependencies
    from approvals.models import ActionType
    from orders.services import OrderAdjustmentService
    from orders.models import OrderItem
    from decimal import Decimal

    # Only handle price override approvals
    if instance.action_type != ActionType.PRICE_OVERRIDE:
        return

    # Only handle approved requests
    if outcome != 'approved':
        logger.info(
            f"Price override approval request {instance.id} was {outcome}. "
            f"Not applying price override."
        )
        return

    # Extract context
    order = instance.order

    if not order:
        logger.error(
            f"Price override approval request {instance.id} missing order. "
            f"Cannot apply price override."
        )
        return

    # Extract from payload
    try:
        payload = instance.payload
        order_item_id = payload.get('order_item_id')
        new_price = payload.get('new_price')
        reason = payload.get('reason', 'Manager approved price override')

        if not order_item_id or new_price is None:
            logger.error(
                f"Price override approval request {instance.id} missing required "
                f"payload fields. order_item_id: {order_item_id}, new_price: {new_price}"
            )
            return

        # Convert new_price to Decimal if needed
        if not isinstance(new_price, Decimal):
            new_price = Decimal(str(new_price))

        # Fetch the order item
        try:
            order_item = OrderItem.objects.get(id=order_item_id, order=order)
        except OrderItem.DoesNotExist:
            logger.error(
                f"Price override approval request {instance.id} references "
                f"non-existent order item {order_item_id} for order {order.id}"
            )
            return

        # Apply price override with bypass_approval_check=True
        result = OrderAdjustmentService.apply_price_override(
            order_item=order_item,
            new_price=new_price,
            reason=reason,
            applied_by=instance.initiator,
            order=order,
            approved_by=instance.approver,
            bypass_approval_check=True  # Skip approval check this time
        )

        # Log success
        approver_username = instance.approver.username if instance.approver else 'Unknown'
        logger.info(
            f"Applied price override on item {order_item.id} in order {order.order_number}: "
            f"{result['adjustment'].original_price} -> {new_price} "
            f"(diff: {result['amount']}) after manager approval by {approver_username}. "
            f"Approval request: {instance.id}"
        )

        # Broadcast order update to WebSocket for real-time cart sync
        broadcast_order_update(order)

    except KeyError as ke:
        logger.error(
            f"Missing required field in payload for price override approval {instance.id}: {ke}",
            exc_info=True
        )

    except ValueError as ve:
        logger.error(
            f"Validation error applying price override after approval {instance.id}: {ve}",
            exc_info=True
        )

    except Exception as e:
        logger.error(
            f"Failed to apply price override after approval {instance.id}: {e}",
            exc_info=True,
            extra={
                'approval_request_id': str(instance.id),
                'order_id': str(order.id) if order else None,
            }
        )


@receiver(approval_request_resolved)
def notify_pos_of_approval_resolution(sender, instance, outcome, **kwargs):
    """
    Log approval resolution outcome.

    The POS frontend will reload the cart/order after receiving the approval response,
    so no WebSocket notification is needed here.

    Args:
        sender: Signal sender
        instance: ManagerApprovalRequest instance
        outcome: 'approved' or 'denied'
        **kwargs: Additional signal arguments
    """
    order = instance.order
    if order:
        logger.info(
            f"{instance.get_action_type_display()} approval {instance.id} resolved as {outcome} "
            f"for order {order.order_number}. POS will reload order automatically."
        )
