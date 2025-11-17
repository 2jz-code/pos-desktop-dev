"""
Service layer for order adjustments (one-off discounts and price overrides).

Handles business logic for applying ad-hoc adjustments with approval checks.
"""
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
import logging

from orders.models import OrderAdjustment, Order, OrderItem
from users.models import User
from payments.money import quantize
from settings.config import AppSettings

logger = logging.getLogger(__name__)


class OrderAdjustmentService:
    """
    Service for applying and managing order adjustments.
    """

    @staticmethod
    def apply_one_off_discount_with_approval_check(
        order: Order,
        discount_type: str,
        discount_value: Decimal,
        reason: str,
        applied_by: User,
        order_item: 'OrderItem' = None,
    ) -> dict:
        """
        Apply a one-off discount with manager approval check.

        Similar to void_order_with_approval_check, this method checks if approval is needed
        before applying the discount. If approval is required, it returns approval request info.

        Args:
            order: Order instance to apply discount to
            discount_type: 'PERCENTAGE' or 'FIXED'
            discount_value: Percentage (e.g., 15.00 for 15%) or fixed amount (e.g., 10.00 for $10)
            reason: Reason for the discount (audit trail)
            applied_by: User who initiated the adjustment
            order_item: Optional OrderItem to apply discount to (None for order-level)

        Returns:
            dict: Status dictionary if approval required, result dictionary otherwise
                If approval required:
                {
                    'status': 'pending_approval',
                    'approval_request_id': str(uuid),
                    'message': str,
                }
                If successful:
                {
                    'adjustment': OrderAdjustment instance,
                    'order': Updated order instance,
                    'amount': Calculated discount amount,
                }

        Raises:
            ValidationError: If inputs are invalid
        """
        # Validate tenant consistency BEFORE any DB operations
        if applied_by.tenant_id != order.tenant_id:
            raise ValidationError("User must belong to the same tenant as the order")

        # --- START: Manager Approval Check ---
        if order.store_location:
            store_location = order.store_location
            logger.info(
                f"Checking approval for one-off {discount_type} discount of {discount_value} "
                f"on order {order.order_number}. "
                f"Store location: {store_location.name}, Approvals enabled: {store_location.manager_approvals_enabled}"
            )

            # Check if this discount needs manager approval
            from approvals.checkers import OneOffDiscountApprovalChecker
            if OneOffDiscountApprovalChecker.needs_approval(discount_type, discount_value, order, store_location, order_item):
                if not applied_by or not applied_by.is_authenticated:
                    error_msg = (
                        "Authenticated user required for discount approval. "
                        "Please ensure the POS terminal is logged in."
                    )
                    logger.error(
                        f"{error_msg} User: {applied_by}, Is authenticated: {getattr(applied_by, 'is_authenticated', False)}"
                    )
                    raise ValidationError(error_msg)

                logger.info(
                    f"Approval REQUIRED for one-off {discount_type} discount of {discount_value} "
                    f"on order {order.order_number}"
                )

                # Check if user can self-approve
                from approvals.models import ApprovalPolicy
                from users.models import User
                policy = ApprovalPolicy.get_for_location(store_location)

                can_self_approve = (
                    policy.allow_self_approval and
                    applied_by.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
                )

                if can_self_approve:
                    logger.info(
                        f"Self-approval enabled and user {applied_by.email} is a {applied_by.role} - "
                        f"bypassing approval dialog and proceeding with discount"
                    )
                    # Continue execution - discount will proceed without approval dialog
                else:
                    # Create approval request
                    approval_request = OneOffDiscountApprovalChecker.request_approval(
                        discount_type=discount_type,
                        discount_value=discount_value,
                        order=order,
                        store_location=store_location,
                        initiator=applied_by,
                        reason=reason,
                        order_item=order_item  # Pass order_item for item-level discounts
                    )

                    # Return status indicating approval is required
                    return {
                        'status': 'pending_approval',
                        'approval_request_id': str(approval_request.id),
                        'message': f'Manager approval required for {discount_type.lower()} discount',
                        'order_number': order.order_number,
                        'discount_type': discount_type,
                        'discount_value': str(discount_value),
                    }
            else:
                logger.info(
                    f"Approval NOT required for one-off {discount_type} discount of {discount_value} "
                    f"on order {order.order_number}"
                )
        elif not order.store_location:
            logger.warning(
                f"Order {order.id} has no store_location - skipping approval check for one-off discount"
            )
        # --- END: Manager Approval Check ---

        # No approval needed - apply the discount
        return OrderAdjustmentService.apply_one_off_discount(
            order=order,
            discount_type=discount_type,
            discount_value=discount_value,
            reason=reason,
            applied_by=applied_by,
            order_item=order_item,
            bypass_approval_check=True
        )

    @staticmethod
    @transaction.atomic
    def apply_one_off_discount(
        order: Order,
        discount_type: str,  # 'PERCENTAGE' or 'FIXED'
        discount_value: Decimal,
        reason: str,
        applied_by: User,
        order_item: 'OrderItem' = None,
        approved_by: User = None,
        bypass_approval_check: bool = False,
    ) -> dict:
        """
        Apply a one-off discount to an order or specific order item.

        Args:
            order: Order instance to apply discount to
            discount_type: 'PERCENTAGE' or 'FIXED'
            discount_value: Percentage (e.g., 15.00 for 15%) or fixed amount (e.g., 10.00 for $10)
            reason: Reason for the discount (audit trail)
            applied_by: User who initiated the adjustment
            order_item: Optional OrderItem to apply discount to (None for order-level)
            approved_by: Manager who approved (if applicable)
            bypass_approval_check: If True, skip approval requirement check (use when approval already verified)

        Returns:
            dict with:
                - 'adjustment': OrderAdjustment instance
                - 'order': Updated order instance
                - 'amount': Calculated discount amount
                - 'order_item': OrderItem instance (if item-level discount)

        Raises:
            ValidationError: If inputs are invalid or approval required but not provided
        """
        from orders.signals import order_needs_recalculation

        # Validate tenant consistency BEFORE any DB operations
        if applied_by.tenant_id != order.tenant_id:
            raise ValidationError("User must belong to the same tenant as the order")

        # If order_item is provided, validate it belongs to the order
        if order_item:
            if order_item.order_id != order.id:
                raise ValidationError("Order item must belong to the specified order")
            if order_item.tenant_id != order.tenant_id:
                raise ValidationError("Order item must belong to the same tenant as the order")

        # Validate discount type and value
        if discount_type not in [OrderAdjustment.DiscountType.PERCENTAGE, OrderAdjustment.DiscountType.FIXED]:
            raise ValidationError(f"Invalid discount_type: {discount_type}")

        if discount_value <= 0:
            raise ValidationError("Discount value must be positive")

        if discount_type == OrderAdjustment.DiscountType.PERCENTAGE and discount_value > 100:
            raise ValidationError("Percentage discount cannot exceed 100%")

        # --- CUMULATIVE DISCOUNT VALIDATION: Prevent negative line items ---
        # Calculate the dollar amount of the new discount
        new_discount_amount = Decimal('0.00')
        if discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
            if order_item:
                # Item-level percentage discount
                item_total = (order_item.price_at_sale * order_item.quantity) or Decimal('0.00')
                new_discount_amount = (item_total * (discount_value / Decimal('100.00')))
            else:
                # Order-level percentage discount
                subtotal = order.subtotal or Decimal('0.00')
                new_discount_amount = (subtotal * (discount_value / Decimal('100.00')))
        else:
            # Fixed discount - the value IS the amount
            new_discount_amount = discount_value

        # Get all existing discounts and calculate their cumulative dollar amount
        if order_item:
            # Item-level: Check cumulative discounts on THIS SPECIFIC ITEM
            existing_discounts = order.adjustments.filter(
                adjustment_type=OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT,
                order_item=order_item
            )

            # Calculate the dollar amount of existing discounts
            existing_discount_amount = Decimal('0.00')
            item_total = (order_item.price_at_sale * order_item.quantity) or Decimal('0.00')

            for adj in existing_discounts:
                if adj.discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
                    # Convert percentage to dollar amount based on current item price
                    existing_discount_amount += (item_total * (adj.discount_value / Decimal('100.00')))
                else:
                    # Fixed discount - use the discount_value
                    existing_discount_amount += adj.discount_value

            # Check if cumulative discounts would exceed item total
            cumulative_discount = existing_discount_amount + new_discount_amount
            if cumulative_discount > item_total:
                raise ValidationError(
                    f"Cannot apply discount: cumulative discounts (${cumulative_discount:.2f}) would exceed "
                    f"item total (${item_total:.2f}). Existing discounts: ${existing_discount_amount:.2f}, "
                    f"New discount: ${new_discount_amount:.2f}. Line items cannot be negative."
                )
        else:
            # Order-level: Check cumulative discounts against order subtotal
            existing_discounts = order.adjustments.filter(
                adjustment_type=OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT,
                order_item__isnull=True  # Only order-level discounts
            )

            # Calculate the dollar amount of existing order-level discounts
            existing_discount_amount = Decimal('0.00')
            subtotal = order.subtotal or Decimal('0.00')

            for adj in existing_discounts:
                if adj.discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
                    # Convert percentage to dollar amount based on current subtotal
                    existing_discount_amount += (subtotal * (adj.discount_value / Decimal('100.00')))
                else:
                    # Fixed discount - use the discount_value
                    existing_discount_amount += adj.discount_value

            # Check if cumulative discounts would exceed subtotal
            cumulative_discount = existing_discount_amount + new_discount_amount
            if cumulative_discount > subtotal:
                raise ValidationError(
                    f"Cannot apply discount: cumulative discounts (${cumulative_discount:.2f}) would exceed "
                    f"order subtotal (${subtotal:.2f}). Existing discounts: ${existing_discount_amount:.2f}, "
                    f"New discount: ${new_discount_amount:.2f}. Order total cannot be negative."
                )
        # --- END: CUMULATIVE DISCOUNT VALIDATION ---

        # For fixed discounts, ensure it doesn't exceed the applicable amount
        if discount_type == OrderAdjustment.DiscountType.FIXED:
            if order_item:
                # Item-level: Check against item total
                item_total = (order_item.price_at_sale * order_item.quantity) or Decimal('0.00')
                if discount_value > item_total:
                    raise ValidationError(
                        f"Fixed discount ${discount_value} cannot exceed item total ${item_total}. "
                        f"For full comps, use a dedicated comp feature."
                    )
            else:
                # Order-level: Check against order subtotal
                subtotal = order.subtotal or Decimal('0.00')
                if discount_value > subtotal:
                    raise ValidationError(
                        f"Fixed discount ${discount_value} cannot exceed order subtotal ${subtotal}. "
                        f"For full comps, use a dedicated comp feature."
                    )

        # Check if approval is required (unless bypassed)
        if not bypass_approval_check and order.store_location:
            from approvals.checkers import OneOffDiscountApprovalChecker
            if OneOffDiscountApprovalChecker.needs_approval(discount_type, discount_value, order, order.store_location, order_item):
                if not approved_by:
                    raise ValidationError(
                        "Manager approval is required for this discount amount. "
                        "Use the approval workflow or provide approved_by parameter."
                    )

        # Calculate discount amount
        # NOTE: Percentage applies to RAW subtotal/item total (before existing discounts)
        # This is standard retail behavior to prevent stacking confusion
        if discount_type == OrderAdjustment.DiscountType.PERCENTAGE:
            if order_item:
                # Item-level: Calculate from item total (price * quantity)
                item_total = (order_item.price_at_sale * order_item.quantity) or Decimal('0.00')
                amount = -(item_total * (discount_value / Decimal('100.00')))
            else:
                # Order-level: Calculate from order subtotal
                subtotal = order.subtotal or Decimal('0.00')
                amount = -(subtotal * (discount_value / Decimal('100.00')))
            # Round to currency precision using banker's rounding
            currency = AppSettings().currency
            amount = quantize(currency, amount)
        else:
            # Fixed amount discount
            amount = -discount_value

        # Create the adjustment
        adjustment = OrderAdjustment.objects.create(
            tenant=order.tenant,
            order=order,
            order_item=order_item,  # Will be None for order-level discounts
            adjustment_type=OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT,
            discount_type=discount_type,
            discount_value=discount_value,
            amount=amount,
            reason=reason,
            applied_by=applied_by,
            approved_by=approved_by,
        )

        if order_item:
            logger.info(
                f"Applied one-off {discount_type} discount of {discount_value} "
                f"(amount: {amount}) to item {order_item.id} in order {order.order_number} by {applied_by.email}"
            )
        else:
            logger.info(
                f"Applied one-off {discount_type} discount of {discount_value} "
                f"(amount: {amount}) to order {order.order_number} by {applied_by.email}"
            )

        # Trigger order recalculation
        order_needs_recalculation.send(sender=Order, order=order)

        # Refresh order from DB to get updated totals
        order.refresh_from_db()

        result = {
            'adjustment': adjustment,
            'order': order,
            'amount': amount,
        }

        # Include order_item in result if this was an item-level discount
        if order_item:
            result['order_item'] = order_item

        return result

    @staticmethod
    def apply_price_override_with_approval_check(
        order_item: OrderItem,
        new_price: Decimal,
        reason: str,
        applied_by: User,
        order: Order = None,  # Optional, will be derived from order_item if not provided
    ) -> dict:
        """
        Apply a price override with manager approval check.

        Similar to apply_one_off_discount_with_approval_check, this method checks if approval
        is needed before applying the price override.

        Args:
            order_item: OrderItem instance to override price for
            new_price: New price for the item
            reason: Reason for the override (audit trail)
            applied_by: User who initiated the adjustment
            order: Order instance (optional, derived from order_item if not provided)

        Returns:
            dict: Status dictionary if approval required, result dictionary otherwise
                If approval required:
                {
                    'status': 'pending_approval',
                    'approval_request_id': str(uuid),
                    'message': str,
                }
                If successful:
                {
                    'adjustment': OrderAdjustment instance,
                    'order': Updated order instance,
                    'order_item': Updated order item instance,
                    'amount': Price difference (new - original),
                }

        Raises:
            ValidationError: If inputs are invalid
        """
        # Derive order from order_item if not provided
        if order is None:
            order = order_item.order

        # Validate tenant/order consistency BEFORE any DB operations
        if applied_by.tenant_id != order.tenant_id:
            raise ValidationError("User must belong to the same tenant as the order")

        if order_item.order_id != order.id:
            raise ValidationError("Order item must belong to the specified order")

        # --- START: Manager Approval Check ---
        if order.store_location:
            store_location = order.store_location

            # Calculate price difference for approval check
            original_price = order_item.price_at_sale
            price_diff_per_unit = new_price - original_price
            total_price_diff = abs(price_diff_per_unit * order_item.quantity)

            logger.info(
                f"Checking approval for price override on item {order_item.id} "
                f"in order {order.order_number}: ${original_price} → ${new_price} "
                f"(diff: ${abs(price_diff_per_unit)}, total: ${total_price_diff}). "
                f"Store location: {store_location.name}, Approvals enabled: {store_location.manager_approvals_enabled}"
            )

            # Check if this price override needs manager approval
            from approvals.checkers import PriceOverrideApprovalChecker
            if PriceOverrideApprovalChecker.needs_approval(total_price_diff, store_location):
                if not applied_by or not applied_by.is_authenticated:
                    error_msg = (
                        "Authenticated user required for price override approval. "
                        "Please ensure the POS terminal is logged in."
                    )
                    logger.error(
                        f"{error_msg} User: {applied_by}, Is authenticated: {getattr(applied_by, 'is_authenticated', False)}"
                    )
                    raise ValidationError(error_msg)

                logger.info(
                    f"Approval REQUIRED for price override on item {order_item.id} "
                    f"in order {order.order_number} (total diff: ${total_price_diff})"
                )

                # Check if user can self-approve
                from approvals.models import ApprovalPolicy
                from users.models import User
                policy = ApprovalPolicy.get_for_location(store_location)

                can_self_approve = (
                    policy.allow_self_approval and
                    applied_by.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
                )

                if can_self_approve:
                    logger.info(
                        f"Self-approval enabled and user {applied_by.email} is a {applied_by.role} - "
                        f"bypassing approval dialog and proceeding with price override"
                    )
                    # Continue execution - price override will proceed without approval dialog
                else:
                    # Create approval request
                    approval_request = PriceOverrideApprovalChecker.request_approval(
                        order_item=order_item,
                        new_price=new_price,
                        order=order,
                        store_location=store_location,
                        initiator=applied_by,
                        reason=reason
                    )

                    # Return status indicating approval is required
                    return {
                        'status': 'pending_approval',
                        'approval_request_id': str(approval_request.id),
                        'message': f'Manager approval required for price override',
                        'order_number': order.order_number,
                        'original_price': str(original_price),
                        'new_price': str(new_price),
                        'total_difference': str(total_price_diff),
                    }
            else:
                logger.info(
                    f"Approval NOT required for price override on item {order_item.id} "
                    f"in order {order.order_number} (total diff: ${total_price_diff})"
                )
        elif not order.store_location:
            logger.warning(
                f"Order {order.id} has no store_location - skipping approval check for price override"
            )
        # --- END: Manager Approval Check ---

        # No approval needed - apply the price override
        return OrderAdjustmentService.apply_price_override(
            order_item=order_item,
            new_price=new_price,
            reason=reason,
            applied_by=applied_by,
            order=order,
            bypass_approval_check=True
        )

    @staticmethod
    @transaction.atomic
    def apply_price_override(
        order_item: OrderItem,
        new_price: Decimal,
        reason: str,
        applied_by: User,
        order: Order = None,  # Optional, will be derived from order_item if not provided
        approved_by: User = None,
        bypass_approval_check: bool = False,
    ) -> dict:
        """
        Apply a price override to an order item.

        NOTE: This updates the item's price_at_sale directly. Order recalculation will
        recompute modifiers based on the new price. The adjustment tracks the delta.

        Args:
            order_item: OrderItem instance to override price for
            new_price: New price for the item
            reason: Reason for the override (audit trail)
            applied_by: User who initiated the adjustment
            order: Order instance (optional, derived from order_item if not provided)
            approved_by: Manager who approved (if applicable)
            bypass_approval_check: If True, skip approval requirement check (use when approval already verified)

        Returns:
            dict with:
                - 'adjustment': OrderAdjustment instance
                - 'order': Updated order instance
                - 'order_item': Updated order item instance
                - 'amount': Price difference (new - original)

        Raises:
            ValidationError: If inputs are invalid or approval required but not provided
        """
        from orders.signals import order_needs_recalculation

        # Derive order from order_item if not provided
        if order is None:
            order = order_item.order

        # Validate tenant/order consistency BEFORE any DB operations
        if applied_by.tenant_id != order.tenant_id:
            raise ValidationError("User must belong to the same tenant as the order")

        if order_item.order_id != order.id:
            raise ValidationError("Order item must belong to the specified order")

        if order_item.tenant_id != order.tenant_id:
            raise ValidationError("Order item must belong to the same tenant as the order")

        # Validate new price
        if new_price < 0:
            raise ValidationError("New price cannot be negative")

        original_price = order_item.price_at_sale

        # Calculate price difference and check if approval needed
        price_diff_per_unit = new_price - original_price
        total_price_diff = abs(price_diff_per_unit * order_item.quantity)

        # Check if approval is required (unless bypassed)
        if not bypass_approval_check and order.store_location:
            from approvals.checkers import PriceOverrideApprovalChecker
            if PriceOverrideApprovalChecker.needs_approval(total_price_diff, order.store_location):
                if not approved_by:
                    raise ValidationError(
                        "Manager approval is required for this price override amount. "
                        "Use the approval workflow or provide approved_by parameter."
                    )

        # Total amount difference for the quantity (can be positive or negative)
        amount = price_diff_per_unit * order_item.quantity
        # Round to currency precision for consistency
        currency = AppSettings().currency
        amount = quantize(currency, amount)

        # Create the adjustment
        adjustment = OrderAdjustment.objects.create(
            tenant=order.tenant,
            order=order,
            order_item=order_item,
            adjustment_type=OrderAdjustment.AdjustmentType.PRICE_OVERRIDE,
            original_price=original_price,
            new_price=new_price,
            amount=amount,
            reason=reason,
            applied_by=applied_by,
            approved_by=approved_by,
        )

        # Update order item price
        # NOTE: Modifiers will be recalculated based on new price during order recalculation
        order_item.price_at_sale = new_price
        order_item.save(update_fields=['price_at_sale'])

        logger.info(
            f"Applied price override on item {order_item.id} in order {order.order_number}: "
            f"{original_price} -> {new_price} (diff: {price_diff_per_unit}, total: {amount}) by {applied_by.email}"
        )

        # Trigger order recalculation
        order_needs_recalculation.send(sender=Order, order=order)

        # Refresh order from DB to get updated totals
        order.refresh_from_db()

        return {
            'adjustment': adjustment,
            'order': order,
            'order_item': order_item,
            'amount': amount,
        }

    @staticmethod
    def get_order_adjustments(order: Order):
        """
        Get all adjustments for an order.

        Args:
            order: Order instance

        Returns:
            QuerySet of OrderAdjustment instances
        """
        return order.adjustments.all().order_by('-created_at')

    @staticmethod
    def get_total_adjustments_amount(order: Order, exclude_types: list = None) -> Decimal:
        """
        Calculate total adjustment amount for an order.

        Args:
            order: Order instance
            exclude_types: Optional list of AdjustmentType values to exclude from calculation.
                          Used to exclude PRICE_OVERRIDE since price changes are already in price_at_sale.

        Returns:
            Total adjustment amount (sum of all adjustment amounts)
        """
        from django.db.models import Sum

        queryset = order.adjustments.all()

        # Exclude specified adjustment types if provided
        if exclude_types:
            queryset = queryset.exclude(adjustment_type__in=exclude_types)

        total = queryset.aggregate(total=Sum('amount'))['total']
        return total or Decimal('0.00')
