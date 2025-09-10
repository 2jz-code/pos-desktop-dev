"""
Customer order views.
"""
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from core_backend.base import ReadOnlyBaseViewSet
from orders.models import Order
from orders.serializers import OrderSerializer
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
            customer_email=customer.email
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