"""
Terminal payment views.

Handles payment processing for physical terminal devices (POS systems).
These views manage terminal-specific operations like connection tokens,
terminal configuration, and hardware payment processing.
"""

from rest_framework import status, generics, permissions
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from decimal import Decimal
import logging
import stripe

from .base import BasePaymentView, PaymentValidationMixin, PAYMENT_MESSAGES
from ..models import Payment, PaymentTransaction
from ..serializers import PaymentSerializer, InitiateTerminalPaymentSerializer
from ..services import PaymentService
from ..strategies import StripeTerminalStrategy
from ..factories import PaymentStrategyFactory
from orders.models import Order

logger = logging.getLogger(__name__)


class TerminalPaymentViewSet:
    """
    ViewSet mixin for terminal-specific payment actions.
    This contains the terminal action that was originally in PaymentViewSet.
    """

    @action(detail=True, methods=["post"], url_path="create-terminal-intent")
    def create_terminal_intent(self, request, pk=None):
        """
        Creates a terminal payment intent for a specific order.

        This action is designed to be mixed into PaymentViewSet but separated here
        for better organization of terminal-specific functionality.
        """
        order = get_object_or_404(Order, pk=pk)

        # Server-side guard clause - use derived property
        if order.payment_in_progress_derived:
            return Response(
                {"error": "A terminal payment is already in progress for this order."},
                status=status.HTTP_409_CONFLICT,
            )

        amount = Decimal(request.data.get("amount"))
        tip = Decimal(request.data.get("tip", 0))

        try:
            terminal_strategy = StripeTerminalStrategy()
            client_secret, payment_intent_id = terminal_strategy.create_payment_intent(
                order=order, amount=amount, tip=tip, currency="usd"
            )

            # Payment state is now managed automatically by the state machine

            return Response(
                {
                    "client_secret": client_secret,
                    "payment_intent_id": payment_intent_id,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.error(f"Error creating terminal intent for order {pk}: {e}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class TerminalConnectionTokenView(BasePaymentView):
    """
    Generate a connection token for the active terminal provider.

    This is required for terminal devices to establish a connection
    with the payment provider's servers.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Creates a connection token for terminal devices.

        Expected payload:
        {
            "location": "location_id"  # optional
        }
        """
        # Read the location from the incoming request's JSON body.
        location_id = request.data.get("location")

        try:
            # Pass the location_id to the service.
            token = PaymentService.create_terminal_connection_token(
                location_id=location_id
            )
            return self.create_success_response({"secret": token})
        except (RuntimeError, NotImplementedError, stripe.error.StripeError) as e:
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CreateTerminalIntentView(BasePaymentView, PaymentValidationMixin):
    """
    Creates a Stripe Payment Intent for a given order for a terminal transaction.
    Uses formal state transition methods for payment management.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Creates a terminal payment intent for an order.

        Expected payload:
        {
            "amount": "decimal_string",
            "tip": "decimal_string"  # optional, defaults to 0.00
        }
        """
        order_id = self.kwargs.get("order_id")
        order = get_object_or_404(Order, id=order_id)

        if order.status == Order.OrderStatus.COMPLETED:
            return self.create_error_response(
                "This order has already been completed and paid."
            )

        # Read the partial amount and tip from the request body
        amount_from_request = request.data.get("amount")
        tip_from_request = request.data.get("tip", "0.00")

        if amount_from_request is None:
            return self.create_error_response("'amount' is a required field.")

        amount_to_pay = Decimal(str(amount_from_request))
        tip_amount = Decimal(str(tip_from_request))

        try:
            # The PaymentService will now handle surcharge calculation internally.
            # We no longer calculate it in the view.
            payment_intent = PaymentService.create_terminal_payment_intent(
                order=order,
                amount=amount_to_pay,
                tip=tip_amount,
            )

            return self.create_success_response(
                {
                    "client_secret": payment_intent.client_secret,
                    "payment_intent_id": payment_intent.id,
                },
                status.HTTP_201_CREATED,
            )
        except ValueError as e:
            return self.create_error_response(str(e))
        except (RuntimeError, NotImplementedError, stripe.error.StripeError) as e:
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CancelPaymentIntentView(BasePaymentView):
    """
    Cancels a specific Payment Intent.

    This is used to cancel terminal payment intents that are no longer needed.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Cancels a payment intent.

        Expected payload:
        {
            "payment_intent_id": "stripe_pi_id"
        }
        """
        payment_intent_id = request.data.get("payment_intent_id")
        if not payment_intent_id:
            return self.create_error_response("payment_intent_id is required.")

        try:
            intent = PaymentService.cancel_payment_intent(payment_intent_id)
            return self.create_success_response({"status": intent.status})
        except ValueError as e:
            return self.create_error_response(str(e))
        except Exception as e:
            return self.create_error_response(
                f"An unexpected error occurred: {str(e)}",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CaptureTerminalIntentView(BasePaymentView):
    """
    Captures a payment intent and returns the updated Payment state.
    Uses formal state transition methods for payment confirmation.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Captures a terminal payment intent.

        Expected payload:
        {
            "payment_intent_id": "stripe_pi_id"
        }
        """
        payment_intent_id = request.data.get("payment_intent_id")
        if not payment_intent_id:
            return self.create_error_response("payment_intent_id is required.")

        try:
            # Find the transaction first
            transaction = PaymentTransaction.objects.select_related("payment").get(
                transaction_id=payment_intent_id
            )

            # Get the active terminal strategy to capture the payment with provider
            strategy = PaymentService._get_active_terminal_strategy()
            strategy.capture_payment(transaction)

            # Use formal state transition method to confirm successful transaction
            payment_object = PaymentService.confirm_successful_transaction(transaction)

            # Serialize the payment object to send its data back to the frontend
            serializer = PaymentSerializer(payment_object)

            return self.create_success_response(serializer.data)

        except PaymentTransaction.DoesNotExist:
            return self.create_error_response(
                f"No transaction found for payment_intent_id: {payment_intent_id}",
                status.HTTP_404_NOT_FOUND,
            )
        except (
            RuntimeError,
            NotImplementedError,
            stripe.error.StripeError,
            ValueError,
        ) as e:
            return self.create_error_response(str(e))


class CancelTerminalActionView(BasePaymentView):
    """
    Cancels an ongoing action on a terminal reader.

    This is used to cancel actions like collecting payments or displaying messages
    that are currently in progress on a physical terminal device.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Cancels an ongoing terminal action.

        Expected payload:
        {
            "reader_id": "terminal_reader_id"
        }
        """
        reader_id = request.data.get("reader_id")
        if not reader_id:
            return self.create_error_response("reader_id is required.")

        try:
            result = PaymentService.cancel_terminal_action(reader_id=reader_id)
            return self.create_success_response(
                {"id": result.id, "status": result.status}
            )
        except (
            RuntimeError,
            NotImplementedError,
            stripe.error.StripeError,
            ValueError,
        ) as e:
            return self.create_error_response(str(e))


class TerminalConfigurationView(BasePaymentView):
    """
    Provides the frontend with the current terminal configuration.

    Returns information about the active terminal provider and its required
    configuration keys for frontend initialization.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Returns terminal configuration for frontend.

        Response includes:
        - Active terminal provider
        - Required configuration keys
        - Frontend initialization parameters
        """
        # Use the centralized configuration instead of direct database queries
        from settings.config import app_settings

        provider = app_settings.active_terminal_provider
        try:
            # Get the strategy instance to ask for its frontend config
            strategy = PaymentStrategyFactory.get_strategy(
                method="CARD_TERMINAL", provider=provider
            )
            config = strategy.get_frontend_configuration()
            return self.create_success_response(config)
        except (ValueError, AttributeError) as e:
            return self.create_error_response(
                str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InitiateTerminalPaymentView(BasePaymentView):
    """
    DEPRECATED: A dedicated endpoint for starting a payment with the currently configured
    card terminal. This uses a simple, synchronous-style `process` method.

    Note: This view is kept for backward compatibility but should be replaced
    with the newer CreateTerminalIntentView for new implementations.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        DEPRECATED: Initiates a terminal payment using legacy method.

        Expected payload:
        {
            "amount": "decimal_string"
        }
        """
        order_id = self.kwargs.get("order_id")
        order = get_object_or_404(Order, id=order_id)

        # Validate amount
        amount_str = request.data.get("amount")
        if not amount_str:
            return self.create_error_response("amount is required.")

        try:
            amount = Decimal(str(amount_str))
        except (ValueError, TypeError):
            return self.create_error_response("Invalid amount format.")

        try:
            # Use the old service method for compatibility if needed.
            transaction = PaymentService.initiate_terminal_payment(
                order=order, amount=amount
            )
            payment = transaction.payment
            serializer = PaymentSerializer(payment)
            return self.create_success_response(serializer.data)
        except (RuntimeError, ValueError) as e:
            return self.create_error_response(str(e))


# Export all terminal views
__all__ = [
    "TerminalPaymentViewSet",
    "TerminalConnectionTokenView",
    "CreateTerminalIntentView",
    "CancelPaymentIntentView",
    "CaptureTerminalIntentView",
    "CancelTerminalActionView",
    "TerminalConfigurationView",
    "InitiateTerminalPaymentView",
]
