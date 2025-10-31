"""
Refund calculation and processing services.

This module implements the core refund logic with penny-perfect precision
using minor-unit arithmetic from payments.money.
"""

from decimal import Decimal
from typing import List, Dict, Optional, Tuple
from django.db import transaction
import logging

from payments.money import to_minor, from_minor, allocate_minor, validate_minor_sum
from orders.models import OrderItem
from payments.models import Payment, PaymentTransaction

logger = logging.getLogger(__name__)


class RefundCalculator:
    """
    Calculates item-level refunds with proportional allocation of tax, tip, and surcharge.

    Uses minor-unit arithmetic throughout to prevent penny drift.

    Key Principles:
    1. All calculations in minor units (cents)
    2. Proportional allocation using allocate_minor()
    3. Validation that sums match exactly
    4. Deterministic (same inputs → same outputs)

    Example Usage:
        calculator = RefundCalculator(payment, currency='USD')
        refund = calculator.calculate_item_refund(
            order_item=item,
            quantity=2,
            transaction=transaction
        )
        # refund = {
        #     'subtotal': Decimal('20.00'),
        #     'tax': Decimal('1.80'),
        #     'tip': Decimal('3.33'),
        #     'surcharge': Decimal('0.60'),
        #     'total': Decimal('25.73')
        # }
    """

    def __init__(self, payment: Payment, currency: str = 'USD'):
        """
        Initialize calculator for a specific payment.

        Args:
            payment: The Payment object being refunded
            currency: ISO 4217 currency code (default: USD)
        """
        self.payment = payment
        self.order = payment.order
        self.currency = currency

    def calculate_item_refund(
        self,
        order_item: OrderItem,
        quantity: int,
        transaction: Optional[PaymentTransaction] = None
    ) -> Dict[str, Decimal]:
        """
        Calculate refund amounts for a specific item with proportional allocations.

        Args:
            order_item: The OrderItem being refunded
            quantity: Number of units to refund (must be <= order_item.quantity)
            transaction: Optional specific transaction to refund from
                        (if None, uses most recent successful transaction)

        Returns:
            Dict with Decimal amounts:
            {
                'subtotal': item price * quantity,
                'tax': proportional tax,
                'tip': proportional tip,
                'surcharge': proportional surcharge,
                'total': sum of all above
            }

        Raises:
            ValueError: If quantity invalid or item not refundable
        """
        # Validation
        if quantity <= 0:
            raise ValueError("Quantity must be positive")
        if quantity > order_item.quantity:
            raise ValueError(f"Cannot refund {quantity} units - only {order_item.quantity} ordered")

        # Get the transaction to refund from
        if transaction is None:
            transaction = self._get_default_transaction()

        # Calculate base refund amount (item price * quantity)
        subtotal_minor = self._calculate_item_subtotal(order_item, quantity)

        # Calculate proportional tax
        tax_minor = self._calculate_item_tax(order_item, quantity)

        # Calculate proportional tip and surcharge from transaction
        tip_minor, surcharge_minor = self._calculate_item_tip_and_surcharge(
            order_item, quantity, transaction
        )

        # Calculate total
        total_minor = subtotal_minor + tax_minor + tip_minor + surcharge_minor

        # Validate sum (catch any calculation bugs)
        validate_minor_sum(
            [subtotal_minor, tax_minor, tip_minor, surcharge_minor],
            total_minor,
            context=f"item refund for {order_item.product.name}"
        )

        return {
            'subtotal': from_minor(self.currency, subtotal_minor),
            'tax': from_minor(self.currency, tax_minor),
            'tip': from_minor(self.currency, tip_minor),
            'surcharge': from_minor(self.currency, surcharge_minor),
            'total': from_minor(self.currency, total_minor),
        }

    def calculate_multiple_items_refund(
        self,
        items_with_quantities: List[Tuple[OrderItem, int]],
        transaction: Optional[PaymentTransaction] = None
    ) -> Dict[str, any]:
        """
        Calculate refund for multiple items at once.

        Args:
            items_with_quantities: List of (OrderItem, quantity) tuples
            transaction: Optional transaction to refund from

        Returns:
            Dict with:
            {
                'items': [
                    {
                        'order_item': OrderItem,
                        'quantity': int,
                        'subtotal': Decimal,
                        'tax': Decimal,
                        'tip': Decimal,
                        'surcharge': Decimal,
                        'item_total': Decimal
                    },
                    ...
                ],
                'total_subtotal': Decimal,
                'total_tax': Decimal,
                'total_tip': Decimal,
                'total_surcharge': Decimal,
                'grand_total': Decimal
            }
        """
        if transaction is None:
            transaction = self._get_default_transaction()

        items_breakdown = []
        total_subtotal_minor = 0
        total_tax_minor = 0
        total_tip_minor = 0
        total_surcharge_minor = 0

        for order_item, quantity in items_with_quantities:
            refund = self.calculate_item_refund(order_item, quantity, transaction)

            subtotal_minor = to_minor(self.currency, refund['subtotal'])
            tax_minor = to_minor(self.currency, refund['tax'])
            tip_minor = to_minor(self.currency, refund['tip'])
            surcharge_minor = to_minor(self.currency, refund['surcharge'])

            items_breakdown.append({
                'order_item': order_item,
                'quantity': quantity,
                'subtotal': refund['subtotal'],
                'tax': refund['tax'],
                'tip': refund['tip'],
                'surcharge': refund['surcharge'],
                'item_total': refund['total'],
            })

            total_subtotal_minor += subtotal_minor
            total_tax_minor += tax_minor
            total_tip_minor += tip_minor
            total_surcharge_minor += surcharge_minor

        grand_total_minor = (
            total_subtotal_minor + total_tax_minor +
            total_tip_minor + total_surcharge_minor
        )

        return {
            'items': items_breakdown,
            'total_subtotal': from_minor(self.currency, total_subtotal_minor),
            'total_tax': from_minor(self.currency, total_tax_minor),
            'total_tip': from_minor(self.currency, total_tip_minor),
            'total_surcharge': from_minor(self.currency, total_surcharge_minor),
            'grand_total': from_minor(self.currency, grand_total_minor),
        }

    def _calculate_item_subtotal(self, order_item: OrderItem, quantity: int) -> int:
        """Calculate item subtotal in minor units."""
        # Item price includes modifiers
        price_per_unit = order_item.price_at_sale
        price_per_unit_minor = to_minor(self.currency, price_per_unit)

        return price_per_unit_minor * quantity

    def _calculate_item_tax(self, order_item: OrderItem, quantity: int) -> int:
        """
        Calculate proportional tax for item in minor units.

        Uses OrderItem.tax_amount if available (new orders).
        Falls back to proportional calculation for legacy orders.
        """
        if order_item.tax_amount is not None:
            # New order: use stored per-line tax
            tax_per_unit_minor = to_minor(self.currency, order_item.tax_amount)

            # For partial quantity refunds, prorate the tax
            if quantity < order_item.quantity:
                # Proportional: (quantity / total_quantity) * total_tax
                tax_minor = (tax_per_unit_minor * quantity) // order_item.quantity
            else:
                # Full refund: use full tax amount
                tax_minor = tax_per_unit_minor
        else:
            # Legacy order: calculate proportionally from order tax_total
            item_subtotal_minor = self._calculate_item_subtotal(order_item, quantity)
            order_subtotal_minor = to_minor(self.currency, self.order.subtotal)
            order_tax_minor = to_minor(self.currency, self.order.tax_total)

            if order_subtotal_minor > 0:
                tax_minor = (item_subtotal_minor * order_tax_minor) // order_subtotal_minor
            else:
                tax_minor = 0

        return tax_minor

    def _calculate_item_tip_and_surcharge(
        self,
        order_item: OrderItem,
        quantity: int,
        transaction: PaymentTransaction
    ) -> Tuple[int, int]:
        """
        Calculate proportional tip and surcharge for item in minor units.

        Uses allocate_minor() for deterministic penny distribution.

        Returns:
            Tuple[int, int]: (tip_minor, surcharge_minor)
        """
        # Get transaction amounts
        tip_total_minor = to_minor(self.currency, transaction.tip)
        surcharge_total_minor = to_minor(self.currency, transaction.surcharge)

        # If no tip or surcharge, short circuit
        if tip_total_minor == 0 and surcharge_total_minor == 0:
            return (0, 0)

        # Build weights for allocation (all items in order)
        # Weight = item subtotal (including this item at refund quantity)
        weights = []
        this_item_index = None

        for idx, item in enumerate(self.order.items.all()):
            if item.id == order_item.id:
                # This is the item being refunded - use refund quantity
                item_subtotal_minor = self._calculate_item_subtotal(item, quantity)
                this_item_index = idx
            else:
                # Other items - use full quantity
                item_subtotal_minor = to_minor(self.currency, item.total_price)

            weights.append(item_subtotal_minor)

        # Allocate tip across items
        tip_allocations = allocate_minor(weights, tip_total_minor)
        surcharge_allocations = allocate_minor(weights, surcharge_total_minor)

        # Get this item's allocation
        tip_minor = tip_allocations[this_item_index]
        surcharge_minor = surcharge_allocations[this_item_index]

        return (tip_minor, surcharge_minor)

    def _get_default_transaction(self) -> PaymentTransaction:
        """
        Get the default transaction to refund from.

        Returns the most recent successful transaction.
        """
        transaction = self.payment.transactions.filter(
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL
        ).order_by('-created_at').first()

        if not transaction:
            raise ValueError("No successful transaction found to refund")

        return transaction

    def preview_full_refund(self) -> Dict[str, Decimal]:
        """
        Preview a full order refund (all items).

        Returns:
            Dict with totals for entire refund
        """
        items_with_quantities = [
            (item, item.quantity) for item in self.order.items.all()
        ]

        return self.calculate_multiple_items_refund(items_with_quantities)


