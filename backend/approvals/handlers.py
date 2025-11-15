"""
Approval Signal Handlers

Centralized signal handlers for all approval types.
Listens to approval_request_resolved signal and executes the approved action.
"""

from django.dispatch import receiver
from approvals.signals import approval_request_resolved
import logging

logger = logging.getLogger(__name__)


@receiver(approval_request_resolved)
def handle_discount_approval(sender, instance, outcome, **kwargs):
    """
    Apply discount when approval request is resolved.

    Listens to approval_request_resolved signal and applies discount
    if the request was approved and action_type is DISCOUNT.

    Args:
        sender: Signal sender (usually ManagerApprovalService)
        instance: ManagerApprovalRequest instance
        outcome: 'approved' or 'denied'
        **kwargs: Additional signal arguments
    """
    # Import here to avoid circular dependencies
    from approvals.models import ActionType
    from discounts.services import DiscountService

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

    if not order or not discount:
        logger.error(
            f"Discount approval request {instance.id} missing order or discount. "
            f"Cannot apply discount. Order: {order}, Discount: {discount}"
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
