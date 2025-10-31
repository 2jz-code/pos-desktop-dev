from decimal import Decimal
from django.db import transaction, models
from django.db.models import Sum
from django.utils import timezone
from .models import (
    Payment,
    PaymentTransaction,
)
from orders.models import Order
from .factories import PaymentStrategyFactory
from .strategies import TerminalPaymentStrategy
from django.shortcuts import get_object_or_404
import stripe
import uuid
from .signals import payment_completed
import logging

# Import the money precision helpers
from .money import to_minor, from_minor, quantize

logger = logging.getLogger(__name__)


class PaymentService:
    """
    Payment Service with formal state transition management.
    This service centralizes all payment state transitions and validates them.
    """

    # State transition map - defines valid transitions for Payment.PaymentStatus
    VALID_TRANSITIONS = {
        Payment.PaymentStatus.UNPAID: [
            Payment.PaymentStatus.PENDING,
            Payment.PaymentStatus.PARTIALLY_PAID,
            Payment.PaymentStatus.PAID,
        ],
        Payment.PaymentStatus.PENDING: [
            Payment.PaymentStatus.UNPAID,
            Payment.PaymentStatus.PARTIALLY_PAID,
            Payment.PaymentStatus.PAID,
        ],
        Payment.PaymentStatus.PARTIALLY_PAID: [
            Payment.PaymentStatus.PENDING,  # Allow going back to PENDING for split payments
            Payment.PaymentStatus.PAID,
            Payment.PaymentStatus.PARTIALLY_REFUNDED,
            Payment.PaymentStatus.REFUNDED,
        ],
        Payment.PaymentStatus.PAID: [
            Payment.PaymentStatus.PARTIALLY_REFUNDED,
            Payment.PaymentStatus.REFUNDED,
        ],
        Payment.PaymentStatus.PARTIALLY_REFUNDED: [
            Payment.PaymentStatus.REFUNDED,
        ],
        Payment.PaymentStatus.REFUNDED: [],  # Terminal state
    }

    def __init__(self, payment: Payment):
        """
        Initializes the service with a specific payment record.
        This pattern is used for operations on an *existing* payment, like a refund.
        """
        self.payment = payment

    @staticmethod
    def _validate_transition(current_status: str, target_status: str) -> bool:
        """
        Validates if a state transition is allowed.

        Args:
            current_status: Current payment status
            target_status: Target payment status

        Returns:
            True if transition is valid, False otherwise
        """
        valid_targets = PaymentService.VALID_TRANSITIONS.get(current_status, [])
        return target_status in valid_targets

    @staticmethod
    def _transition_payment_status(
        payment: Payment, target_status: str, force: bool = False
    ) -> Payment:
        """
        Safely transitions a payment to a new status with validation.

        Args:
            payment: Payment object to transition
            target_status: Target status to transition to
            force: If True, skip validation (use with caution)

        Returns:
            Updated payment object

        Raises:
            ValueError: If transition is invalid
        """
        if not force and not PaymentService._validate_transition(
            payment.status, target_status
        ):
            raise ValueError(
                f"Invalid state transition from {payment.status} to {target_status}. "
                f"Valid transitions from {payment.status}: {PaymentService.VALID_TRANSITIONS.get(payment.status, [])}"
            )

        old_status = payment.status
        payment.status = target_status
        payment.save(update_fields=["status", "updated_at"])

        logger.info(
            f"Payment {payment.id}: Status transition {old_status} -> {target_status}"
        )
        return payment

    @staticmethod
    @transaction.atomic
    def initiate_payment_attempt(order: Order, **kwargs) -> Payment:
        """
        Initiates a payment attempt for an order. Gets or creates the Payment object
        and transitions its status from UNPAID to PENDING.

        Args:
            order: Order to initiate payment for
            **kwargs: Additional payment initialization data

        Returns:
            Payment object in PENDING status

        Raises:
            ValueError: If payment status is not UNPAID
        """
        payment, created = Payment.objects.get_or_create(
            order=order,
            defaults={
                "total_amount_due": order.grand_total,
                "status": Payment.PaymentStatus.UNPAID,
                "tenant": order.tenant,
                "store_location": order.store_location,  # Denormalize from order for fast location queries
            },
        )

        # If the order total has changed since the payment was initiated, update it.
        if not created and payment.total_amount_due != order.grand_total:
            payment.total_amount_due = order.grand_total
            payment.save(update_fields=["total_amount_due"])

        # Only transition to PENDING if currently UNPAID
        if payment.status in [
            Payment.PaymentStatus.UNPAID,
            Payment.PaymentStatus.PARTIALLY_PAID,
        ]:
            PaymentService._transition_payment_status(payment, "PENDING")
        elif payment.status != Payment.PaymentStatus.PENDING:
            raise ValueError(
                f"Cannot initiate payment attempt. Payment status is {payment.status}, expected UNPAID or PARTIALLY_PAID"
            )

        return payment

    @staticmethod
    @transaction.atomic
    def confirm_successful_transaction(
        transaction: PaymentTransaction, **kwargs
    ) -> Payment:
        """
        Confirms a successful transaction and updates the parent Payment status.
        This method is idempotent and safe to call multiple times for the same transaction.

        Args:
            transaction: PaymentTransaction that succeeded
            **kwargs: Additional data for the confirmation

        Returns:
            Updated Payment object
        """
        # CRITICAL FIX: Lock the payment FIRST to prevent race conditions between
        # frontend capture and webhook processing
        payment = Payment.objects.select_for_update().get(id=transaction.payment_id)
        # CRITICAL FIX: Lock the payment FIRST to prevent race conditions between
        # frontend capture and webhook processing
        payment = Payment.objects.select_for_update().get(id=transaction.payment_id)

        # Idempotency Check AFTER locking: If payment is already PAID, skip all processing
        # This handles the race condition where webhook arrives immediately after frontend capture
        # Idempotency Check AFTER locking: If payment is already PAID, skip all processing
        # This handles the race condition where webhook arrives immediately after frontend capture
        if payment.status == Payment.PaymentStatus.PAID:
            logger.info(
                f"Payment {payment.id} is already marked as PAID. "
                f"Skipping confirmation for transaction {transaction.id} (likely webhook arrived after frontend capture)."
            )
            # Ensure transaction is marked successful even if payment was already settled
            if transaction.status != PaymentTransaction.TransactionStatus.SUCCESSFUL:
                transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
                transaction.save(update_fields=["status"])
            logger.info(
                f"Payment {payment.id} is already marked as PAID. "
                f"Skipping confirmation for transaction {transaction.id} (likely webhook arrived after frontend capture)."
            )
            # Ensure transaction is marked successful even if payment was already settled
            if transaction.status != PaymentTransaction.TransactionStatus.SUCCESSFUL:
                transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
                transaction.save(update_fields=["status"])
            return payment

        # Check transaction status - if already successful, this might be a retry
        if transaction.status == PaymentTransaction.TransactionStatus.SUCCESSFUL:
            logger.info(
                f"Transaction {transaction.id} already marked as SUCCESSFUL. "
                f"Recalculating payment {payment.id} to ensure consistency."
            )
        else:
            # Mark the transaction as successful
            transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
            transaction.save(update_fields=["status"])
        # Check transaction status - if already successful, this might be a retry
        if transaction.status == PaymentTransaction.TransactionStatus.SUCCESSFUL:
            logger.info(
                f"Transaction {transaction.id} already marked as SUCCESSFUL. "
                f"Recalculating payment {payment.id} to ensure consistency."
            )
        else:
            # Mark the transaction as successful
            transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
            transaction.save(update_fields=["status"])

        # Recalculate amounts
        updated_payment = PaymentService._recalculate_payment_amounts(payment)

        # Determine new status based on amounts - ONLY transition if status actually needs to change
        # Determine new status based on amounts - ONLY transition if status actually needs to change
        if updated_payment.amount_paid >= updated_payment.total_amount_due:
            # Check if already PAID to avoid invalid transition
            if updated_payment.status != Payment.PaymentStatus.PAID:
                PaymentService._transition_payment_status(updated_payment, "PAID")
                PaymentService._handle_payment_completion(updated_payment)
            else:
                logger.info(
                    f"Payment {payment.id} already in PAID status. No transition needed."
                )
            # Check if already PAID to avoid invalid transition
            if updated_payment.status != Payment.PaymentStatus.PAID:
                PaymentService._transition_payment_status(updated_payment, "PAID")
                PaymentService._handle_payment_completion(updated_payment)
            else:
                logger.info(
                    f"Payment {payment.id} already in PAID status. No transition needed."
                )
        elif updated_payment.amount_paid > 0:
            # Only transition if not already partially paid
            if updated_payment.status != Payment.PaymentStatus.PARTIALLY_PAID:
                PaymentService._transition_payment_status(
                    updated_payment, "PARTIALLY_PAID"
                )
            # Only transition if not already partially paid
            if updated_payment.status != Payment.PaymentStatus.PARTIALLY_PAID:
                PaymentService._transition_payment_status(
                    updated_payment, "PARTIALLY_PAID"
                )

        return updated_payment

    @staticmethod
    @transaction.atomic
    def record_failed_transaction(transaction: PaymentTransaction, **kwargs) -> Payment:
        """
        Records a failed transaction and updates the parent Payment status accordingly.
        If no successful payments exist, status returns to UNPAID.

        Args:
            transaction: PaymentTransaction that failed
            **kwargs: Additional data for the failure

        Returns:
            Updated Payment object
        """
        # Mark the transaction as failed
        transaction.status = PaymentTransaction.TransactionStatus.FAILED
        transaction.save(update_fields=["status"])

        payment = transaction.payment
        payment = Payment.objects.select_for_update().get(id=payment.id)

        # Recalculate amounts
        updated_payment = PaymentService._recalculate_payment_amounts(payment)

        # Determine new status based on remaining successful payments
        if updated_payment.amount_paid >= updated_payment.total_amount_due:
            PaymentService._transition_payment_status(updated_payment, "PAID")
        elif updated_payment.amount_paid > 0:
            PaymentService._transition_payment_status(updated_payment, "PARTIALLY_PAID")
        else:
            PaymentService._transition_payment_status(updated_payment, "UNPAID")

        return updated_payment

    @staticmethod
    @transaction.atomic
    def cancel_payment_process(payment: Payment, **kwargs) -> Payment:
        """
        Explicitly handles payment process cancellation.
        Cancels all pending transactions and resets payment status.

        Args:
            payment: Payment to cancel
            **kwargs: Additional cancellation data

        Returns:
            Updated Payment object
        """
        # Cancel all pending transactions
        pending_transactions = payment.transactions.filter(
            status=PaymentTransaction.TransactionStatus.PENDING
        )

        for transaction in pending_transactions:
            transaction.status = PaymentTransaction.TransactionStatus.CANCELED
            transaction.save(update_fields=["status"])

        # Recalculate amounts after cancellation
        updated_payment = PaymentService._recalculate_payment_amounts(payment)

        # Determine new status based on remaining successful payments
        if updated_payment.amount_paid >= updated_payment.total_amount_due:
            PaymentService._transition_payment_status(updated_payment, "PAID")
        elif updated_payment.amount_paid > 0:
            PaymentService._transition_payment_status(updated_payment, "PARTIALLY_PAID")
        else:
            PaymentService._transition_payment_status(updated_payment, "UNPAID")

        return updated_payment

    @staticmethod
    def _recalculate_payment_amounts(payment: Payment) -> Payment:
        """
        Recalculates gross paid and total refunded amounts for a payment.
        This replaces the old _update_payment_status method with just the calculation logic.

        Args:
            payment: Payment to recalculate

        Returns:
            Payment with updated amounts
        """
        payment.refresh_from_db()

        # Calculate the gross amount paid from all transactions that were once successful.
        paid_transactions = payment.transactions.filter(
            status__in=[
                PaymentTransaction.TransactionStatus.SUCCESSFUL,
                PaymentTransaction.TransactionStatus.REFUNDED,
            ]
        )
        total_paid_gross = paid_transactions.aggregate(total=Sum("amount"))[
            "total"
        ] or Decimal("0.00")

        # Calculate the total refunded amount on-the-fly from all associated transactions.
        total_refunded = payment.transactions.aggregate(total=Sum("refunded_amount"))[
            "total"
        ] or Decimal("0.00")

        # Update the amount_paid field to the GROSS total
        payment.amount_paid = total_paid_gross
        payment.save(update_fields=["amount_paid", "updated_at"])

        return payment

    @staticmethod
    def _handle_payment_completion(payment: Payment):
        """
        Handles business logic when a payment is completed.
        Updates order status and schedules async post-completion tasks.

        CRITICAL: This method is called within a database transaction.
        Heavy operations (inventory, emails) are deferred until AFTER transaction commits.
        Updates order status and schedules async post-completion tasks.

        CRITICAL: This method is called within a database transaction.
        Heavy operations (inventory, emails) are deferred until AFTER transaction commits.

        Args:
            payment: Completed payment
        """
        order = payment.order
        if order.status != Order.OrderStatus.COMPLETED:
            order.status = Order.OrderStatus.COMPLETED
            order.save(update_fields=["status"])

        # PERFORMANCE FIX: Defer signal emission until AFTER transaction commits
        # This prevents inventory processing and email sending from blocking the payment transaction
        # Using transaction.on_commit ensures signals only fire if the payment successfully commits
        from django.db import transaction as db_transaction

        def emit_payment_signals():
            """Deferred signal emission - runs after transaction commits"""
            try:
                # Emit payment_completed signal for event-driven architecture
                payment_completed.send(
                    sender=PaymentService, payment=payment, order=order
                )
                logger.info(
                    f"Payment completion signals emitted for payment {payment.id}"
                )
            except Exception as e:
                # Log but don't raise - payment is already committed
                logger.error(
                    f"Error in post-payment signal handlers for payment {payment.id}: {e}"
                )

        db_transaction.on_commit(emit_payment_signals)
        # PERFORMANCE FIX: Defer signal emission until AFTER transaction commits
        # This prevents inventory processing and email sending from blocking the payment transaction
        # Using transaction.on_commit ensures signals only fire if the payment successfully commits
        from django.db import transaction as db_transaction

        def emit_payment_signals():
            """Deferred signal emission - runs after transaction commits"""
            try:
                # Emit payment_completed signal for event-driven architecture
                payment_completed.send(
                    sender=PaymentService, payment=payment, order=order
                )
                logger.info(
                    f"Payment completion signals emitted for payment {payment.id}"
                )
            except Exception as e:
                # Log but don't raise - payment is already committed
                logger.error(
                    f"Error in post-payment signal handlers for payment {payment.id}: {e}"
                )

        db_transaction.on_commit(emit_payment_signals)

    # === LEGACY METHODS - TO BE DEPRECATED ===
    # These methods are kept for backward compatibility during transition

    @staticmethod
    @transaction.atomic
    def get_or_create_payment(order: Order) -> Payment:
        """
        LEGACY: Use initiate_payment_attempt instead.
        Retrieves the existing payment object for an order, or creates a new one
        if it doesn't exist.
        """
        payment, created = Payment.objects.get_or_create(
            order=order,
            defaults={
                "total_amount_due": order.grand_total,
                "tenant": order.tenant,
                "store_location": order.store_location,  # Denormalize from order for fast location queries
            },
        )
        # If the order total has changed since the payment was initiated, update it.
        if not created and payment.total_amount_due != order.grand_total:
            payment.total_amount_due = order.grand_total
            payment.save()

        return payment

    @staticmethod
    def _update_payment_status(payment: Payment) -> Payment:
        """
        LEGACY: This method is deprecated. Use explicit state transition methods instead.
        Recalculates gross paid and total refunded amounts, then updates the
        payment status accordingly.
        """
        payment = PaymentService._recalculate_payment_amounts(payment)

        # Calculate the total refunded amount
        total_refunded = payment.transactions.aggregate(total=Sum("refunded_amount"))[
            "total"
        ] or Decimal("0.00")

        # Determine the correct status based on gross paid and total refunded
        target_status = None
        if total_refunded > 0:
            if total_refunded >= payment.amount_paid:
                target_status = "REFUNDED"
            else:
                target_status = "PARTIALLY_REFUNDED"
        elif payment.amount_paid >= payment.total_amount_due:
            target_status = "PAID"
        elif payment.amount_paid > 0:
            target_status = "PARTIALLY_PAID"
        else:
            target_status = "UNPAID"

        # Apply transition if status changed
        if target_status and payment.status != target_status:
            # Use force=True to maintain backward compatibility
            PaymentService._transition_payment_status(
                payment, target_status, force=True
            )

            # Handle completion if needed
            if target_status == Payment.PaymentStatus.PAID:
                PaymentService._handle_payment_completion(payment)
                # Note: _handle_payment_completion now defers signals via transaction.on_commit
                # Note: _handle_payment_completion now defers signals via transaction.on_commit

        return payment

    @staticmethod
    @transaction.atomic
    def initiate_terminal_payment(
        cls, order: Order, amount: Decimal
    ) -> PaymentTransaction:
        """
        Initiates a terminal payment by using the centrally configured provider.
        """
        from settings.config import app_settings

        provider = app_settings.active_terminal_provider
        return cls.process_transaction(
            order=order,
            method=PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            amount=amount,
            provider=provider,
        )

    @staticmethod
    @transaction.atomic
    def process_transaction(
        order: Order,
        method: str,
        amount: Decimal,
        provider: str | None = None,
        **kwargs,
    ) -> Payment:
        """
        The main entry point for processing a payment. It creates a transaction,
        selects a strategy, executes it, and updates the overall payment status.
        The full, updated Payment object is returned.

        Uses savepoints to preserve FAILED transaction records for audit trail
        while rolling back any partial changes from failed payment strategies.
        """
        # CRITICAL: Validate order has items before processing payment
        if not order.items.exists():
            raise ValueError("Cannot process payment for an empty order with no items")

        payment = PaymentService.get_or_create_payment(order)
        # Lock the payment row for the duration of this transaction
        payment = Payment.objects.select_for_update().get(id=payment.id)

        # CRITICAL FIX: Prevent duplicate payment processing (race condition protection)
        # If payment is already PAID, reject duplicate attempts (e.g., double-click on pay button)
        if (
            payment.status == Payment.PaymentStatus.PAID
            and payment.amount_paid >= payment.total_amount_due
        ):
            logger.warning(
                f"Payment {payment.id} is already PAID (${payment.amount_paid}). "
                f"Rejecting duplicate payment attempt for ${amount}."
            )
            raise ValueError(
                f"Payment for order {order.order_number} is already completed. "
                f"Cannot process duplicate payment."
            )

        surcharge = Decimal("0.00")
        if method in [
            PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            PaymentTransaction.PaymentMethod.CARD_ONLINE,
        ]:
            # Use centralized surcharge calculation with banker's rounding
            surcharge = PaymentService.calculate_surcharge(amount)

        # Extract tip from kwargs if provided
        tip = kwargs.get("tip", Decimal("0.00"))
        if tip and not isinstance(tip, Decimal):
            tip = Decimal(str(tip))

        payment_transaction = PaymentTransaction.objects.create(
            payment=payment,
            amount=amount,
            method=method,
            surcharge=surcharge,
            tip=tip,
            tenant=payment.tenant,
        )

        # AUDIT TRAIL FIX: Use savepoint to preserve failed transaction records
        # Savepoint allows partial rollback while keeping the transaction record for audit
        sid = transaction.savepoint()
        try:
            strategy = PaymentStrategyFactory.get_strategy(method, provider=provider)
            strategy.process(payment_transaction, **kwargs)

            # Strategy succeeded - commit the savepoint and update payment status
            transaction.savepoint_commit(sid)
            updated_payment = PaymentService._update_payment_status(payment)
            return updated_payment

        except Exception as e:
            # Payment strategy failed - rollback any changes made by the strategy
            transaction.savepoint_rollback(sid)

            # Now mark the transaction as FAILED (this will be committed with the outer transaction)
            payment_transaction.status = PaymentTransaction.TransactionStatus.FAILED
            payment_transaction.provider_response = {
                "error": str(e),
                "error_type": type(e).__name__,
                "timestamp": timezone.now().isoformat(),
                "method": method,
                "provider": provider,
            }
            payment_transaction.save(update_fields=["status", "provider_response"])

            logger.error(
                f"Payment transaction {payment_transaction.id} FAILED for order {order.order_number}. "
                f"Method: {method}, Error: {str(e)}"
            )

            # Update payment status (will go back to UNPAID if no successful transactions exist)
            updated_payment = PaymentService._update_payment_status(payment)

            # DON'T re-raise - return payment with UNPAID status and FAILED transaction for audit
            # Caller should check payment.status to see if payment succeeded
            # This preserves the audit trail while allowing normal control flow
            return updated_payment

    @staticmethod
    def _get_active_terminal_strategy() -> TerminalPaymentStrategy:
        """
        A helper method to retrieve the currently active terminal strategy instance.
        """
        # Use the centralized configuration instead of direct database queries
        from settings.config import app_settings

        provider = app_settings.active_terminal_provider
        strategy = PaymentStrategyFactory.get_strategy(
            method="CARD_TERMINAL", provider=provider
        )
        if not isinstance(strategy, TerminalPaymentStrategy):
            raise TypeError(
                "The configured provider is not a valid TerminalPaymentStrategy."
            )

        return strategy

    @classmethod
    def create_terminal_connection_token(cls, location_id=None) -> str:
        """
        Creates a connection token for the active terminal provider.
        """
        strategy = cls._get_active_terminal_strategy()
        # Pass the location_id down to the strategy method.
        return strategy.create_connection_token(location_id=location_id)

    @staticmethod
    @transaction.atomic
    def create_terminal_payment_intent(order: Order, amount: Decimal, tip: Decimal):
        """
        Creates a payment intent for a terminal transaction.
        The surcharge is now calculated on the backend to prevent double-counting.
        """
        active_strategy = PaymentService._get_active_terminal_strategy()

        payment = PaymentService.initiate_payment_attempt(order=order)

        # Calculate surcharge on the backend based on the base amount of the transaction.
        surcharge = PaymentService.calculate_surcharge(amount)

        # The strategy is responsible for creating the transaction and handling the tip
        return active_strategy.create_payment_intent(
            payment=payment, amount=amount, tip=tip, surcharge=surcharge
        )

    @classmethod
    @transaction.atomic  # Add atomic transaction for safety
    def capture_terminal_payment(cls, payment_intent_id: str):
        """
        Captures a specific terminal payment intent and returns the
        updated parent Payment object for immediate UI feedback.
        """
        strategy = cls._get_active_terminal_strategy()
        try:
            # Find the transaction corresponding to this payment intent
            transaction = PaymentTransaction.objects.select_related("payment").get(
                transaction_id=payment_intent_id
            )

            # Capture the payment with the provider (e.g., Stripe)
            strategy.capture_payment(transaction)

            # Synchronously update our local state for immediate feedback.
            # The webhook can serve as a later reconciliation if needed.
            transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
            transaction.save()

            # Recalculate the totals and status of the parent Payment object
            updated_payment = cls._update_payment_status(transaction.payment)

            return updated_payment  # Return the full, updated payment object

        except PaymentTransaction.DoesNotExist:
            raise ValueError(
                f"No transaction found for payment_intent_id: {payment_intent_id}"
            )

    @classmethod
    def cancel_terminal_action(cls, reader_id: str):
        """
        Cancels an action on a specific terminal reader.
        """
        strategy = cls._get_active_terminal_strategy()
        return strategy.cancel_action(reader_id=reader_id)

    @staticmethod
    def cancel_payment_intent(payment_intent_id: str):
        """
        Cancels a Stripe Payment Intent and synchronously updates the local
        transaction state.
        """
        if not payment_intent_id or not payment_intent_id.startswith("pi_"):
            raise ValueError("A valid payment_intent_id is required.")

        try:
            # First, update the local transaction record to prevent race conditions.
            transaction = get_object_or_404(
                PaymentTransaction, transaction_id=payment_intent_id
            )

            # If it's already been handled by a webhook, don't try to cancel again.
            if transaction.status != PaymentTransaction.TransactionStatus.PENDING:
                return {
                    "status": transaction.get_status_display(),
                    "message": "Transaction already finalized.",
                }

            # Now, attempt to cancel on Stripe's end.
            intent = stripe.PaymentIntent.cancel(payment_intent_id)

            # If successful, update our local record.
            transaction.status = PaymentTransaction.TransactionStatus.CANCELED
            transaction.save()

            # Update the aggregate payment status
            PaymentService._update_payment_status(transaction.payment)

            return intent
        except PaymentTransaction.DoesNotExist:
            raise ValueError(
                f"No transaction found for payment_intent_id: {payment_intent_id}"
            )
        except stripe.error.InvalidRequestError as e:
            # Handle cases where the intent cannot be canceled (e.g., already processed)
            raise ValueError(f"Could not cancel payment intent: {str(e)}")

    @staticmethod
    @transaction.atomic
    def complete_payment(payment_intent_id: str, tip=None):
        """
        Finalizes a payment after it has been confirmed by a webhook.
        This updates the transaction, payment, and order statuses.
        Optionally includes a tip amount in the transaction.

        DEPRECATED: Use confirm_successful_transaction instead for consistent
        idempotency handling and deferred signal processing.

        DEPRECATED: Use confirm_successful_transaction instead for consistent
        idempotency handling and deferred signal processing.
        """
        from decimal import Decimal

        transaction = get_object_or_404(
            PaymentTransaction.objects.select_related("payment__order"),
            transaction_id=payment_intent_id,
        )

        # Mark transaction as successful and add tip if provided
        transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
        # Only update tip if one wasn't already set (for backward compatibility)
        if tip and tip > 0 and transaction.tip == Decimal("0.00"):
            transaction.tip = Decimal(str(tip))
            transaction.save(update_fields=["status", "tip"])
        else:
            transaction.save(update_fields=["status"])

        # Get the payment and recalculate amounts
        payment = transaction.payment
        payment = PaymentService._recalculate_payment_amounts(payment)

        # Determine and set the correct payment status
        if payment.amount_paid >= payment.total_amount_due:
            payment.status = Payment.PaymentStatus.PAID
            payment.save(update_fields=["status"])

            # Update order status to completed
            order = payment.order
            order.status = Order.OrderStatus.COMPLETED
            order.save(update_fields=["status"])

            # Handle payment completion (signals, etc.)
            # Note: _handle_payment_completion now defers heavy operations via transaction.on_commit
            # Note: _handle_payment_completion now defers heavy operations via transaction.on_commit
            PaymentService._handle_payment_completion(payment)
        elif payment.amount_paid > 0:
            payment.status = Payment.PaymentStatus.PARTIALLY_PAID
            payment.save(update_fields=["status"])

        return payment

    @transaction.atomic
    def record_internal_refund(self, amount_to_refund: Decimal) -> Payment:
        """
        Records an internal refund for the associated payment.
        This does NOT interact with external payment providers.
        """
        if amount_to_refund <= 0:
            raise ValueError("Refund amount must be positive.")

        if amount_to_refund > self.payment.amount_paid:
            raise ValueError("Cannot refund more than the amount paid.")

        # Create a new transaction to represent the internal refund
        PaymentTransaction.objects.create(
            payment=self.payment,
            amount=-amount_to_refund,  # Negative amount for refund
            method=(
                self.payment.transactions.last().method
                if self.payment.transactions.last()
                else PaymentTransaction.PaymentMethod.CASH
            ),  # Use the last payment method for context
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL,  # Internal record is successful
            # No transaction_id or provider_response as it's internal
            refund_reason=f"Internal refund of {amount_to_refund}",
            refunded_amount=amount_to_refund,  # Mark this new transaction as refunded this amount
            tenant=self.payment.tenant,
        )

        # Update payment status to reflect refund (uses legacy method for backward compatibility)
        PaymentService._update_payment_status(self.payment)
        return self.payment

    @transaction.atomic
    def process_item_level_refund(
        self,
        order_items_with_quantities: list[tuple],
        reason: str | None = None,
        transaction_id: uuid.UUID | None = None,
    ) -> dict:
        """
        Process a refund for specific order items using RefundCalculator.

        This is the recommended high-level method for processing refunds.
        It handles the full refund flow:
        1. Validates the refund using RefundValidator
        2. Calculates refund amounts using RefundCalculator
        3. Processes the refund via payment provider
        4. Creates RefundItem and RefundAuditLog records

        Args:
            order_items_with_quantities: List of (OrderItem, quantity) tuples
            reason: Optional reason for the refund
            transaction_id: Optional specific transaction to refund from

        Returns:
            Dict containing:
            {
                'success': bool,
                'refund_transaction': PaymentTransaction,
                'refund_items': List[RefundItem],
                'audit_log': RefundAuditLog,
                'total_refunded': Decimal
            }

        Raises:
            ValueError: If validation fails
        """
        from refunds.services import RefundCalculator, RefundValidator
        from refunds.models import RefundItem, RefundAuditLog

        # Validate all items first
        for order_item, quantity in order_items_with_quantities:
            is_valid, error_message = RefundValidator.validate_item_refund(order_item, quantity)
            if not is_valid:
                raise ValueError(f"Validation failed for {order_item.product.name}: {error_message}")

        # Validate payment
        is_valid, error_message = RefundValidator.validate_payment_refund(self.payment)
        if not is_valid:
            raise ValueError(f"Payment validation failed: {error_message}")

        # Calculate refund using RefundCalculator
        calculator = RefundCalculator(self.payment)
        refund_calculation = calculator.calculate_multiple_items_refund(order_items_with_quantities)
        total_refund_amount = refund_calculation['grand_total']

        # Get the transaction to refund from
        if transaction_id:
            refund_from_transaction = get_object_or_404(
                PaymentTransaction,
                id=transaction_id,
                payment=self.payment
            )
        else:
            refund_from_transaction = self.payment.transactions.filter(
                status=PaymentTransaction.TransactionStatus.SUCCESSFUL
            ).order_by('-created_at').first()

        if not refund_from_transaction:
            raise ValueError("No successful transaction found to refund")

        # Create audit log (initiated)
        audit_log = RefundAuditLog.objects.create(
            tenant=self.payment.tenant,
            payment=self.payment,
            payment_transaction=None,  # Will be set after refund
            action='item_refund_initiated',
            source='SERVICE',
            refund_amount=total_refund_amount,
            reason=reason or '',
            initiated_by=None,  # Can be set by caller if available
            status='pending',
        )

        try:
            # Process refund via provider
            refunded_transaction = self.refund_transaction_with_provider(
                transaction_id=refund_from_transaction.id,
                amount_to_refund=total_refund_amount,
                reason=reason
            )

            # Create RefundItem records for each item
            refund_items = []
            for item_data in refund_calculation['items']:
                refund_item = RefundItem.objects.create(
                    tenant=self.payment.tenant,
                    payment_transaction=refunded_transaction,
                    order_item=item_data['order_item'],
                    quantity_refunded=item_data['quantity'],
                    amount_per_unit=item_data['order_item'].price_at_sale,
                    total_refund_amount=item_data['subtotal'],
                    tax_refunded=item_data['tax'],
                    tip_refunded=item_data['tip'],
                    surcharge_refunded=item_data['surcharge'],
                    refund_reason=reason or '',
                )
                refund_items.append(refund_item)

            # Update audit log (success)
            audit_log.payment_transaction = refunded_transaction
            audit_log.status = 'success'
            audit_log.save(update_fields=['payment_transaction', 'status'])

            return {
                'success': True,
                'refund_transaction': refunded_transaction,
                'refund_items': refund_items,
                'audit_log': audit_log,
                'total_refunded': total_refund_amount,
            }

        except Exception as e:
            # Update audit log (failed)
            audit_log.status = 'failed'
            audit_log.error_message = str(e)
            audit_log.save(update_fields=['status', 'error_message'])
            raise

    @transaction.atomic
    def process_full_order_refund(
        self,
        reason: str | None = None,
        transaction_id: uuid.UUID | None = None,
    ) -> dict:
        """
        Process a full refund for the entire order.

        This is a convenience method that refunds all items in the order.
        It uses process_item_level_refund() internally.

        Args:
            reason: Optional reason for the refund
            transaction_id: Optional specific transaction to refund from

        Returns:
            Same as process_item_level_refund()

        Raises:
            ValueError: If validation fails
        """
        # Build list of all items with full quantities
        order_items_with_quantities = [
            (item, item.quantity) for item in self.payment.order.items.all()
        ]

        if not order_items_with_quantities:
            raise ValueError("Order has no items to refund")

        # Use the item-level refund method
        return self.process_item_level_refund(
            order_items_with_quantities=order_items_with_quantities,
            reason=reason,
            transaction_id=transaction_id
        )

    @transaction.atomic
    def refund_transaction_with_provider(
        self,
        transaction_id: uuid.UUID,
        amount_to_refund: Decimal,
        reason: str | None = None,
    ) -> PaymentTransaction:
        """
        Initiates a refund for a specific PaymentTransaction via its associated provider.
        This method now only triggers the external API call and relies on a webhook
        for database updates.
        """
        if amount_to_refund <= 0:
            raise ValueError("Refund amount must be positive.")

        original_transaction = get_object_or_404(
            PaymentTransaction.objects.select_related("payment"), id=transaction_id
        )

        # Validation: Check against total transaction amount (amount + tip + surcharge)
        total_transaction_amount = (
            original_transaction.amount +
            original_transaction.tip +
            original_transaction.surcharge
        )

        if (original_transaction.refunded_amount + amount_to_refund) > total_transaction_amount:
            raise ValueError(
                f"Cannot refund ${amount_to_refund}. "
                f"Total transaction: ${total_transaction_amount}, "
                f"Already refunded: ${original_transaction.refunded_amount}, "
                f"Remaining: ${total_transaction_amount - original_transaction.refunded_amount}"
            )

        # Get the strategy
        provider_setting = None
        if (
            original_transaction.method
            == PaymentTransaction.PaymentMethod.CARD_TERMINAL
        ):
            # Use the centralized configuration instead of direct database queries
            from settings.config import app_settings

            provider_setting = app_settings.active_terminal_provider

        strategy = PaymentStrategyFactory.get_strategy(
            original_transaction.method, provider=provider_setting
        )

        # --- CHANGE: Call the strategy but DO NOT update the database here ---
        strategy.refund_transaction(original_transaction, amount_to_refund, reason)

        # For cash transactions, update payment status immediately since there are no webhooks
        if original_transaction.method == PaymentTransaction.PaymentMethod.CASH:
            PaymentService._update_payment_status(original_transaction.payment)

        # The method now returns the original transaction. The UI will have to wait
        # for the webhook to deliver the updated state (except for cash which is updated above).
        return original_transaction

    @staticmethod
    @transaction.atomic
    def create_online_payment_intent(
        order: Order, amount: Decimal, currency: str, user, tip: Decimal = None
    ) -> dict:
        """
        Creates a Stripe Payment Intent for an online payment for an authenticated user.
        Includes surcharge calculation for card payments and optional tip.
        """
        # Convert tip to Decimal if provided
        tip_decimal = tip if tip else Decimal("0.00")

        # Calculate surcharge for online card payments
        surcharge = PaymentService.calculate_surcharge(amount)
        total_amount_with_surcharge_and_tip = amount + tip_decimal + surcharge

        # Use the existing service method to get or create the payment record
        payment = PaymentService.get_or_create_payment(order)

        # The total_amount_due should be the base amount (without surcharge)
        # Surcharges are tracked separately in the transaction
        if payment.total_amount_due != amount:
            payment.total_amount_due = amount
            payment.save(update_fields=["total_amount_due"])

        # Build the intent data for Stripe
        from django.conf import settings

        stripe.api_key = settings.STRIPE_SECRET_KEY

        user_name = f"{user.first_name} {user.last_name}".strip() or user.username
        description = f"Order payment for {user_name}"

        intent_data = {
            "amount": int(
                total_amount_with_surcharge_and_tip * 100
            ),  # Convert to cents
            "currency": currency,
            "automatic_payment_methods": {"enabled": True},
            "description": description,
            "receipt_email": user.email,
            "metadata": {
                "order_id": str(order.id),
                "payment_id": str(payment.id),
                "customer_type": "authenticated",
                "user_id": str(user.id),
            },
        }

        # Create the payment intent with Stripe
        intent = stripe.PaymentIntent.create(**intent_data)

        # Create a local, pending transaction record
        PaymentTransaction.objects.create(
            payment=payment,
            amount=amount,
            tip=tip_decimal,
            surcharge=surcharge,
            method=PaymentTransaction.PaymentMethod.CARD_ONLINE,
            status=PaymentTransaction.TransactionStatus.PENDING,
            transaction_id=intent.id,
            tenant=payment.tenant,
        )

        # Return the necessary details to the view
        return {
            "client_secret": intent.client_secret,
            "payment_intent_id": intent.id,
            "payment_id": str(payment.id),
            "tip": tip_decimal,
            "surcharge": surcharge,
            "total_with_surcharge_and_tip": total_amount_with_surcharge_and_tip,
        }

    @staticmethod
    def calculate_surcharge(amount: Decimal, currency: str = "USD") -> Decimal:
        """
        Calculates the surcharge for a given amount based on the current settings.
        Uses minor-unit arithmetic for precision (banker's rounding).

        Args:
            amount: Base amount to calculate surcharge on
            currency: ISO 4217 currency code (default: USD)

        Returns:
            Surcharge amount quantized to currency precision
        """
        from settings.config import app_settings

        # Ensure both operands are Decimal to avoid float/Decimal TypeError
        amount_decimal = (
            Decimal(str(amount)) if not isinstance(amount, Decimal) else amount
        )
        surcharge = amount_decimal * Decimal(str(app_settings.surcharge_percentage))

        # Use our money.py quantize function for consistent banker's rounding
        return quantize(currency, surcharge)

    @staticmethod
    @transaction.atomic
    def create_delivery_payment(order: Order, platform_id: str) -> Payment:
        """
        Creates a complete payment record for delivery platform orders.
        This marks the order as paid and completed for manual delivery entry.

        Args:
            order: Order to create payment for
            platform_id: Delivery platform ID ("DOORDASH" or "UBER_EATS")

        Returns:
            Payment object with successful transaction

        Raises:
            ValueError: If platform_id is invalid or order is already paid
        """
        # Validate platform_id
        valid_platforms = [
            PaymentTransaction.PaymentMethod.DOORDASH,
            PaymentTransaction.PaymentMethod.UBER_EATS,
        ]
        if platform_id not in valid_platforms:
            raise ValueError(
                f"Invalid platform_id: {platform_id}. Must be one of {valid_platforms}"
            )

        # Check if order already has a payment
        if hasattr(order, "payment_details") and order.payment_details:
            existing_payment = order.payment_details
            if existing_payment.status == Payment.PaymentStatus.PAID:
                raise ValueError(f"Order {order.order_number} is already paid")

        # Create or get payment record
        payment, created = Payment.objects.get_or_create(
            order=order,
            defaults={
                "total_amount_due": order.grand_total,
                "amount_paid": order.grand_total,
                "status": Payment.PaymentStatus.PAID,
                "tenant": order.tenant,
                "store_location": order.store_location,  # Denormalize from order for fast location queries
            },
        )

        # If payment exists but isn't paid, update it
        if not created and payment.status != Payment.PaymentStatus.PAID:
            payment.total_amount_due = order.grand_total
            payment.amount_paid = order.grand_total
            payment.status = Payment.PaymentStatus.PAID
            payment.save()

        # Create successful payment transaction
        transaction_obj = PaymentTransaction.objects.create(
            payment=payment,
            amount=order.grand_total,
            tip=Decimal("0.00"),
            surcharge=Decimal("0.00"),
            method=platform_id,
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
            provider_response={
                "manual_entry": True,
                "platform": platform_id,
                "timestamp": payment.created_at.isoformat(),
            },
            tenant=payment.tenant,
        )

        # Update order status
        order.status = Order.OrderStatus.COMPLETED
        order.payment_status = Order.PaymentStatus.PAID
        order.order_type = platform_id
        order.save(update_fields=["status", "payment_status", "order_type"])

        # Emit payment completed signal
        payment_completed.send(sender=PaymentService, payment=payment, order=order)

        logger.info(
            f"Delivery payment created for order {order.order_number} via {platform_id}"
        )

        return payment
