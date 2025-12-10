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


class OneOffDiscountApprovalChecker:
    """
    Checker for one-off discount approvals.
    Determines if applying a one-off discount requires manager approval.
    """

    @staticmethod
    def needs_approval(discount_type, discount_value, order, store_location, order_item=None):
        """
        Check if applying this one-off discount needs approval.

        Uses cumulative discount checking to prevent threshold gaming:
        - For order-level: Sums all existing order-level discounts of the same type
        - For item-level: Sums all existing discounts on that SPECIFIC ITEM
        - Adds the new discount value
        - Checks if cumulative total exceeds threshold

        Args:
            discount_type: 'PERCENTAGE' or 'FIXED'
            discount_value: Percentage or fixed amount value
            order: Order instance to apply discount to
            store_location: StoreLocation instance
            order_item: Optional OrderItem for item-level discounts

        Returns:
            bool: True if approval required, False otherwise
        """
        # Check if approvals are enabled for this location
        if not store_location.manager_approvals_enabled:
            return False

        # Import here to avoid circular dependencies
        from approvals.models import ActionType
        from approvals.services import ManagerApprovalService
        from orders.models import OrderAdjustment

        # Get policy for threshold checks
        from approvals.models import ApprovalPolicy
        policy = ApprovalPolicy.get_for_location(store_location)

        # Check if discounts always require approval (regardless of amount)
        if policy.requires_approval_for_action(ActionType.DISCOUNT):
            return True

        # Calculate cumulative discount value (sum of existing + new)
        # This prevents threshold gaming by applying multiple small discounts
        if order_item:
            # Item-level: Check cumulative for THIS SPECIFIC ITEM
            existing_discounts = order.adjustments.filter(
                adjustment_type=OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT,
                discount_type=discount_type,
                order_item=order_item  # Only discounts on this specific item
            )
            scope = f"item {order_item.product.name if order_item.product else order_item.custom_name}"
        else:
            # Order-level: Check cumulative across all order-level discounts
            existing_discounts = order.adjustments.filter(
                adjustment_type=OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT,
                discount_type=discount_type,
                order_item__isnull=True  # Only order-level discounts
            )
            scope = "order"

        # Sum existing discount values (not amounts, but the original discount_value field)
        cumulative_value = sum(
            adj.discount_value for adj in existing_discounts
        ) + discount_value

        logger.info(
            f"Cumulative {discount_type} discount check for {scope} in order {order.order_number}: "
            f"existing={sum(adj.discount_value for adj in existing_discounts)}, "
            f"new={discount_value}, cumulative={cumulative_value}"
        )

        # For percentage discounts, check cumulative against max_discount_percent threshold
        if discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
            return cumulative_value > policy.max_discount_percent
        else:
            # For fixed discounts, check cumulative against max_fixed_discount_amount threshold
            return cumulative_value > policy.max_fixed_discount_amount

    @staticmethod
    def request_approval(discount_type, discount_value, order, store_location, initiator, reason='', order_item=None):
        """
        Create approval request for one-off discount application.

        Args:
            discount_type: 'PERCENTAGE' or 'FIXED'
            discount_value: Percentage or fixed amount value
            order: Order instance to apply discount to
            store_location: StoreLocation instance
            initiator: User requesting the approval
            reason: Reason for the discount
            order_item: Optional OrderItem for item-level discounts

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
        from orders.models import OrderAdjustment

        # Calculate threshold value
        # For both percentage and fixed, use the discount_value directly
        # (percentage as %, fixed as $)
        threshold_value = discount_value

        # Build descriptive reason
        if not reason:
            if order_item:
                # Item-level discount
                item_name = order_item.product.name if order_item.product else order_item.custom_name
                if discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
                    reason = f"One-off {discount_value}% discount on {item_name} in order {order.order_number}"
                else:
                    reason = f"One-off ${discount_value} discount on {item_name} in order {order.order_number}"
            else:
                # Order-level discount
                if discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
                    reason = f"One-off {discount_value}% discount on order {order.order_number}"
                else:
                    reason = f"One-off ${discount_value} discount on order {order.order_number}"

        # Build payload with detailed context
        payload = {
            'order_id': str(order.id),
            'order_number': order.order_number,
            'discount_type': discount_type,
            'discount_value': str(discount_value),
            'order_subtotal': str(order.subtotal),
            'calculated_threshold': str(threshold_value),
            'reason': reason,
        }

        # Add order_item_id if this is an item-level discount
        if order_item:
            payload['order_item_id'] = str(order_item.id)

        # Request approval using approval service
        try:
            approval_request = ManagerApprovalService.request_approval(
                action_type=ActionType.DISCOUNT,
                initiator=initiator,
                store_location=store_location,
                context={
                    'order': order,
                    'payload': payload,
                    'reason': reason,
                    'threshold_value': threshold_value,
                }
            )

            logger.info(
                f"Created approval request {approval_request.id} for one-off discount "
                f"on order {order.order_number} ({discount_type}: {discount_value})"
            )

            return approval_request

        except Exception as e:
            logger.error(
                f"Failed to create approval request for one-off discount on order {order.order_number}: {e}",
                exc_info=True
            )
            raise


class PriceOverrideApprovalChecker:
    """
    Checker for price override approvals.
    Determines if overriding an item's price requires manager approval.
    """

    @staticmethod
    def needs_approval(price_override_amount, store_location):
        """
        Check if this price override needs approval.

        Args:
            price_override_amount: Absolute difference in price (always positive)
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

        # Check against max_price_override_amount threshold
        return ManagerApprovalService.check_if_needs_approval(
            action_type=ActionType.PRICE_OVERRIDE,
            store_location=store_location,
            value=price_override_amount
        )

    @staticmethod
    def request_approval(order_item, new_price, order, store_location, initiator, reason=''):
        """
        Create approval request for price override.

        Args:
            order_item: OrderItem instance to override price for
            new_price: New price to set
            order: Order instance
            store_location: StoreLocation instance
            initiator: User requesting the approval
            reason: Reason for the override

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

        original_price = order_item.price_at_sale
        price_diff = new_price - original_price
        total_diff = abs(price_diff * order_item.quantity)

        # Build descriptive reason
        if not reason:
            item_name = order_item.custom_name if not order_item.product else order_item.product.name
            reason = (
                f"Price override on {item_name} in order {order.order_number}: "
                f"${original_price} → ${new_price} (diff: ${abs(price_diff)})"
            )

        # Build payload with detailed context
        payload = {
            'order_id': str(order.id),
            'order_number': order.order_number,
            'order_item_id': str(order_item.id),
            'item_name': order_item.custom_name if not order_item.product else order_item.product.name,
            'original_price': str(original_price),
            'new_price': str(new_price),
            'price_difference': str(price_diff),
            'quantity': order_item.quantity,
            'total_difference': str(total_diff),
            'reason': reason,
        }

        # Request approval using approval service
        try:
            approval_request = ManagerApprovalService.request_approval(
                action_type=ActionType.PRICE_OVERRIDE,
                initiator=initiator,
                store_location=store_location,
                context={
                    'order': order,
                    'order_item': order_item,
                    'payload': payload,
                    'reason': reason,
                    'threshold_value': total_diff,
                }
            )

            logger.info(
                f"Created approval request {approval_request.id} for price override "
                f"on item {order_item.id} in order {order.order_number} "
                f"(${original_price} → ${new_price})"
            )

            return approval_request

        except Exception as e:
            logger.error(
                f"Failed to create approval request for price override on item {order_item.id}: {e}",
                exc_info=True
            )
            raise

class TaxExemptApprovalChecker:
    """
    Checker for tax exemption approvals.
    Tax exemptions ALWAYS require manager approval due to compliance requirements.
    """

    @staticmethod
    def needs_approval(order, store_location):
        """
        Check if tax exemption needs approval.
        Always returns True - tax exemptions always require manager approval.

        Args:
            order: Order instance
            store_location: StoreLocation instance

        Returns:
            bool: Always True (tax exemptions always need approval)
        """
        # Check if approvals are enabled for this location
        if not store_location.manager_approvals_enabled:
            return False
        
        # Tax exemptions ALWAYS require approval for compliance
        return True

    @staticmethod
    def request_approval(order, store_location, initiator, reason=''):
        """
        Create approval request for tax exemption.

        Args:
            order: Order instance
            store_location: StoreLocation instance
            initiator: User requesting the approval
            reason: Reason for tax exemption (required for audit)

        Returns:
            ManagerApprovalRequest instance

        Raises:
            ValueError: If initiator is None or reason is empty
        """
        if not initiator:
            raise ValueError("Initiator user is required for approval requests")
        
        if not reason or not reason.strip():
            raise ValueError("Reason is required for tax exemptions (compliance)")

        # Import here to avoid circular dependencies
        from approvals.models import ActionType
        from approvals.services import ManagerApprovalService

        # Calculate tax amount being exempted
        tax_amount = order.tax_total or Decimal('0.00')

        # Create payload with exemption details
        payload = {
            'tax_amount': str(tax_amount),
            'reason': reason,
        }

        try:
            approval_request = ManagerApprovalService.request_approval(
                action_type=ActionType.TAX_EXEMPT,
                initiator=initiator,
                store_location=store_location,
                context={
                    'order': order,
                    'payload': payload,
                    'reason': reason,
                    'threshold_value': float(tax_amount),
                }
            )

            logger.info(
                f"Created approval request {approval_request.id} for tax exemption "
                f"on order {order.order_number} (tax amount: ${tax_amount})"
            )

            return approval_request

        except Exception as e:
            logger.error(
                f"Failed to create approval request for tax exemption on order {order.id}: {e}",
                exc_info=True
            )
            raise


class FeeExemptApprovalChecker:
    """
    Checker for fee exemption approvals.
    Fee exemptions ALWAYS require manager approval.
    """

    @staticmethod
    def needs_approval(order, store_location):
        """
        Check if fee exemption needs approval.
        Always returns True - fee exemptions always require manager approval.

        Args:
            order: Order instance
            store_location: StoreLocation instance

        Returns:
            bool: Always True (fee exemptions always need approval)
        """
        # Check if approvals are enabled for this location
        if not store_location.manager_approvals_enabled:
            return False
        
        # Fee exemptions ALWAYS require approval
        return True

    @staticmethod
    def request_approval(order, store_location, initiator, reason=''):
        """
        Create approval request for fee exemption.

        Args:
            order: Order instance
            store_location: StoreLocation instance
            initiator: User requesting the approval
            reason: Reason for fee exemption

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

        # Calculate fee amount being exempted (usually $0 since surcharges are added during payment)
        # This is mainly for audit/display purposes
        fee_amount = order.surcharges_total or Decimal('0.00')

        # Create payload with exemption details
        payload = {
            'fee_amount': str(fee_amount),
            'reason': reason,
        }

        try:
            approval_request = ManagerApprovalService.request_approval(
                action_type=ActionType.FEE_EXEMPT,
                initiator=initiator,
                store_location=store_location,
                context={
                    'order': order,
                    'payload': payload,
                    'reason': reason,
                    'threshold_value': float(fee_amount),
                }
            )

            logger.info(
                f"Created approval request {approval_request.id} for fee exemption "
                f"on order {order.order_number} (fee amount: ${fee_amount})"
            )

            return approval_request

        except Exception as e:
            logger.error(
                f"Failed to create approval request for fee exemption on order {order.id}: {e}",
                exc_info=True
            )
            raise
