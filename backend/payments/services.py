from decimal import Decimal
from django.db import transaction, models
from django.db.models import Sum
from settings.models import GlobalSettings, TerminalProvider
from .models import Payment, PaymentTransaction, Order
from .factories import PaymentStrategyFactory
from .strategies import TerminalPaymentStrategy
from django.shortcuts import get_object_or_404
import stripe


class PaymentService:

    def __init__(self, payment: Payment):
        """
        Initializes the service with a specific payment record.
        This pattern is used for operations on an *existing* payment, like a refund.
        """
        self.payment = payment

    @staticmethod
    @transaction.atomic
    def get_or_create_payment(order: Order) -> Payment:
        """
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

    @classmethod
    @transaction.atomic
    def initiate_terminal_payment(
        cls, order: Order, amount: Decimal
    ) -> PaymentTransaction:
        """
        Initiates a terminal payment by using the centrally configured provider.
        """
        settings = GlobalSettings.objects.first()
        if not settings:
            # Handle the case where settings are not configured
            raise RuntimeError("Global settings are not configured in the database.")

        provider = settings.active_terminal_provider
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
    def _update_payment_status(payment: Payment) -> Payment:
        """
        Recalculates the total amount paid for a payment, updates its status,
        and returns the updated payment object.
        """
        payment.refresh_from_db()  # Ensure we have the latest state before calculating

        successful_transactions = payment.transactions.filter(
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL
        )

        total_paid = successful_transactions.aggregate(total=Sum("amount"))[
            "total"
        ] or Decimal("0.00")

        payment.amount_paid = total_paid

        if total_paid >= payment.total_amount_due:
            payment.status = Payment.PaymentStatus.PAID
            # If the payment is fully paid, update the associated order's status as well.
            order = payment.order
            order.status = Order.OrderStatus.COMPLETED
            order.payment_in_progress = False
            order.save()
        elif total_paid > 0:
            payment.status = Payment.PaymentStatus.PARTIALLY_PAID
        else:
            # This case should ideally not be hit after a successful transaction
            payment.status = Payment.PaymentStatus.PENDING

        payment.save()
        return payment

    @staticmethod
    def _get_active_terminal_strategy() -> TerminalPaymentStrategy:
        """
        A helper method to retrieve the currently active terminal strategy instance.
        """
        settings = GlobalSettings.objects.first()
        if not settings:
            raise RuntimeError("Global settings are not configured in the database.")

        provider = settings.active_terminal_provider
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
            PaymentTransaction, transaction_id=payment_intent_id
        )

        transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
        transaction.save()

        # Update the aggregate payment status and get the refreshed payment object
        payment = transaction.payment
        payment = PaymentService._update_payment_status(payment)

        # If the payment is fully paid, update the order status
        if payment.status == Payment.PaymentStatus.PAID:
            order = payment.order
            order.status = Order.OrderStatus.COMPLETED
            order.save()

    @transaction.atomic
    def refund(self, amount_to_refund: Decimal) -> Payment:
        """
        Processes a refund for the associated payment.
        """
        if amount_to_refund <= 0:
            raise ValueError("Refund amount must be positive.")

        if amount_to_refund > self.payment.amount_paid:
            raise ValueError("Cannot refund more than the amount paid.")

        PaymentTransaction.objects.create(
            payment=self.payment,
            amount=-amount_to_refund,
            method=self.payment.transactions.last().method,
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
            transaction_type=PaymentTransaction.TransactionType.REFUND,
        )

        PaymentService._update_payment_status(self.payment)

        return self.payment
