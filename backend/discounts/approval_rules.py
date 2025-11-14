"""
Discount Approval Rules

Helper module for checking if discount operations need manager approval.
Keeps the discounts app decoupled from the approvals app by providing
a clean interface for approval checking and request creation.
"""

from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class DiscountApprovalChecker:
    """
    Helper for checking if discount operations need manager approval.
    Keeps discount app decoupled from approvals app.
    """

    @staticmethod
    def needs_approval(discount, order, store_location):
        """
        Check if applying this discount to this order needs approval.

        Args:
            discount: Discount instance to be applied
            order: Order instance to apply discount to
            store_location: StoreLocation instance

        Returns:
            bool: True if approval required, False otherwise
        """
        # Check if approvals are enabled for this location
        if not store_location.manager_approvals_enabled:
            return False

        # Import here to avoid circular dependencies
        from approvals.models import ActionType
        from approvals.services import ManagerApprovalService

        # Calculate discount percentage relative to order
        discount_percent = DiscountApprovalChecker._calculate_discount_percentage(
            discount, order
        )

        # Check threshold using approval service
        return ManagerApprovalService.check_if_needs_approval(
            action_type=ActionType.DISCOUNT,
            store_location=store_location,
            value=discount_percent
        )

    @staticmethod
    def request_approval(discount, order, store_location, initiator):
        """
        Create approval request for discount application.

        Args:
            discount: Discount instance to be applied
            order: Order instance to apply discount to
            store_location: StoreLocation instance
            initiator: User requesting the approval

        Returns:
            ManagerApprovalRequest instance

        Raises:
            ValueError: If initiator is None
        """
        if not initiator:
            raise ValueError("Initiator user is required for approval requests")

        # Import here to avoid circular dependencies
        from approvals.models import ActionType
        from approvals.services import ManagerApprovalService

        # Calculate threshold value based on discount type
        threshold_value = DiscountApprovalChecker._calculate_threshold_value(
            discount, order
        )

        # Build descriptive reason
        reason = DiscountApprovalChecker._build_approval_reason(
            discount, order, threshold_value
        )

        # Build payload with detailed context
        payload = {
            'discount_id': str(discount.id),
            'discount_name': discount.name,
            'discount_code': discount.code or '',
            'discount_type': discount.type,
            'discount_value': str(discount.value),
            'order_id': str(order.id),
            'order_number': order.order_number,
            'order_subtotal': str(order.subtotal),
            'calculated_threshold': str(threshold_value),
        }

        # Request approval using approval service
        try:
            approval_request = ManagerApprovalService.request_approval(
                action_type=ActionType.DISCOUNT,
                initiator=initiator,
                store_location=store_location,
                context={
                    'order': order,
                    'discount': discount,
                    'payload': payload,
                    'reason': reason,
                    'threshold_value': threshold_value,
                }
            )

            logger.info(
                f"Created approval request {approval_request.id} for discount "
                f"'{discount.name}' on order {order.order_number}"
            )

            return approval_request

        except Exception as e:
            logger.error(
                f"Failed to create approval request for discount '{discount.name}' "
                f"on order {order.order_number}: {e}",
                exc_info=True
            )
            raise

    @staticmethod
    def _calculate_discount_percentage(discount, order):
        """
        Calculate the discount percentage relative to the order.

        For PERCENTAGE discounts, returns the percentage directly.
        For FIXED_AMOUNT discounts, calculates what % of subtotal it represents.
        For BUY_X_GET_Y discounts, returns a high value to always require approval in v1.

        Args:
            discount: Discount instance
            order: Order instance

        Returns:
            Decimal: Discount percentage
        """
        if discount.type == 'PERCENTAGE':
            return discount.value

        elif discount.type == 'FIXED_AMOUNT':
            # Calculate % discount that fixed amount represents
            if order.subtotal > 0:
                discount_percent = (discount.value / order.subtotal) * Decimal('100.0')
            else:
                discount_percent = Decimal('0.0')
            return discount_percent

        elif discount.type == 'BUY_X_GET_Y':
            # For v1, always require approval for BOGO deals
            # This is a conservative approach - can be refined later
            return Decimal('100.0')

        else:
            # Unknown discount type - be conservative and require approval
            logger.warning(
                f"Unknown discount type '{discount.type}' for discount "
                f"'{discount.name}'. Defaulting to require approval."
            )
            return Decimal('100.0')

    @staticmethod
    def _calculate_threshold_value(discount, order):
        """
        Calculate the threshold value to compare against policy limits.

        Args:
            discount: Discount instance
            order: Order instance

        Returns:
            Decimal: Threshold value
        """
        if discount.type == 'PERCENTAGE':
            # For percentage discounts, threshold is the percentage itself
            return discount.value

        elif discount.type == 'FIXED_AMOUNT':
            # For fixed discounts, threshold is the dollar amount
            return discount.value

        elif discount.type == 'BUY_X_GET_Y':
            # For BOGO, use the estimated value of free items
            # This is a rough estimate - can be refined if needed
            return Decimal('0.00')

        else:
            return Decimal('0.00')

    @staticmethod
    def _build_approval_reason(discount, order, threshold_value):
        """
        Build a human-readable reason string for the approval request.

        Args:
            discount: Discount instance
            order: Order instance
            threshold_value: Calculated threshold value

        Returns:
            str: Approval reason
        """
        discount_type_display = dict(discount._meta.get_field('type').choices).get(
            discount.type, discount.type
        )

        if discount.type == 'PERCENTAGE':
            reason = (
                f"Discount '{discount.name}' ({discount_type_display}: {threshold_value}%) "
                f"on order {order.order_number} (subtotal: ${order.subtotal})"
            )
        elif discount.type == 'FIXED_AMOUNT':
            reason = (
                f"Discount '{discount.name}' ({discount_type_display}: ${threshold_value}) "
                f"on order {order.order_number} (subtotal: ${order.subtotal})"
            )
        elif discount.type == 'BUY_X_GET_Y':
            reason = (
                f"Discount '{discount.name}' (Buy {discount.buy_quantity} Get {discount.get_quantity} Free) "
                f"on order {order.order_number} (subtotal: ${order.subtotal})"
            )
        else:
            reason = (
                f"Discount '{discount.name}' ({discount.type}) "
                f"on order {order.order_number} (subtotal: ${order.subtotal})"
            )

        return reason
