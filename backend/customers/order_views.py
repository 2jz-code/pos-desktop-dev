"""
Customer order views.
"""
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core_backend.base import ReadOnlyBaseViewSet
from orders.models import Order
from orders.serializers import OrderSerializer, AddItemSerializer, OrderCreateSerializer
from orders.services import OrderService
from .authentication import CustomerCookieJWTAuthentication, CustomerJWTAuthenticationMixin
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit


class CustomerOrderViewSet(CustomerJWTAuthenticationMixin, ReadOnlyBaseViewSet):
    """
    Customer-specific order viewset.
    Only allows customers to view their own orders.
    Uses CustomerCookieJWTAuthentication exclusively to avoid conflicts with admin auth.
    """
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    authentication_classes = [CustomerCookieJWTAuthentication]  # Customer auth only
    permission_classes = [permissions.IsAuthenticated]
    # pagination_class, filter_backends, ordering handled by ReadOnlyBaseViewSet
    ordering = ['-created_at']  # Override default ordering
    
    def get_queryset(self):
        """
        Filter orders to only show those belonging to the authenticated customer.
        Uses customer ForeignKey to filter orders.
        """
        customer = self.ensure_customer_authenticated()
        
        # Filter orders by customer ForeignKey
        return Order.objects.filter(
            customer=customer
        ).select_related(
            'cashier', 'customer'
        ).prefetch_related(
            'items__product', 'items__product__category',
            'applied_discounts__discount'
        )
    
    @method_decorator(ratelimit(key='ip', rate='30/m', method='GET', block=True))
    def list(self, request, *args, **kwargs):
        """List customer orders with rate limiting"""
        return super().list(request, *args, **kwargs)
    
    @method_decorator(ratelimit(key='ip', rate='30/m', method='GET', block=True))
    def retrieve(self, request, *args, **kwargs):
        """Retrieve specific customer order with rate limiting"""
        return super().retrieve(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """
        Get customer's most recent orders (last 10).
        """
        customer = self.ensure_customer_authenticated()
        
        recent_orders = Order.objects.filter(
            customer=customer
        ).order_by('-created_at')[:10]
        
        serializer = self.get_serializer(recent_orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get customer order statistics.
        """
        customer = self.ensure_customer_authenticated()
        
        # Use customer's calculated properties from the model
        stats = {
            'total_orders': customer.total_orders,
            'total_spent': customer.total_spent,
            'average_order_value': customer.average_order_value,
            'last_order_date': customer.last_order_date,
            'days_since_last_order': customer.days_since_last_order,
            'is_active_customer': customer.is_active_customer,
        }
        
        return Response(stats)
    
    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def pending(self, request):
        """
        Get the customer's pending order with strict separation between authenticated and guest carts.
        Authenticated users only get authenticated orders, guests only get guest orders.
        """
        from orders.services import GuestSessionService
        
        order = None
        
        # Strict separation: authenticated users get their own cart, guests get guest cart
        if request.user and request.user.is_authenticated:
            # Authenticated user: only return their own pending order
            order = Order.objects.select_related('customer', 'cashier').prefetch_related(
                'items__product',
                'items__product__category', 
                'applied_discounts__discount'
            ).filter(
                customer=request.user,
                status='PENDING'
            ).order_by("-created_at").first()
        else:
            # Guest user: only return guest order from session
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
    @method_decorator(ratelimit(key='ip', rate='30/m', method='POST', block=True))
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
        
        # Strict separation: authenticated users get/create authenticated orders, guests get guest orders
        if request.user and request.user.is_authenticated:
            # Find existing authenticated user order
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
            from orders.services import GuestSessionService
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
        response_serializer = OrderSerializer(order, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def update_item(self, request):
        """
        Update quantity of an item in customer's cart.
        """
        from orders.services import GuestSessionService
        
        # Get the order (authenticated or guest)
        if request.user and request.user.is_authenticated:
            try:
                order = Order.objects.get(
                    customer=request.user,
                    status='PENDING'
                )
            except Order.DoesNotExist:
                return Response({"error": "No active cart found"}, status=status.HTTP_404_NOT_FOUND)
        else:
            order = GuestSessionService.get_guest_order(request)
            if not order:
                return Response({"error": "No active cart found"}, status=status.HTTP_404_NOT_FOUND)
        
        from orders.serializers import UpdateOrderItemSerializer
        from orders.models import OrderItem
        from django.shortcuts import get_object_or_404
        
        # Validate the update data
        serializer = UpdateOrderItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        item_id = serializer.validated_data["id"]
        item = get_object_or_404(OrderItem, id=item_id, order=order)
        
        try:
            OrderService.update_order_item(
                item=item,
                quantity=serializer.validated_data.get("quantity", item.quantity),
                notes=serializer.validated_data.get("notes", item.notes)
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        response_serializer = OrderSerializer(order, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def remove_item(self, request):
        """
        Remove an item from customer's cart.
        """
        from orders.services import GuestSessionService
        
        # Get the order (authenticated or guest)
        if request.user and request.user.is_authenticated:
            try:
                order = Order.objects.get(
                    customer=request.user,
                    status='PENDING'
                )
            except Order.DoesNotExist:
                return Response({"error": "No active cart found"}, status=status.HTTP_404_NOT_FOUND)
        else:
            order = GuestSessionService.get_guest_order(request)
            if not order:
                return Response({"error": "No active cart found"}, status=status.HTTP_404_NOT_FOUND)
        
        from orders.models import OrderItem
        from django.shortcuts import get_object_or_404
        
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({"error": "item_id is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        item = get_object_or_404(OrderItem, id=item_id, order=order)
        
        try:
            OrderService.remove_order_item(item)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        response_serializer = OrderSerializer(order, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)