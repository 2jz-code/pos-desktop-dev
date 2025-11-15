"""
Approval Checkers

Centralized approval checking logic for all action types.
Each checker determines if an action needs manager approval based on
configured thresholds and creates approval requests when needed.
"""

from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class DiscountApprovalChecker:
    """
    Checker for discount application approvals.
    Determines if applying a discount requires manager approval.
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


class VoidOrderApprovalChecker:
    """
    Checker for void order approvals.
    Determines if voiding an order requires manager approval.
    """

    @staticmethod
    def _get_void_amount(order):
        """
        Get the amount to use for void approval threshold.

        Uses payment.total_collected if available (actual amount paid including tips/surcharges),
        falls back to order.grand_total if order is unpaid.

        Args:
            order: Order instance

        Returns:
            Decimal: Amount to use for approval threshold
        """
        try:
            payment = order.payment_details
            # Use total_collected if payment exists and has been collected
            if payment and payment.total_collected > 0:
                return payment.total_collected
        except Exception:
            # No payment record exists, use order total
            pass

        # Fall back to order grand_total for unpaid orders
        return order.grand_total

    @staticmethod
    def needs_approval(order, store_location):
        """
        Check if voiding this order needs approval.

        Args:
            order: Order instance to be voided
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

        # Get the amount to check (uses total_collected if paid, grand_total otherwise)
        void_amount = VoidOrderApprovalChecker._get_void_amount(order)

        # Check threshold using the void amount
        return ManagerApprovalService.check_if_needs_approval(
            action_type=ActionType.ORDER_VOID,
            store_location=store_location,
            value=void_amount
        )

    @staticmethod
    def request_approval(order, store_location, initiator, reason=''):
        """
        Create approval request for void order.

        Args:
            order: Order instance to be voided
            store_location: StoreLocation instance
            initiator: User requesting the approval
            reason: Optional reason for voiding

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

        # Get the void amount (uses total_collected if paid, grand_total otherwise)
        void_amount = VoidOrderApprovalChecker._get_void_amount(order)

        # Build payload with detailed context
        payload = {
            'order_id': str(order.id),
            'order_number': order.order_number,
            'order_total': str(order.grand_total),
            'total_collected': str(void_amount),  # Actual amount to be refunded
            'order_subtotal': str(order.subtotal),
            'order_status': order.status,
            'item_count': order.items.count(),
        }

        # Build descriptive reason
        if not reason:
            reason = f"Void order {order.order_number} (amount to refund: ${void_amount})"

        # Request approval using approval service
        try:
            approval_request = ManagerApprovalService.request_approval(
                action_type=ActionType.ORDER_VOID,
                initiator=initiator,
                store_location=store_location,
                context={
                    'order': order,
                    'payload': payload,
                    'reason': reason,
                    'threshold_value': void_amount,
                }
            )

            logger.info(
                f"Created approval request {approval_request.id} for void "
                f"order {order.order_number} (amount to refund: ${void_amount})"
            )

            return approval_request

        except Exception as e:
            logger.error(
                f"Failed to create approval request for void order {order.order_number}: {e}",
                exc_info=True
            )
            raise
