from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from core_backend.base import ReadOnlyBaseViewSet
from orders.models import Order
from orders.serializers import OrderSerializer
from orders.permissions import IsAuthenticatedOrGuestOrder
from .authentication import CustomerCookieJWTAuthentication


class CustomerOrderViewSet(ReadOnlyBaseViewSet):
    """
    Customer-specific order viewset.
    Only allows customers to view their own orders.
    Uses CustomerCookieJWTAuthentication exclusively to avoid conflicts with admin auth.
    """
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    authentication_classes = [CustomerCookieJWTAuthentication]  # Customer auth only
    permission_classes = [IsAuthenticatedOrGuestOrder]
    # pagination_class, filter_backends, ordering handled by ReadOnlyBaseViewSet
    ordering = ['-created_at']  # Override default ordering
    
    def get_queryset(self):
        """
        Filter orders to only show customer's own orders.
        """
        queryset = super().get_queryset()
        
        # Only show customer's own orders (not POS staff orders)
        if self.request.user and self.request.user.is_authenticated:
            if hasattr(self.request.user, 'role') and self.request.user.role == self.request.user.Role.CUSTOMER:
                return queryset.filter(customer=self.request.user)
        
        # For guest users, use session-based filtering (handled by permission class)
        return queryset
        
    @action(detail=False, methods=['get'])
    def pending(self, request):
        """
        Get the customer's pending order (supports both authenticated and guest users).
        Prioritizes authenticated user orders over guest sessions.
        """
        from orders.services import GuestSessionService
        
        order = None
        
        # For authenticated users, prioritize their authenticated orders
        if request.user and request.user.is_authenticated:
            try:
                order = Order.objects.select_related('customer', 'cashier').prefetch_related(
                    'items__product',
                    'items__product__category', 
                    'applied_discounts__discount'
                ).filter(
                    customer=request.user,
                    status='PENDING'
                ).order_by("-created_at").first()
            except Order.DoesNotExist:
                order = None
        
        # Only fall back to guest order if user is not authenticated
        if not order and not (request.user and request.user.is_authenticated):
            order = GuestSessionService.get_guest_order(request)
        
        if order:
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        else:
            return Response(
                {"detail": "No pending order found"}, 
                status=404
            )
    
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def add_item(self, request):
        """
        Customer-specific add item to cart endpoint.
        Handles getting or creating the order and adding the item in one step.
        """
        from orders.serializers import OrderCreateSerializer, AddItemSerializer
        from orders.services import OrderService
        from products.models import Product
        from django.shortcuts import get_object_or_404
        from rest_framework import status
        
        # First, get or create the order instance.
        create_serializer = OrderCreateSerializer(data={"order_type": "WEB"})
        create_serializer.is_valid(raise_exception=True)
        
        # Use the same perform_create logic but for customer orders
        from orders.services import GuestSessionService
        
        # For authenticated customers, find/create their pending order
        if request.user and request.user.is_authenticated:
            from orders.models import Order
            order = Order.objects.filter(
                customer=request.user, 
                status='PENDING'
            ).order_by("-created_at").first()
            
            if not order:
                # Create new order for authenticated customer
                order = Order.objects.create(
                    customer=request.user,
                    order_type="WEB",
                    status="PENDING"
                )
        else:
            # For guests, use the existing guest session logic
            order = GuestSessionService.create_guest_order(request)
        
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
        from orders.serializers import OrderSerializer
        response_serializer = OrderSerializer(order, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)