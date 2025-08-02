from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from orders.models import Order
from orders.serializers import OrderSerializer
from orders.permissions import IsAuthenticatedOrGuestOrder
from core_backend.pagination import StandardPagination
from .authentication import CustomerCookieJWTAuthentication


class CustomerOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Customer-specific order viewset.
    Only allows customers to view their own orders.
    Uses CustomerCookieJWTAuthentication exclusively to avoid conflicts with admin auth.
    """
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    authentication_classes = [CustomerCookieJWTAuthentication]  # Customer auth only
    permission_classes = [IsAuthenticatedOrGuestOrder]
    pagination_class = StandardPagination  # Add pagination for customer orders
    ordering = ['-created_at']  # Consistent ordering with admin site
    
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
        Get the customer's pending order.
        """
        if request.user and request.user.is_authenticated:
            try:
                pending_order = Order.objects.get(
                    customer=request.user,
                    status='PENDING'
                )
                serializer = self.get_serializer(pending_order)
                return Response(serializer.data)
            except Order.DoesNotExist:
                return Response(
                    {"detail": "No pending order found"}, 
                    status=404
                )
        else:
            return Response(
                {"detail": "Authentication required"}, 
                status=401
            )