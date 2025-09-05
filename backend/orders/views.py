from django.db import models
from rest_framework import viewsets, status, generics
from core_backend.base import BaseViewSet
from rest_framework.exceptions import NotFound
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from rest_framework.request import Request
import stripe
import logging

from .models import Order, OrderItem
from .serializers import (
    OrderSerializer,
    OptimizedOrderSerializer,
    OrderCreateSerializer,
    AddItemSerializer,
    UpdateOrderItemSerializer,
    UpdateOrderStatusSerializer,
    OrderItemSerializer,
    OrderCustomerInfoSerializer,
)
from .services import OrderService, GuestSessionService
from .permissions import (
    IsAuthenticatedOrGuestOrder,
    IsGuestOrAuthenticated,
)
from rest_framework.permissions import AllowAny
from users.permissions import IsAdminOrHigher
from users.authentication import (
    CustomerCookieJWTAuthentication,
    CookieJWTAuthentication,
)
from products.models import Product
from payments.models import Payment
from payments.strategies import StripeTerminalStrategy
from notifications.services import EmailService

logger = logging.getLogger(__name__)

class GetPendingOrderView(generics.RetrieveAPIView):
    """
    A view to get the current user's (guest or authenticated) pending order.
    Returns 404 if no pending order exists, without creating one.
    Customer-site only endpoint.
    """

    serializer_class = OrderSerializer
    authentication_classes = [CustomerCookieJWTAuthentication]  # Customer auth only to prevent admin cookie interference
    permission_classes = [AllowAny]  # Let the service layer handle guest/auth logic

    def get_object(self):
        """
        Retrieves the pending order for the current session/user.
        """
        order = GuestSessionService.get_guest_order(self.request)

        if not order:
            # Explicitly check for an authenticated user's pending order
            if self.request.user and self.request.user.is_authenticated:
                order = (
                    Order.objects.select_related('customer', 'cashier')
                    .prefetch_related(
                        'items__product',
                        'items__product__category',
                        'applied_discounts__discount'
                    )
                    .filter(
                        customer=self.request.user, status=Order.OrderStatus.PENDING
                    )
                    .order_by("-created_at")
                    .first()
                )

        if not order:
            raise NotFound("No pending order found.")

        return order

