from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Order, OrderItem
from .serializers import (
    OrderSerializer,
    OrderListSerializer,
    OrderCreateSerializer,
    AddItemSerializer,
    UpdateOrderItemSerializer,
    UpdateOrderStatusSerializer,
    OrderItemSerializer,
)
from .services import OrderService
from django.shortcuts import get_object_or_404
from rest_framework.request import Request
from django_filters.rest_framework import DjangoFilterBackend

# --- NEW IMPORTS NEEDED FOR THE MOVED ACTION ---
import stripe
import logging
from payments.models import Payment
from payments.strategies import StripeTerminalStrategy

logger = logging.getLogger(__name__)


class OrderViewSet(viewsets.ModelViewSet):
    """
    A comprehensive ViewSet for handling orders and their items.
    Provides CRUD for orders and cart management functionalities.
    """

    queryset = Order.objects.prefetch_related(
        "items__product", "applied_discounts__discount", "cashier", "customer"
    ).all()
    permission_classes = [permissions.IsAuthenticated]

    # --- THE FIX: Add filter backends and define filterable/searchable fields ---
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["status", "payment_status", "order_type"]
    search_fields = ["id", "customer__username", "cashier__username"]
    ordering_fields = ["created_at", "grand_total"]

    ordering = ["-created_at"]  # Newest orders first (descending)

    def get_serializer_class(self):
        """
        Return the appropriate serializer class based on the request action.
        """
        if self.action == "list":
            return OrderListSerializer
        if self.action == "create":
            return OrderCreateSerializer
        if self.action == "update_status":
            return UpdateOrderStatusSerializer
        # Default for 'retrieve', 'update', 'partial_update'
        return OrderSerializer

    def perform_create(self, serializer):
        """Inject the logged-in user as the cashier for the new order."""
        serializer.save(cashier=self.request.user)

    def create(self, request, *args, **kwargs):
        """
        Custom create method to use OrderSerializer for the response,
        ensuring the full order data (including ID) is returned.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        response_serializer = OrderSerializer(
            serializer.instance, context={"request": request}
        )
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )

    def _handle_status_change(self, request: Request, service_method) -> Response:
        """Generic handler for status-changing actions."""
        order = self.get_object()
        try:
            service_method(order)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request: Request, pk=None) -> Response:
        """Voids the order."""
        return self._handle_status_change(request, OrderService.void_order)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request: Request, pk=None) -> Response:
        """Cancels the order."""
        return self._handle_status_change(request, OrderService.cancel_order)

    @action(detail=True, methods=["post"], url_path="resume")
    def resume(self, request: Request, pk=None) -> Response:
        """Resumes a held order by setting its status to PENDING."""
        return self._handle_status_change(request, OrderService.resume_order)

    @action(
        detail=True,
        methods=["post"],
        url_path="update-status",
    )
    def update_status(self, request, pk=None):
        """
        Updates the status of an order, ensuring valid transitions via OrderService.
        """
        order = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        try:
            OrderService.update_order_status(order=order, new_status=new_status)
            response_serializer = OrderSerializer(order, context={"request": request})
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="force-cancel-payments")
    def force_cancel_payments(self, request, pk=None):
        """
        Finds any 'PENDING' payments for an order, cancels the associated
        Stripe Payment Intents using the strategy, and resets the order's progress flag.
        """
        order = self.get_object()
        if not order.payment_in_progress_derived:
            return Response(
                {"message": "No active payment to cancel."}, status=status.HTTP_200_OK
            )

        # --- UPDATED LOGIC ---
        # Instantiate the strategy to ensure the API key is set
        terminal_strategy = StripeTerminalStrategy()

        pending_payments = Payment.objects.filter(order=order, status="PENDING")
        for payment in pending_payments:
            for transaction in payment.transactions.all():
                # Use the strategy to cancel the payment intent
                terminal_strategy.cancel_payment_intent(transaction.transaction_id)

        # Payment progress status is now managed automatically by the state machine

        return Response(
            {"status": "active payments cancelled"}, status=status.HTTP_200_OK
        )


class OrderItemViewSet(viewsets.ModelViewSet):
    """
    A ViewSet for managing a specific item within an order.
    """

    queryset = OrderItem.objects.all()
    serializer_class = OrderItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return AddItemSerializer
        return self.serializer_class

    def get_queryset(self):
        order_pk = self.kwargs.get("order_pk")
        if order_pk:
            return self.queryset.filter(order__id=order_pk)
        return self.queryset.none()

    def get_object(self):
        order_pk = self.kwargs.get("order_pk")
        item_pk = self.kwargs.get("pk")
        obj = get_object_or_404(OrderItem, pk=item_pk, order_id=order_pk)
        self.check_object_permissions(self.request, obj)
        return obj

    def perform_update(self, serializer):
        item = serializer.save()
        OrderService.recalculate_order_totals(item.order)

    def perform_destroy(self, instance):
        order = instance.order
        instance.delete()
        OrderService.recalculate_order_totals(order)

    def create(self, request, *args, **kwargs):
        order = get_object_or_404(Order, pk=kwargs.get("order_pk"))
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order_item = serializer.save(order=order)
        response_serializer = OrderItemSerializer(
            order_item, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["delete"], url_path="clear")
    def clear_all_items(self, request, order_pk=None):
        order = get_object_or_404(Order, pk=order_pk)
        if order.status not in [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.HOLD,
        ]:
            return Response(
                {"error": "Cannot modify a completed or cancelled order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.items.all().delete()
        OrderService.recalculate_order_totals(order)
        return Response(status=status.HTTP_204_NO_CONTENT)