class RefundValidator:
    """
    Validates refund requests before processing.

    Checks:
    - Item is refundable
    - Quantity is valid
    - Not already refunded
    - Payment/transaction is refundable
    """

    @staticmethod
    def validate_item_refund(
        order_item: OrderItem,
        quantity: int
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate if an item can be refunded.

        Returns:
            Tuple[bool, Optional[str]]: (is_valid, error_message)
        """
        # Check quantity
        if quantity <= 0:
            return (False, "Quantity must be positive")

        if quantity > order_item.quantity:
            return (False, f"Cannot refund {quantity} units - only {order_item.quantity} ordered")

        # Check if already fully refunded
        from refunds.models import RefundItem
        total_refunded = sum(
            refund.quantity_refunded
            for refund in RefundItem.objects.filter(order_item=order_item)
        )

        remaining = order_item.quantity - total_refunded
        if quantity > remaining:
            return (False, f"Only {remaining} units available to refund ({total_refunded} already refunded)")

        # Check order status
        order = order_item.order
        if order.status == order.OrderStatus.CANCELLED:
            return (False, "Cannot refund items from cancelled orders")

        return (True, None)

    @staticmethod
    def validate_payment_refund(payment: Payment) -> Tuple[bool, Optional[str]]:
        """
        Validate if a payment can be refunded.

        Returns:
            Tuple[bool, Optional[str]]: (is_valid, error_message)
        """
        # Check payment status
        if payment.status == Payment.PaymentStatus.UNPAID:
            return (False, "Cannot refund unpaid orders")

        if payment.status == Payment.PaymentStatus.REFUNDED:
            return (False, "Payment already fully refunded")

        # Check if there's a successful transaction
        has_successful = payment.transactions.filter(
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL
        ).exists()

        if not has_successful:
            return (False, "No successful payment transaction found")

        return (True, None)


class ExchangeService:
    """
    Service for handling item exchanges (return items + purchase new items).

    Implements a state machine for exchange workflows:
    1. INITIATED - Exchange session created
    2. REFUND_COMPLETED - Original items refunded
    3. NEW_ORDER_CREATED - New order created and paid
    4. COMPLETED - Exchange finalized
    5. CANCELLED - Exchange cancelled

    Example Usage:
        # Start an exchange
        service = ExchangeService()
        session = service.initiate_exchange(
            original_order=order,
            items_to_return=[(item1, 2), (item2, 1)],
            reason="Size exchange"
        )

        # Create new order with replacement items
        new_order = service.create_new_order(
            session=session,
            new_items=[...],
            customer=customer
        )

        # Calculate balance and complete
        result = service.complete_exchange(session)
    """

    # Exchange session states
    class ExchangeState:
        INITIATED = 'INITIATED'
        REFUND_COMPLETED = 'REFUND_COMPLETED'
        NEW_ORDER_CREATED = 'NEW_ORDER_CREATED'
        COMPLETED = 'COMPLETED'
        CANCELLED = 'CANCELLED'

    @staticmethod
    def initiate_exchange(
        original_order,
        items_to_return: List[Tuple[OrderItem, int]],
        reason: str = '',
        processed_by=None
    ):
        """
        Initiates an exchange session by processing refund for returned items.

        Args:
            original_order: The original Order being returned from
            items_to_return: List of (OrderItem, quantity) tuples to refund
            reason: Reason for the exchange
            processed_by: User processing the exchange

        Returns:
            ExchangeSession object

        Raises:
            ValueError: If validation fails
        """
        from .models import ExchangeSession
        from payments.models import Payment
        from payments.services import PaymentService
        from django.db import transaction

        # Validate that original order has a payment
        if not hasattr(original_order, 'payment_details'):
            raise ValueError("Original order has no payment record")

        original_payment = original_order.payment_details

        # Validate payment can be refunded
        is_valid, error_message = RefundValidator.validate_payment_refund(original_payment)
        if not is_valid:
            raise ValueError(f"Cannot refund original payment: {error_message}")

        # Validate all items to return
        for order_item, quantity in items_to_return:
            is_valid, error_message = RefundValidator.validate_item_refund(order_item, quantity)
            if not is_valid:
                raise ValueError(f"Cannot refund {order_item.product.name}: {error_message}")

        with transaction.atomic():
            # Create exchange session
            session = ExchangeSession.objects.create(
                tenant=original_order.tenant,
                original_order=original_order,
                original_payment=original_payment,
                session_status=ExchangeService.ExchangeState.INITIATED,
                exchange_reason=reason,
                processed_by=processed_by,
            )

            # Process refund for returned items
            payment_service = PaymentService(original_payment)
            refund_result = payment_service.process_item_level_refund(
                order_items_with_quantities=items_to_return,
                reason=f"Exchange: {reason}"
            )

            # Update session with refund details
            session.refund_transaction = refund_result['refund_transaction']
            session.refund_amount = refund_result['total_refunded']
            session.session_status = ExchangeService.ExchangeState.REFUND_COMPLETED
            session.save(update_fields=['refund_transaction', 'refund_amount', 'session_status'])

            return session

    @staticmethod
    def create_new_order(
        session,
        new_items_data: List[dict],
        customer=None,
        order_type='DINE_IN',
        store_location=None
    ):
        """
        Creates a new order with replacement items for the exchange.

        Args:
            session: ExchangeSession object
            new_items_data: List of dicts with item details:
                [
                    {
                        'product_id': 'uuid',
                        'quantity': 2,
                        'modifiers': [...],
                        'notes': 'Extra sauce'
                    },
                    ...
                ]
            customer: Customer for the new order (can be same as original)
            order_type: Type of order (DINE_IN, TAKEOUT, etc.)
            store_location: Store location for the order

        Returns:
            New Order object

        Raises:
            ValueError: If session is not in correct state
        """
        from orders.models import Order
        from orders.services import OrderService
        from django.db import transaction

        # Validate session state
        if session.session_status != ExchangeService.ExchangeState.REFUND_COMPLETED:
            raise ValueError(
                f"Cannot create new order. Session status is {session.session_status}, "
                f"expected {ExchangeService.ExchangeState.REFUND_COMPLETED}"
            )

        # Use original order's customer if not specified
        if customer is None:
            customer = session.original_order.customer

        # Use original order's store location if not specified
        if store_location is None:
            store_location = session.original_order.store_location

        with transaction.atomic():
            # Create new order
            order_service = OrderService()
            new_order = order_service.create_order(
                order_type=order_type,
                cashier=session.processed_by,
                customer=customer,
                store_location=store_location,
                tenant=session.tenant
            )

            # Add items to the new order
            from products.models import Product
            for item_data in new_items_data:
                product = Product.objects.get(id=item_data['product_id'])
                order_service.add_item_to_order(
                    order=new_order,
                    product=product,
                    quantity=item_data['quantity'],
                    selected_modifiers=item_data.get('modifiers', []),
                    notes=item_data.get('notes', '')
                )

            # Refresh order to get updated totals
            new_order.refresh_from_db()

            # Update session with new order
            session.new_order = new_order
            session.new_order_amount = new_order.grand_total
            session.session_status = ExchangeService.ExchangeState.NEW_ORDER_CREATED
            session.save(update_fields=['new_order', 'new_order_amount', 'session_status'])

            return new_order

    @staticmethod
    def calculate_balance(session) -> Decimal:
        """
        Calculates the balance for an exchange session.

        Balance = new_order_amount - refund_amount
        - Positive balance = Customer owes money
        - Negative balance = Customer receives refund
        - Zero balance = Even exchange

        Args:
            session: ExchangeSession object

        Returns:
            Decimal balance amount
        """
        balance = session.new_order_amount - session.refund_amount
        session.balance_due = balance
        session.save(update_fields=['balance_due'])
        return balance

    @staticmethod
    def complete_exchange(
        session,
        payment_method: str = None,
        payment_details: dict = None
    ) -> dict:
        """
        Completes an exchange session by handling payment balance.

        If balance_due > 0: Customer pays the difference
        If balance_due < 0: Customer receives additional refund
        If balance_due == 0: Exchange is complete, no additional payment

        Args:
            session: ExchangeSession object
            payment_method: Method for additional payment (if balance > 0)
            payment_details: Payment details (if balance > 0)

        Returns:
            Dict with:
            {
                'success': bool,
                'balance_due': Decimal,
                'action': 'payment_required' | 'refund_issued' | 'even_exchange',
                'new_payment': Payment (if created),
                'additional_refund': Decimal (if issued)
            }

        Raises:
            ValueError: If session is not in correct state
        """
        from payments.models import Payment
        from payments.services import PaymentService
        from django.db import transaction as db_transaction
        from django.utils import timezone

        # Validate session state
        if session.session_status != ExchangeService.ExchangeState.NEW_ORDER_CREATED:
            raise ValueError(
                f"Cannot complete exchange. Session status is {session.session_status}, "
                f"expected {ExchangeService.ExchangeState.NEW_ORDER_CREATED}"
            )

        # Calculate balance
        balance = ExchangeService.calculate_balance(session)

        with db_transaction.atomic():
            result = {
                'success': True,
                'balance_due': balance,
            }

            if balance > Decimal('0.01'):  # Customer owes money
                # Require payment for the balance
                if not payment_method:
                    raise ValueError(
                        f"Customer owes ${balance}. payment_method is required to complete exchange."
                    )

                # Create payment for new order
                new_payment = Payment.objects.create(
                    tenant=session.tenant,
                    order=session.new_order,
                    total_amount_due=session.new_order_amount,
                    status=Payment.PaymentStatus.PENDING,
                    store_location=session.new_order.store_location
                )

                # Process payment for balance
                payment_service = PaymentService(new_payment)
                # Note: Actual payment processing would happen here
                # For now, we just create the payment record

                session.new_payment = new_payment
                result['action'] = 'payment_required'
                result['new_payment'] = new_payment

            elif balance < Decimal('-0.01'):  # Customer gets refund
                # Issue additional refund
                additional_refund = abs(balance)

                # Process additional refund on original payment
                payment_service = PaymentService(session.original_payment)
                # Note: This would need to refund the difference back to customer
                # For now, we just record it

                result['action'] = 'refund_issued'
                result['additional_refund'] = additional_refund

            else:  # Even exchange
                result['action'] = 'even_exchange'

            # Mark session as completed
            session.session_status = ExchangeService.ExchangeState.COMPLETED
            session.completed_at = timezone.now()
            session.save(update_fields=['session_status', 'completed_at', 'new_payment'])

            return result

    @staticmethod
    def cancel_exchange(session, reason: str = '') -> bool:
        """
        Cancels an exchange session.

        Note: If refund was already processed, it cannot be reversed.
        This only marks the session as cancelled.

        Args:
            session: ExchangeSession object
            reason: Reason for cancellation

        Returns:
            True if cancelled successfully

        Raises:
            ValueError: If session is already completed
        """
        from django.db import transaction

        if session.session_status == ExchangeService.ExchangeState.COMPLETED:
            raise ValueError("Cannot cancel a completed exchange")

        with transaction.atomic():
            # Update session status
            session.session_status = ExchangeService.ExchangeState.CANCELLED
            session.exchange_reason = f"{session.exchange_reason}\nCANCELLED: {reason}"
            session.save(update_fields=['session_status', 'exchange_reason'])

        return True

    @staticmethod
    def get_exchange_summary(session) -> dict:
        """
        Gets a comprehensive summary of an exchange session.

        Args:
            session: ExchangeSession object

        Returns:
            Dict with exchange details
        """
        return {
            'session_id': str(session.id),
            'status': session.session_status,
            'original_order': {
                'order_number': session.original_order.order_number,
                'total': str(session.original_order.grand_total),
            },
            'refund': {
                'amount': str(session.refund_amount),
                'items': list(session.refund_transaction.refunded_items.values(
                    'order_item__product__name',
                    'quantity_refunded',
                    'total_refund_amount'
                )) if session.refund_transaction else []
            },
            'new_order': {
                'order_number': session.new_order.order_number if session.new_order else None,
                'total': str(session.new_order_amount),
            } if session.new_order else None,
            'balance': {
                'due': str(session.balance_due),
                'description': (
                    'Customer owes' if session.balance_due > 0
                    else 'Customer receives' if session.balance_due < 0
                    else 'Even exchange'
                )
            },
            'processed_by': session.processed_by.email if session.processed_by else None,
            'created_at': session.created_at.isoformat(),
            'completed_at': session.completed_at.isoformat() if session.completed_at else None,
        }
