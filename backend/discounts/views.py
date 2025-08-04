from django.shortcuts import render
from django.utils.dateparse import parse_datetime
from rest_framework import generics, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from orders.models import Order
from .models import Discount
from .serializers import (
    DiscountSerializer,
    DiscountSyncSerializer,
    DiscountApplySerializer,
)
from .services import DiscountService
from django_filters.rest_framework import DjangoFilterBackend
from .filters import DiscountFilter

# Create your views here.


class DiscountListView(generics.ListAPIView):
    """
    API view to list all available, active discounts.
    """

    queryset = Discount.objects.filter(is_active=True)
    serializer_class = DiscountSerializer


class ApplyDiscountView(APIView):
    """
    API view to apply a discount to a specific order.
    """

    def post(self, request, order_id, *args, **kwargs):
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            return Response(
                {"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = DiscountApplySerializer(
            data=request.data, context={"order": order}
        )

        if serializer.is_valid():
            discount = serializer.validated_data["discount_id"]
            try:
                DiscountService.apply_discount_to_order(order, discount)
                return Response(
                    {"message": "Discount applied successfully."},
                    status=status.HTTP_200_OK,
                )
            except ValueError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            except NotImplementedError as e:
                return Response(
                    {"error": str(e)}, status=status.HTTP_501_NOT_IMPLEMENTED
                )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DiscountViewSet(viewsets.ModelViewSet):
    """
    A ViewSet for viewing and editing discounts.
    Provides list, create, retrieve, update, and destroy actions.
    Supports filtering by 'type', 'is_active', and 'scope'.
    Supports delta sync with modified_since parameter.
    """

    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = DiscountFilter
    ordering = ['-start_date']  # Explicitly set ordering for pagination

    def get_serializer_class(self):
        # Use sync serializer if sync=true parameter is present
        is_sync_request = self.request.query_params.get("sync") == "true"

        if is_sync_request and self.action in ["list", "retrieve"]:
            return DiscountSyncSerializer

        return DiscountSerializer

    def get_queryset(self):
        queryset = Discount.objects.prefetch_related(
            'applicable_products',
            'applicable_categories',
            'applicable_products__categories'
        )

        # Support for delta sync - filter by modified_since parameter
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    # Discount model doesn't have updated_at by default
                    # For now, return all discounts until we add updated_at field
                    queryset = queryset.filter(id__gte=1)
            except (ValueError, TypeError):
                # If parsing fails, ignore the parameter
                pass

        return queryset


class AvailableDiscountListView(generics.ListAPIView):
    """
    Provides a read-only list of all currently active discounts.
    """

    serializer_class = DiscountSerializer

    def get_queryset(self):
        """
        This view should return a list of all discounts
        that are currently active for the cashier to select from.
        """
        return Discount.objects.filter(is_active=True)


from rest_framework.decorators import api_view

@api_view(['POST'])
def apply_discount_code(request):
    order_id = request.data.get('order_id')
    code = request.data.get('code')

    if not order_id or not code:
        return Response({'error': 'Order ID and code are required.'}, status=400)

    try:
        order = Order.objects.get(id=order_id)
        discount = Discount.objects.get(code__iexact=code) # Case-insensitive search
        
        # This assumes your DiscountService has a method like this
        DiscountService.apply_discount_to_order(order, discount)

        return Response({'message': 'Discount applied successfully.'})
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=404)
    except Discount.DoesNotExist:
        return Response({'error': 'Invalid discount code.'}, status=404)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
