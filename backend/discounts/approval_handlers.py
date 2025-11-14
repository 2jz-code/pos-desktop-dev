"""
Discount Approval Signal Handlers

Listens to approval signals and automatically applies discounts
when manager approval is granted.
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
    from .services import DiscountService

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
        approver_email = instance.approver.email if instance.approver else 'Unknown'
        logger.info(
            f"Applied discount '{discount.name}' to order {order.order_number} "
            f"after manager approval by {approver_email}. "
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
def notify_pos_of_discount_resolution(sender, instance, outcome, **kwargs):
    """
    Log discount approval/denial outcome.

    The POS frontend will reload the cart after receiving the approval response,
    so no WebSocket notification is needed here.

    Args:
        sender: Signal sender
        instance: ManagerApprovalRequest instance
        outcome: 'approved' or 'denied'
        **kwargs: Additional signal arguments
    """
    # Import here to avoid circular dependencies
    from approvals.models import ActionType

    # Only handle discount approvals
    if instance.action_type != ActionType.DISCOUNT:
        return

    order = instance.order
    if order:
        logger.info(
            f"Discount approval {instance.id} resolved as {outcome} "
            f"for order {order.order_number}. POS will reload cart automatically."
        )