class OrderViewSet(BaseViewSet):
    """
    A comprehensive ViewSet for handling orders and their items - Admin/Staff only.
    Provides CRUD for orders and cart management functionalities.
    For customer orders, use /api/auth/customer/orders/ endpoints.
    (Now with automated query optimization)
    """

    queryset = Order.objects.all()
    authentication_classes = [CookieJWTAuthentication]  # Admin/staff authentication only
    permission_classes = [IsAuthenticatedOrGuestOrder]
    
    # Custom filtering and search configuration (BaseViewSet provides the rest)
    filterset_fields = ["status", "payment_status", "order_type"]
    search_fields = ["id", "customer__username", "cashier__username"]
    ordering_fields = ["created_at", "grand_total", "order_number"]
    ordering = ["-created_at"]  # Override BaseViewSet default to show newest orders first

    def get_serializer_class(self):
        """
        Return the appropriate serializer class based on the request action.
        """
        if self.action == "list":
            return OptimizedOrderSerializer
        if self.action == "create":
            return OrderCreateSerializer
        if self.action == "update_status":
            return UpdateOrderStatusSerializer
        # Default for 'retrieve', 'update', 'partial_update'
        return OrderSerializer

    def perform_create(self, serializer):
        """Handle order creation for both authenticated users and guests."""
        user = self.request.user
        order_type = serializer.validated_data.get("order_type", "POS")

        # Differentiate logic based on order type and user authentication
        if user and user.is_authenticated:
            if order_type == Order.OrderType.POS:
                # For POS orders, the authenticated user is the cashier
                serializer.save(cashier=user)
            else:  # For WEB, APP, etc.
                # For authenticated customers, check for an existing pending order
                existing_order = (
                    Order.objects.filter(
                        customer=user, status=Order.OrderStatus.PENDING
                    )
                    .order_by("-created_at")
                    .first()
                )

                if existing_order:
                    # If a pending order exists, use it instead of creating a new one
                    serializer.instance = existing_order
                else:
                    # If no pending order, create a new one and set the customer
                    serializer.save(customer=user)
        else:
            # For guest users, the service layer handles getting or creating
            guest_order = GuestSessionService.create_guest_order(
                self.request,
                order_type=order_type,
            )
            # Return the existing guest order instead of creating a new one
            serializer.instance = guest_order

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

    @action(
        detail=False,
        methods=["post"],
        url_path="add-item",
        permission_classes=[IsGuestOrAuthenticated],
        authentication_classes=[CustomerCookieJWTAuthentication, CookieJWTAuthentication],
    )
    def add_item_to_cart(self, request, *args, **kwargs):
        """
        A dedicated endpoint to add an item to the current user's cart.
        Handles getting or creating the order and adding the item in one step.
        """
        # First, get or create the order instance.
        # We can reuse the logic from the main create method.
        # We pass a dummy serializer to perform_create to get the instance.
        create_serializer = OrderCreateSerializer(data={"order_type": "WEB"})
        create_serializer.is_valid(raise_exception=True)
        self.perform_create(create_serializer)
        order = create_serializer.instance

        # Now, validate the item data and add it to the order.
        item_serializer = AddItemSerializer(data=request.data)
        item_serializer.is_valid(raise_exception=True)

        product_id = item_serializer.validated_data["product_id"]
        product = get_object_or_404(Product, pk=product_id)

        try:
            OrderService.add_item_to_order(
                order=order,
                product=product,
                quantity=item_serializer.validated_data.get("quantity", 1),
                selected_modifiers=item_serializer.validated_data.get("selected_modifiers", []),
                notes=item_serializer.validated_data.get("notes", ""),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Return the entire updated order.
        response_serializer = OrderSerializer(order, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)

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

    @action(detail=True, methods=["post"], url_path="hold")
    def hold(self, request: Request, pk=None) -> Response:
        """Holds the order by setting its status to HOLD."""
        return self._handle_status_change(request, OrderService.hold_order)

    @action(
        detail=True,
        methods=["post"],
        url_path="resend-confirmation",
        permission_classes=[IsAdminOrHigher],
    )
    def resend_confirmation(self, request: Request, pk=None) -> Response:
        """
        Resends the order confirmation email to the customer.
        """
        order = self.get_object()
        email_service = EmailService()

        # Check if there's an email to send to
        if not order.customer_email:
            return Response(
                {"error": "No customer email associated with this order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        success = email_service.send_order_confirmation_email(order)

        if success:
            return Response(
                {"message": f"Confirmation email sent to {order.customer_email}."},
                status=status.HTTP_200_OK,
            )
        else:
            return Response(
                {"error": "Failed to send confirmation email."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(
        detail=True,
        methods=["patch"],
        url_path="update-customer-info",
        permission_classes=[IsGuestOrAuthenticated],
    )
    def update_customer_info(self, request, pk=None):
        """
        Updates the customer information for an order, supporting both
        guest and authenticated users.
        """
        order = self.get_object()
        serializer = OrderCustomerInfoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_order = OrderService.update_customer_info(
                order, serializer.validated_data
            )
            response_serializer = OrderSerializer(
                updated_order, context={"request": request}
            )
            return Response(response_serializer.data)
        except Exception as e:
            logger.error(f"Error updating customer info for order {pk}: {e}")
            return Response(
                {"error": "An error occurred while updating customer information."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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

    @action(
        detail=False, methods=["post"], url_path="guest-order", permission_classes=[]
    )
    def create_guest_order(self, request):
        """
        Initializes a guest session and creates a new order if one doesn't exist.
        This ensures guest users have an active order ID to work with from the start.
        """
        guest_order = GuestSessionService.create_guest_order(request)
        serializer = self.get_serializer(guest_order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="convert-to-user")
    def convert_guest_to_user(self, request, pk=None):
        """
        Converts a guest order to an authenticated user's order.
        This is typically called after a guest user registers or logs in during checkout.
        It links the guest's cart to their new user account.
        """
        order = self.get_object()

        # Ensure this is a guest order
        if not order.is_guest_order:
            return Response(
                {"error": "This action is only available for guest orders."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = request.data.get("username")
        password = request.data.get("password")
        first_name = request.data.get("first_name", "")
        last_name = request.data.get("last_name", "")

        if not username or not password:
            return Response(
                {"error": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from .services import GuestConversionService

            user, converted_order = (
                GuestConversionService.create_account_from_guest_order(
                    order, username, password, first_name, last_name
                )
            )

            # Clear guest session data
            GuestSessionService.clear_guest_session(request)

            serializer = OrderSerializer(converted_order, context={"request": request})
            return Response(
                {
                    "order": serializer.data,
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                    },
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=False,
        methods=["post"],
        url_path="init-guest-session",
        permission_classes=[],
    )
    def init_guest_session(self, request):
        """
        Initialize or get guest session - no authentication required.
        Ensures session is created and returns guest session info.
        """
        # Override permission for this specific action
        if not hasattr(request, "session"):
            return Response(
                {"error": "Session middleware not available"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Ensure session exists
        if not request.session.session_key:
            request.session.create()

        # Get or create guest ID
        guest_id = GuestSessionService.get_or_create_guest_id(request)

        return Response(
            {
                "session_key": request.session.session_key,
                "guest_id": guest_id,
                "message": "Guest session initialized",
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="reorder")
    def reorder(self, request, pk=None):
        """
        Creates a new PENDING order by duplicating items from this order.
        """
        # Check if user is authenticated
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required to reorder."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            new_order = OrderService.reorder(source_order_id=pk, user=request.user)
            # Serialize the new order to return its details, including the new ID
            serializer = OrderSerializer(new_order, context={"request": request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="mark-sent-to-kitchen")
    def mark_sent_to_kitchen(self, request, pk=None):
        """
        Mark all items in this order as sent to kitchen.
        This prevents duplicate kitchen ticket printing.
        """
        try:
            updated_count = OrderService.mark_items_sent_to_kitchen(pk)
            return Response({
                "message": f"Marked {updated_count} items as sent to kitchen",
                "updated_count": updated_count
            }, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response(
                {"error": "Order not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )

class OrderItemViewSet(BaseViewSet):
    """
    A ViewSet for managing a specific item within an order.
    """

    queryset = OrderItem.objects.all()
    serializer_class = OrderItemSerializer
    authentication_classes = [CustomerCookieJWTAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticatedOrGuestOrder]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return AddItemSerializer
        if self.action == "partial_update":
            return UpdateOrderItemSerializer
        return OrderItemSerializer

    def get_queryset(self):
        """
        Filter items based on the order_pk provided in the URL.
        """
        return self.queryset.filter(order__pk=self.kwargs["order_pk"])

    def get_object(self):
        """
        Overridden to fetch the object based on order_pk and item pk.
        """
        queryset = self.get_queryset()
        obj = get_object_or_404(queryset, pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, obj.order)
        return obj

    def perform_update(self, serializer):
        """Saves the item and recalculates order totals."""
        item = serializer.save()
        OrderService.recalculate_order_totals(item.order)

    def perform_destroy(self, instance):
        """Deletes the item and recalculates order totals."""
        order = instance.order
        instance.delete()
        OrderService.recalculate_order_totals(order)

    def create(self, request, *args, **kwargs):
        """
        Adds an item to an order. If the item already exists, it updates the quantity.
        Returns the entire updated order object upon success.
        """
        order_pk = self.kwargs["order_pk"]
        order = get_object_or_404(Order, pk=order_pk)
        self.check_object_permissions(request, order)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data["product_id"]
        product = get_object_or_404(Product, pk=product_id)

        # Use the service to add or update the item
        OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=serializer.validated_data.get("quantity", 1),
            selected_modifiers=serializer.validated_data.get("selected_modifiers", []),
            notes=serializer.validated_data.get("notes", ""),
        )

        # Serialize the parent order and return it
        order_serializer = OrderSerializer(order, context={"request": request})
        return Response(order_serializer.data, status=status.HTTP_200_OK)

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
