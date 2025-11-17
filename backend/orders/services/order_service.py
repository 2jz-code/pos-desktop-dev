from decimal import Decimal
from django.db import transaction
from django.utils import timezone
import logging

from orders.models import Order, OrderItem
from users.models import User
from business_hours.services import BusinessHoursService

logger = logging.getLogger(__name__)


class OrderService:
    """Core service for order lifecycle management - creating, updating, completing orders."""

    # Valid status transitions for order state machine
    VALID_STATUS_TRANSITIONS = {
        Order.OrderStatus.PENDING: [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.HOLD,
            Order.OrderStatus.COMPLETED,
            Order.OrderStatus.CANCELLED,
            Order.OrderStatus.VOID,
        ],
        Order.OrderStatus.HOLD: [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.COMPLETED,
            Order.OrderStatus.CANCELLED,
            Order.OrderStatus.VOID,
        ],
        Order.OrderStatus.COMPLETED: [
            Order.OrderStatus.VOID,  # Allow voiding completed orders to fix errors
        ],
        Order.OrderStatus.CANCELLED: [],
        Order.OrderStatus.VOID: [],
    }

    @staticmethod
    @transaction.atomic
    def create_new_order(
        cashier: User, customer: User = None, order_type: str = Order.OrderType.POS, tenant=None, store_location=None
    ) -> Order:
        """
        Creates a new, empty order.

        Args:
            cashier: The cashier creating the order
            customer: Optional customer for the order
            order_type: Type of order (POS, WEB, etc.)
            tenant: Tenant for the order (REQUIRED for multi-tenancy)
            store_location: StoreLocation for the order (REQUIRED for multi-location)

        Raises:
            ValueError: If tenant or store_location is not provided
        """
        if tenant is None:
            raise ValueError("tenant parameter is required for creating orders")

        if store_location is None:
            raise ValueError("store_location parameter is required for creating orders")

        order = Order.objects.create(
            order_type=order_type, cashier=cashier, customer=customer, tenant=tenant, store_location=store_location
        )
        return order

    @staticmethod
    @transaction.atomic
    def create_order(order_type: str, cashier: User, customer: User = None, tenant=None, store_location=None) -> Order:
        """
        Creates a new, empty order.
        Compatibility method for existing tests and code.

        Args:
            order_type: Type of order (POS, WEB, etc.)
            cashier: The cashier creating the order
            customer: Optional customer for the order
            tenant: Tenant for the order (REQUIRED for multi-tenancy)
            store_location: StoreLocation for the order (REQUIRED for multi-location)
        """
        return OrderService.create_new_order(cashier, customer, order_type, tenant, store_location)

    @staticmethod
    @transaction.atomic
    def update_order_status(order: Order, new_status: str) -> Order:
        """
        Updates the status of an order, checking for valid transitions and business hours.
        """
        if new_status not in Order.OrderStatus.values:
            raise ValueError(f"'{new_status}' is not a valid order status.")

        if new_status not in OrderService.VALID_STATUS_TRANSITIONS.get(
            order.status, []
        ):
            raise ValueError(
                f"Cannot transition order from {order.status} to {new_status}."
            )

        # Validate business hours when completing a web order
        if (new_status == Order.OrderStatus.COMPLETED and
            order.order_type == Order.OrderType.WEB and
            order.status == Order.OrderStatus.PENDING):

            if not order.store_location:
                raise ValueError("Store location is required for web orders.")

            business_hours_profile = order.store_location.business_hours_profile
            if business_hours_profile and business_hours_profile.is_active:
                service = BusinessHoursService(business_hours_profile)
                if not service.is_open():
                    status_summary = service.get_status_summary()
                    next_opening = status_summary.get('next_opening', 'business hours')
                    raise ValueError(
                        f"Cannot complete order. {order.store_location.name} is currently closed. "
                        f"Next opening: {next_opening}"
                    )

        order.status = new_status
        order.save(update_fields=["status", "updated_at"])
        return order

    @staticmethod
    @transaction.atomic
    def complete_order(order: Order, payment_data: dict) -> Order:
        """
        Finalizes an order.
        - Calls the payment service to handle payment.
        - Updates order status to COMPLETED.
        - Updates order surcharges_total from payment data.
        - Triggers inventory deduction.
        - Validates business hours for web orders.
        """
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError("Only PENDING or HOLD orders can be completed.")

        # Validate business hours for web orders (POS orders can be completed anytime)
        if order.order_type == Order.OrderType.WEB:
            if not order.store_location:
                raise ValueError("Store location is required for web orders.")

            business_hours_profile = order.store_location.business_hours_profile
            if business_hours_profile and business_hours_profile.is_active:
                service = BusinessHoursService(business_hours_profile)
                if not service.is_open():
                    status_summary = service.get_status_summary()
                    next_opening = status_summary.get('next_opening', 'business hours')
                    raise ValueError(
                        f"Cannot complete order. {order.store_location.name} is currently closed. "
                        f"Next opening: {next_opening}"
                    )

        # Update order surcharges from payment data
        if hasattr(order, 'payment_details') and order.payment_details:
            order.surcharges_total = order.payment_details.total_surcharges

        order.payment_status = Order.PaymentStatus.PAID
        order.status = Order.OrderStatus.COMPLETED

        # Set completed_at to current time for accurate reporting
        order.completed_at = timezone.now()

        order.save(update_fields=["status", "payment_status", "surcharges_total", "completed_at", "updated_at"])

        return order

    @staticmethod
    @transaction.atomic
    def reorder(source_order_id: str, user: User) -> Order:
        """
        Creates a new PENDING order by duplicating the items from a previous order.
        - The new order is assigned to the provided user.
        - Items are added using their current price, not the price at the time of the original sale.
        - The new order is left in a PENDING state, ready for checkout.
        """
        from orders.services.calculation_service import OrderCalculationService

        try:
            source_order = Order.objects.prefetch_related("items__product").get(
                id=source_order_id, customer=user
            )
        except Order.DoesNotExist:
            raise ValueError(
                "Original order not found or you do not have permission to reorder it."
            )

        # Create a new order for the user
        new_order = Order.objects.create(
            customer=user,
            order_type=source_order.order_type,
            tenant=source_order.tenant,  # Use same tenant as source order
            store_location=source_order.store_location,  # Copy store location from source order
        )

        # Copy items from the source order to the new one
        # FIX: Access already pre-fetched product data (no additional queries needed)
        for item in source_order.items.all():
            OrderItem.objects.create(
                order=new_order,
                product=item.product,
                quantity=item.quantity,
                price_at_sale=item.product.price,  # Use current price from pre-fetched data
                notes=item.notes,
                tenant=new_order.tenant
            )

        # Recalculate totals for the new order
        OrderCalculationService.recalculate_order_totals(new_order)

        return new_order

    @staticmethod
    @transaction.atomic
    def void_order_with_approval_check(order: Order, user=None, bypass_approval=False):
        """
        Voids an order with manager approval check.

        Similar to apply_discount_to_order, this method checks if approval is needed
        before voiding the order. If approval is required, it returns approval request info.

        Args:
            order: Order instance to void
            user: User requesting the void (required for approval requests)
            bypass_approval: If True, skip approval checking (used after approval granted)

        Returns:
            dict: Status dictionary if approval required, Order instance otherwise
                {
                    'status': 'pending_approval',
                    'approval_request_id': str(uuid),
                    'message': str,
                }
        """
        # --- START: Manager Approval Check ---
        if not bypass_approval and order.store_location:
            store_location = order.store_location
            logger.info(
                f"Checking approval for voiding order {order.order_number}. "
                f"Store location: {store_location.name}, Approvals enabled: {store_location.manager_approvals_enabled}"
            )

            # Check if this void needs manager approval
            from approvals.checkers import VoidOrderApprovalChecker
            if VoidOrderApprovalChecker.needs_approval(order, store_location):
                if not user or not user.is_authenticated:
                    error_msg = (
                        "Authenticated user required for void approval. "
                        "Please ensure the POS terminal is logged in."
                    )
                    logger.error(
                        f"{error_msg} User: {user}, Is authenticated: {getattr(user, 'is_authenticated', False)}"
                    )
                    raise ValueError(error_msg)

                # Get the amount to be refunded for logging and response
                void_amount = VoidOrderApprovalChecker._get_void_amount(order)

                logger.info(
                    f"Approval REQUIRED for voiding order {order.order_number} (amount to refund: ${void_amount})"
                )

                # Check if user can self-approve
                from approvals.models import ApprovalPolicy
                policy = ApprovalPolicy.get_for_location(store_location)

                can_self_approve = (
                    policy.allow_self_approval and
                    user.role in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
                )

                if can_self_approve:
                    logger.info(
                        f"Self-approval enabled and user {user.email} is a {user.role} - "
                        f"bypassing approval dialog and proceeding with void"
                    )
                    # Continue execution - void will proceed without approval dialog
                else:
                    # Create approval request (reason will be auto-generated by checker)
                    approval_request = VoidOrderApprovalChecker.request_approval(
                        order=order,
                        store_location=store_location,
                        initiator=user
                    )

                    # Return status indicating approval is required
                    return {
                        'status': 'pending_approval',
                        'approval_request_id': str(approval_request.id),
                        'message': f'Manager approval required to void order {order.order_number}',
                        'order_number': order.order_number,
                        'order_total': str(void_amount),  # Amount to be refunded
                    }
            else:
                logger.info(
                    f"Approval NOT required for voiding order {order.order_number}"
                )
        elif not order.store_location:
            logger.warning(
                f"Order {order.id} has no store_location - skipping approval check for void"
            )
        # --- END: Manager Approval Check ---

        # No approval needed (or bypassed) - void the order
        return OrderService.void_order(order)

    @staticmethod
    @transaction.atomic
    def void_order(order: Order) -> Order:
        """
        Voids an order - reverses payment and restores inventory.

        This is the proper way to void a paid order (same-day corrections).
        For unpaid orders, use cancel_order() instead.

        Args:
            order: Order instance to void

        Returns:
            Order: The voided order instance
        """
        # 1. Refund payment if order was paid
        from payments.services import PaymentService
        try:
            refund_result = PaymentService.refund_order_payment(
                order=order,
                reason=f"Order {order.order_number} voided"
            )
            if refund_result:
                logger.info(f"Refunded payments for voided order {order.order_number}")
        except Exception as e:
            # Log error but don't block void - payment may not exist yet
            logger.warning(f"Could not refund payment for order {order.order_number}: {e}")

        # 2. Restore inventory
        from inventory.services import InventoryService
        try:
            InventoryService.restore_order_inventory(order)
            logger.info(f"Restored inventory for voided order {order.order_number}")
        except Exception as e:
            # Log error but don't block void
            logger.error(f"Could not restore inventory for order {order.order_number}: {e}", exc_info=True)

        # 3. Set status to VOID
        return OrderService.update_order_status(order, Order.OrderStatus.VOID)

    @staticmethod
    def cancel_order(order: Order) -> Order:
        """Sets an order's status to CANCELLED after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.CANCELLED)

    @staticmethod
    def resume_order(order: Order) -> Order:
        """Sets an order's status to PENDING after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.PENDING)

    @staticmethod
    def hold_order(order: Order) -> Order:
        """Sets an order's status to HOLD after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.HOLD)

    @staticmethod
    @transaction.atomic
    def update_customer_info(order: Order, data: dict) -> Order:
        """
        Updates an order with customer information.
        If the user is a guest, it populates the guest fields.
        If the user is authenticated, it ensures their primary details are stored
        for the order record, but does not modify the User model itself.
        """
        if order.customer:
            # For authenticated users, prioritize form data over profile data
            # This allows users to modify their info for this specific order
            order.guest_first_name = (
                data.get("guest_first_name") or order.customer.first_name
            )
            order.guest_last_name = (
                data.get("guest_last_name") or order.customer.last_name
            )
            order.guest_email = data.get("guest_email") or order.customer.email
            order.guest_phone = data.get("guest_phone") or getattr(
                order.customer, "phone_number", ""
            )
        else:
            # For guest users, directly update the guest fields
            order.guest_first_name = data.get("guest_first_name")
            order.guest_last_name = data.get("guest_last_name")
            order.guest_email = data.get("guest_email")
            order.guest_phone = data.get("guest_phone")

        order.save()
        return order

    @staticmethod
    @transaction.atomic
    def mark_as_fully_paid(order: Order):
        """
        Marks an order as fully paid and handles related business logic.
        This method is called when a payment is completed.
        """
        # The order status updates are already handled in PaymentService._update_payment_status
        # This method can be extended in the future for additional business logic
        # like inventory updates, notifications, etc.
        pass

    @staticmethod
    @transaction.atomic
    def update_payment_status(order: Order, new_payment_status: str):
        """
        Updates the payment status of an order.
        This method ensures payment status changes go through the service layer.
        """
        if order.payment_status != new_payment_status:
            order.payment_status = new_payment_status
            order.save(update_fields=["payment_status", "updated_at"])
