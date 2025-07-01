from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction, models
from django.db.models import Sum
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

        print(
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
            },
        )

        # If the order total has changed since the payment was initiated, update it.
        if not created and payment.total_amount_due != order.grand_total:
            payment.total_amount_due = order.grand_total
            payment.save(update_fields=["total_amount_due"])

        # Only transition to PENDING if currently UNPAID
        if payment.status == Payment.PaymentStatus.UNPAID:
            PaymentService._transition_payment_status(
                payment, Payment.PaymentStatus.PENDING
            )
        elif payment.status != Payment.PaymentStatus.PENDING:
            raise ValueError(
                f"Cannot initiate payment attempt. Payment status is {payment.status}, expected UNPAID"
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
        payment = transaction.payment
        
        # Idempotency Check: If the payment is already fully paid, do nothing further.
        if payment.status == Payment.PaymentStatus.PAID:
            print(f"Payment {payment.id} is already marked as PAID. Skipping confirmation.")
            return payment
            
        # Mark the transaction as successful
        transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
        transaction.save(update_fields=["status"])

        payment = Payment.objects.select_for_update().get(id=payment.id)

        # Recalculate amounts
        updated_payment = PaymentService._recalculate_payment_amounts(payment)

        # Determine new status based on amounts
        if updated_payment.amount_paid >= updated_payment.total_amount_due:
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.PAID
            )
            PaymentService._handle_payment_completion(updated_payment)
        elif updated_payment.amount_paid > 0:
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.PARTIALLY_PAID
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
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.PAID
            )
        elif updated_payment.amount_paid > 0:
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.PARTIALLY_PAID
            )
        else:
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.UNPAID
            )

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
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.PAID
            )
        elif updated_payment.amount_paid > 0:
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.PARTIALLY_PAID
            )
        else:
            PaymentService._transition_payment_status(
                updated_payment, Payment.PaymentStatus.UNPAID
            )

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
        Updates order status and emits signals.

        Args:
            payment: Completed payment
        """
        order = payment.order
        if order.status != Order.OrderStatus.COMPLETED:
            order.status = Order.OrderStatus.COMPLETED
            order.save(update_fields=["status"])

        # Emit payment_completed signal for event-driven architecture
        # Pass both payment and order for receiver flexibility
        payment_completed.send(sender=PaymentService, payment=payment, order=order)

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
            order=order, defaults={"total_amount_due": order.grand_total}
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
                target_status = Payment.PaymentStatus.REFUNDED
            else:
                target_status = Payment.PaymentStatus.PARTIALLY_REFUNDED
        elif payment.amount_paid >= payment.total_amount_due:
            target_status = Payment.PaymentStatus.PAID
        elif payment.amount_paid > 0:
            target_status = Payment.PaymentStatus.PARTIALLY_PAID
        else:
            target_status = Payment.PaymentStatus.UNPAID

        # Apply transition if status changed
        if target_status and payment.status != target_status:
            # Use force=True to maintain backward compatibility
            PaymentService._transition_payment_status(
                payment, target_status, force=True
            )

            # Handle completion if needed
            if target_status == Payment.PaymentStatus.PAID:
                PaymentService._handle_payment_completion(payment)

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
        order: Order, method: str, amount: Decimal, provider: str = None, **kwargs
    ) -> Payment:
        """
        The main entry point for processing a payment. It creates a transaction,
        selects a strategy, executes it, and updates the overall payment status.
        The full, updated Payment object is returned.
        """
        payment = PaymentService.get_or_create_payment(order)
        # Lock the payment row for the duration of this transaction
        payment = Payment.objects.select_for_update().get(id=payment.id)

        transaction = PaymentTransaction.objects.create(
            payment=payment, amount=amount, method=method
        )

        strategy = PaymentStrategyFactory.get_strategy(method, provider=provider)
        strategy.process(transaction, **kwargs)

        # After the strategy runs, we need to update the parent payment's status.
        # This will recalculate totals and set the correct status (e.g., PARTIALLY_PAID)
        updated_payment = PaymentService._update_payment_status(payment)

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
            method=PaymentTransaction.PaymentMethod.CARD_TERMINAL, provider=provider
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
        This method now correctly handles both full and partial (split) payments.
        """
        payment = PaymentService.get_or_create_payment(order)
        payment = Payment.objects.select_for_update().get(id=payment.id)

        # Atomically add the new tip to the payment's running tip total.
        payment.tip = (payment.tip or Decimal("0.00")) + tip
        payment.save(update_fields=["tip"])

        # This is the actual amount for this specific transaction (e.g., the partial payment).
        amount_for_this_intent = amount + tip

        # Get the active terminal strategy
        active_strategy = PaymentService._get_active_terminal_strategy()

        # The strategy is responsible for creating the PaymentIntent and the
        # associated PaymentTransaction record with the correct partial amount.
        return active_strategy.create_payment_intent(payment, amount_for_this_intent)

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
    def complete_payment(payment_intent_id: str):
        """
        Finalizes a payment after it has been confirmed by a webhook.
        This updates the transaction, payment, and order statuses.
        """
        transaction = get_object_or_404(
            PaymentTransaction.objects.select_related("payment__order"),
            transaction_id=payment_intent_id,
        )

        # Mark transaction as successful
        transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
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
        )

        PaymentService._update_payment_status(self.payment)
        return self.payment

    @transaction.atomic
    def refund_transaction_with_provider(
        self, transaction_id: uuid.UUID, amount_to_refund: Decimal, reason: str = None
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

        # Validation checks remain the same...
        if (
            original_transaction.refunded_amount + amount_to_refund
        ) > original_transaction.amount:
            raise ValueError("Cannot refund more than the remaining refundable amount.")

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

        # The method now returns the original transaction. The UI will have to wait
        # for the webhook to deliver the updated state.
        return original_transaction

    @staticmethod
    @transaction.atomic
    def create_online_payment_intent(
        order: Order, amount: Decimal, currency: str, user
    ) -> dict:
        """
        Creates a Stripe Payment Intent for an online payment for an authenticated user.
        """
        # Use the existing service method to get or create the payment record
        payment = PaymentService.get_or_create_payment(order)

        # If the amount being paid differs from the payment record, update it
        if payment.total_amount_due != amount:
            payment.total_amount_due = amount
            payment.save(update_fields=["total_amount_due"])

        # Build the intent data for Stripe
        from django.conf import settings

        stripe.api_key = settings.STRIPE_SECRET_KEY

        user_name = f"{user.first_name} {user.last_name}".strip() or user.username
        description = f"Order payment for {user_name}"

        intent_data = {
            "amount": int(amount * 100),  # Convert to cents
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
            method=PaymentTransaction.PaymentMethod.CARD_ONLINE,
            status=PaymentTransaction.TransactionStatus.PENDING,
            transaction_id=intent.id,
        )

        # Return the necessary details to the view
        return {
            "client_secret": intent.client_secret,
            "payment_intent_id": intent.id,
            "payment_id": str(payment.id),
        }
