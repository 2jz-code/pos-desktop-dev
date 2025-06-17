from django.shortcuts import render, get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
import stripe
from decimal import Decimal
from django.db import transaction as db_transaction
from settings.models import GlobalSettings
from .models import Payment, Order, PaymentTransaction
from .serializers import (
    ProcessPaymentSerializer,
    PaymentSerializer,
    InitiateTerminalPaymentSerializer,
    RefundTransactionSerializer
)
from .factories import PaymentStrategyFactory
from .services import PaymentService
from django.conf import settings
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from .strategies import StripeTerminalStrategy
import logging

# Create your views here.
logger = logging.getLogger(__name__)


class PaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for handling payments.
    Provides list, retrieve, and other standard actions.
    """

    serializer_class = PaymentSerializer
    queryset = Payment.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["post"], url_path="create-terminal-intent")
    def create_terminal_intent(self, request, pk=None):
        order = get_object_or_404(Order, pk=pk)

        # Server-side guard clause
        if order.payment_in_progress:
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

            # --- SET FLAG TO TRUE ---
            order.payment_in_progress = True
            order.save(update_fields=["payment_in_progress"])

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

    @action(detail=False, methods=["post"], url_path="cancel-intent")
    def cancel_intent(self, request):
        # The frontend sends a field called 'payment_intent_id', which we know is the transaction_id
        intent_to_cancel = request.data.get("payment_intent_id")
        if not intent_to_cancel:
            return Response(
                {"error": "payment_intent_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            stripe.PaymentIntent.cancel(intent_to_cancel)

            # --- FIX: Filter on the correct 'transaction_id' field ---
            transaction = PaymentTransaction.objects.filter(
                transaction_id=intent_to_cancel
            ).first()

            if transaction and transaction.payment.order:
                order = transaction.payment.order
                order.payment_in_progress = False
                order.save(update_fields=["payment_in_progress"])

            return Response(
                {"message": "PaymentIntent canceled successfully."},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            logger.error(f"Error canceling intent {intent_to_cancel}: {e}")
            return

    @action(detail=True, methods=["post"], url_path="add-payment")
    def add_payment(self, request, pk=None):
        order = get_object_or_404(Order, pk=pk)
        try:
            payment_service = PaymentService()
            payment = payment_service.add_payment_to_order(
                order=order,
                amount=Decimal(request.data.get("amount")),
                method=request.data.get("method"),
            )
            # --- SET FLAG TO FALSE ON COMPLETION ---
            if payment.status == "PAID":
                order.payment_in_progress = False
                order.save(update_fields=["payment_in_progress"])

            serializer = PaymentSerializer(payment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error adding payment to order {pk}: {e}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # --- NEW RECOVERY ENDPOINT ---
    @action(detail=True, methods=["post"], url_path="force-cancel-payments")
    def force_cancel_payments(self, request, pk=None):
        """
        Finds any 'PENDING' payments for an order, cancels the associated
        Stripe Payment Intents, and resets the order's progress flag.
        """
        order = get_object_or_404(Order, pk=pk)
        if not order.payment_in_progress:
            return Response(
                {"message": "No active payment to cancel."}, status=status.HTTP_200_OK
            )

        pending_payments = Payment.objects.filter(order=order, status="PENDING")
        for payment in pending_payments:
            for transaction in payment.transactions.all():
                if transaction.payment_intent_id:
                    try:
                        stripe.PaymentIntent.cancel(transaction.payment_intent_id)
                        logger.info(
                            f"Force-cancelled Stripe PI: {transaction.payment_intent_id}"
                        )
                    except stripe.error.InvalidRequestError as e:
                        # Ignore errors for intents that can't be canceled (already processed/canceled)
                        logger.warning(
                            f"Could not force-cancel Stripe PI {transaction.payment_intent_id}: {e}"
                        )
                        pass

        order.payment_in_progress = False
        order.save(update_fields=["payment_in_progress"])

        return Response(
            {"status": "active payments cancelled"}, status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"], url_path="refund-transaction")
    def refund_transaction_action(self, request, pk=None):
        """
        Initiates a refund for a specific PaymentTransaction associated with this Payment.
        `pk` is the payment_id. The transaction_id, amount, and reason are passed in the request body.
        """
        payment = get_object_or_404(Payment, pk=pk)
        
        serializer = RefundTransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transaction_id = serializer.validated_data.get("transaction_id")
        amount = serializer.validated_data["amount"]
        reason = serializer.validated_data.get("reason")

        try:
            # Ensure the transaction belongs to this payment
            transaction_to_refund = payment.transactions.get(id=transaction_id)
            
            # Use the PaymentService instance method for refunding a specific transaction
            payment_service_instance = PaymentService(payment=payment) # Initialize with the payment object
            updated_transaction = payment_service_instance.refund_transaction_with_provider(
                transaction_id=transaction_to_refund.id, # Pass the actual transaction ID
                amount_to_refund=amount,
                reason=reason
            )
            
            # Return the updated payment details
            response_serializer = PaymentSerializer(updated_transaction.payment)
            return Response(response_serializer.data, status=status.HTTP_200_OK)

        except PaymentTransaction.DoesNotExist:
            return Response(
                {"error": f"Transaction with ID {transaction_id} not found for this payment."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotImplementedError as e:
            return Response({"error": str(e)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        except Exception as e:
            logger.error(f"Error initiating refund for payment {pk}, transaction {transaction_id}: {e}")
            return Response(
                {"error": f"An unexpected error occurred during refund: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class TerminalConnectionTokenView(APIView):
    """Generate a connection token for the active terminal provider."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        # Read the location from the incoming request's JSON body.
        location_id = request.data.get("location")

        try:
            # Pass the location_id to the service.
            token = PaymentService.create_terminal_connection_token(
                location_id=location_id
            )
            return Response({"secret": token})
        except (RuntimeError, NotImplementedError, stripe.error.StripeError) as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CreateTerminalIntentView(generics.GenericAPIView):
    """
    Creates a Stripe Payment Intent for a given order for a terminal transaction.
    """

    def post(self, request, *args, **kwargs):
        order_id = self.kwargs.get("order_id")
        order = get_object_or_404(Order, id=order_id)

        if order.status == Order.OrderStatus.COMPLETED:
            return Response(
                {"error": "This order has already been completed and paid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- FIX: Read the partial amount and tip from the request body ---
        amount_from_request = request.data.get("amount")
        tip_from_request = request.data.get("tip", "0.00")

        if amount_from_request is None:
            return Response(
                {"error": "'amount' is a required field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_to_pay = Decimal(str(amount_from_request))
        tip_amount = Decimal(str(tip_from_request))
        # --- END FIX ---

        try:
            # --- FIX: Pass the correct partial amount to the service ---
            payment_intent = PaymentService.create_terminal_payment_intent(
                order=order,
                amount=amount_to_pay,  # Use the amount from the request
                tip=tip_amount,
            )
            # --- END FIX ---

            return Response(
                {
                    "client_secret": payment_intent.client_secret,
                    "payment_intent_id": payment_intent.id,
                }
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except (RuntimeError, NotImplementedError, stripe.error.StripeError) as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CancelPaymentIntentView(APIView):
    """
    Cancels a specific Payment Intent.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        payment_intent_id = request.data.get("payment_intent_id")
        if not payment_intent_id:
            return Response(
                {"error": "payment_intent_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            intent = PaymentService.cancel_payment_intent(payment_intent_id)
            return Response({"status": intent.status})
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CaptureTerminalIntentView(APIView):
    """Captures a payment intent and returns the updated Payment state."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        payment_intent_id = request.data.get("payment_intent_id")
        if not payment_intent_id:
            return Response(
                {"error": "payment_intent_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # This now returns the full Payment object from your service
            payment_object = PaymentService.capture_terminal_payment(payment_intent_id)

            # Serialize the payment object to send its data back to the frontend
            serializer = PaymentSerializer(payment_object)

            return Response(serializer.data, status=status.HTTP_200_OK)

        except (
            RuntimeError,
            NotImplementedError,
            stripe.error.StripeError,
            ValueError,
        ) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CancelTerminalActionView(APIView):
    """Cancels an ongoing action on a terminal reader."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        reader_id = request.data.get("reader_id")
        if not reader_id:
            return Response(
                {"error": "reader_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            result = PaymentService.cancel_terminal_action(reader_id=reader_id)
            return Response({"id": result.id, "status": result.status})
        except (
            RuntimeError,
            NotImplementedError,
            stripe.error.StripeError,
            ValueError,
        ) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class TerminalConfigurationView(APIView):
    """
    Provides the frontend with the current terminal configuration,
    such as the active provider and its required keys.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        settings = GlobalSettings.objects.first()
        if not settings:
            return Response(
                {"error": "Terminal settings not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        provider = settings.active_terminal_provider
        try:
            # Get the strategy instance to ask for its frontend config
            strategy = PaymentStrategyFactory.get_strategy(
                method="CARD_TERMINAL", provider=provider
            )
            config = strategy.get_frontend_configuration()
            return Response(config)
        except (ValueError, AttributeError) as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PaymentProcessView(generics.GenericAPIView):
    """
    The main endpoint for processing a payment transaction.
    Takes an order_id, a payment method, and an amount.
    Orchestrates the payment via the PaymentService.
    """

    serializer_class = ProcessPaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # The serializer's `create` method now returns the full Payment object
            payment = serializer.save()
            response_serializer = PaymentSerializer(payment)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PaymentDetailView(generics.RetrieveAPIView):
    """
    An endpoint to retrieve the full payment details for an order.
    """

    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "order__id"  # Look up payments by the order ID


# This view is now deprecated in favor of the more specific terminal views above.
# We will remove it after confirming the new flow.
class InitiateTerminalPaymentView(generics.GenericAPIView):
    """
    DEPRECATED: A dedicated endpoint for starting a payment with the currently configured
    card terminal. This uses a simple, synchronous-style `process` method.
    """

    serializer_class = InitiateTerminalPaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        order_id = self.kwargs.get("order_id")
        order = get_object_or_404(Order, id=order_id)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data["amount"]

        try:
            # Use the old service method for compatibility if needed.
            transaction = PaymentService.initiate_terminal_payment(
                order=order, amount=amount
            )
            payment = transaction.payment
            response_serializer = PaymentSerializer(payment)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        except (RuntimeError, ValueError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class StripeWebhookView(APIView):
    """
    Stripe webhook view to handle asynchronous events.
    """

    def post(self, request, *args, **kwargs):
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
        endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

        try:
            event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        except ValueError as e:
            # Invalid payload
            return HttpResponse(status=400)
        except stripe.error.SignatureVerificationError as e:
            # Invalid signature
            return HttpResponse(status=400)

        # Handle the event
        if event["type"] == "payment_intent.succeeded":
            payment_intent = event["data"]["object"]
            self._handle_payment_intent_succeeded(payment_intent)
        elif event["type"] == "payment_intent.payment_failed":
            payment_intent = event["data"]["object"]
            self._handle_payment_intent_payment_failed(payment_intent)
        elif event["type"] == "payment_intent.canceled":
            payment_intent = event["data"]["object"]
            self._handle_payment_intent_canceled(payment_intent)
        elif event["type"] == "charge.refunded":
            refund = event["data"]["object"]
            self._handle_charge_refunded(refund)
        else:
            # For any other event types, we can log them for now
            self._handle_unimplemented_event(event["data"]["object"])

        return HttpResponse(status=200)

    def _handle_unimplemented_event(self, event_data):
        """Generic handler for events we don't explicitly handle yet."""
        print(f"Unhandled event type: {event_data.object}")

    def _get_or_create_transaction(self, payment_intent) -> PaymentTransaction | None:
        """
        Robustly retrieves or creates a PaymentTransaction from a PaymentIntent object.
        This is crucial for webhooks that may arrive before the initial transaction
        is created via an API call.
        """
        pi_id = payment_intent.id
        # First, try to find an existing transaction
        txn = PaymentTransaction.objects.filter(transaction_id=pi_id).first()
        if txn:
            return txn

        # If no transaction, create one from the PaymentIntent metadata
        order_id = payment_intent.metadata.get("order_id")
        if not order_id:
            print(
                f"Webhook Error: PaymentIntent {pi_id} has no 'order_id' in metadata."
            )
            return None

        try:
            order = Order.objects.get(id=order_id)
            amount_decimal = Decimal(payment_intent.amount) / 100

            payment = PaymentService.get_or_create_payment(order)

            # Use the charge_id if available, else PI ID.
            effective_transaction_id = payment_intent.latest_charge or pi_id

            txn, created = PaymentTransaction.objects.get_or_create(
                payment=payment,
                transaction_id=effective_transaction_id,
                defaults={
                    "amount": amount_decimal,
                    "method": PaymentTransaction.PaymentMethod.CARD_ONLINE,  # Assume online for webhook-created transactions
                    "status": PaymentTransaction.TransactionStatus.PENDING,
                    "provider_response": payment_intent,
                },
            )
            if created:
                print(
                    f"Webhook: Created new PaymentTransaction {txn.id} for PI {pi_id}"
                )
            return txn
        except Order.DoesNotExist:
            print(
                f"Webhook Error: Order {order_id} from PI {pi_id} metadata not found."
            )
        except Exception as e:
            print(f"Webhook Error: Could not create transaction for PI {pi_id}: {e}")

        return None

    def _handle_payment_intent_succeeded(self, payment_intent):
        """Handles the 'payment_intent.succeeded' event."""
        transaction = self._get_or_create_transaction(payment_intent)
        if not transaction:
            return

        if transaction.status == PaymentTransaction.TransactionStatus.SUCCESSFUL:
            print(f"Transaction {transaction.id} already marked as successful.")
            return

        with db_transaction.atomic():
            transaction.status = PaymentTransaction.TransactionStatus.SUCCESSFUL
            transaction.provider_response = payment_intent
            # Ensure the transaction_id is the charge ID for successful payments
            if payment_intent.latest_charge:
                transaction.transaction_id = payment_intent.latest_charge
            transaction.save()
            PaymentService._update_payment_status(transaction.payment)
        print(
            f"Successfully processed 'payment_intent.succeeded' for Txn {transaction.id}"
        )

    def _handle_payment_intent_payment_failed(self, payment_intent):
        """Handles 'payment_intent.payment_failed' events."""
        self._handle_failure(payment_intent, event_type="payment_failed")

    def _handle_payment_intent_canceled(self, payment_intent):
        """Handles 'payment_intent.canceled' events."""
        self._handle_failure(payment_intent, event_type="canceled")

    def _handle_failure(self, payment_intent, event_type="failed"):
        """Generic handler for failure events."""
        transaction = self._get_or_create_transaction(payment_intent)
        if not transaction:
            return

        target_status = (
            PaymentTransaction.TransactionStatus.CANCELED
            if event_type == "canceled"
            else PaymentTransaction.TransactionStatus.FAILED
        )

        if transaction.status == target_status:
            print(
                f"Transaction {transaction.id} already in desired state: {target_status}."
            )
            return

        with db_transaction.atomic():
            transaction.status = target_status
            transaction.provider_response = payment_intent
            transaction.save()
            PaymentService._update_payment_status(transaction.payment)

        print(
            f"Successfully processed 'payment_intent.{event_type}' for Txn {transaction.id}"
        )

    def _handle_charge_refunded(self, refund_data):
        """Handles 'charge.refunded' events."""
        charge_id = refund_data.charge
        if not charge_id:
            return

        try:
            # Find the original transaction by the charge ID
            txn_to_refund = PaymentTransaction.objects.get(transaction_id=charge_id)

            with db_transaction.atomic():
                # For simplicity, we assume a full refund here.
                # A more complex implementation would handle partial refunds.
                txn_to_refund.status = PaymentTransaction.TransactionStatus.REFUNDED
                txn_to_refund.refunded_amount = Decimal(refund_data.amount) / 100 # Update refunded_amount from webhook

                # Append refund info to provider_response
                response = txn_to_refund.provider_response or {}
                if isinstance(response, dict):
                    refunds = response.get("refunds", [])
                    refunds.append(refund_data)
                    response["refunds"] = refunds
                    txn_to_refund.provider_response = response

                txn_to_refund.save()
                PaymentService._update_payment_status(txn_to_refund.payment)

            print(
                f"Successfully processed 'charge.refunded' for Txn {txn_to_refund.id}"
            )

        except PaymentTransaction.DoesNotExist:
            print(
                f"Webhook Error: Received refund for charge {charge_id} but could not find matching transaction."
            )


class CreatePaymentView(APIView):
    """
    Creates a new Payment object for a given Order, or returns the existing one.
    This is called when the payment process is initiated for an order for the first time.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        order_id = request.data.get("order_id")
        if not order_id:
            return Response(
                {"error": "order_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Use get_or_create to be idempotent.
        payment, created = Payment.objects.get_or_create(
            order=order,
            defaults={
                "total_amount_due": order.grand_total,
                "status": Payment.PaymentStatus.PENDING,
            },
        )

        serializer = PaymentSerializer(payment)
        # Return 201 if created, 200 if it already existed.
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=status_code)
