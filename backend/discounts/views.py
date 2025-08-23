# Removed: from django.utils.dateparse import parse_datetime (moved to service)
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view
from core_backend.base import BaseViewSet, ReadOnlyBaseViewSet
from orders.models import Order
from .models import Discount
from .serializers import (
    DiscountSerializer,
    DiscountSyncSerializer,
    DiscountApplySerializer,
)
from .services import DiscountService, DiscountValidationService
from .filters import DiscountFilter

# Create your views here.

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

class DiscountViewSet(BaseViewSet):
    """
    A ViewSet for viewing and editing discounts.
    Provides list, create, retrieve, update, and destroy actions.
    Supports filtering by 'type', 'is_active', and 'scope'.
    Supports delta sync with modified_since parameter.
    """

    queryset = Discount.objects.with_archived()
    serializer_class = DiscountSerializer
    filterset_class = DiscountFilter
    ordering = ['-start_date']

    def get_serializer_class(self):
        # Use sync serializer if sync=true parameter is present
        is_sync_request = self.request.query_params.get("sync") == "true"

        if is_sync_request and self.action in ["list", "retrieve"]:
            return DiscountSyncSerializer

        return DiscountSerializer

    def get_queryset(self):
        # First get the base queryset with archiving support from parent
        base_queryset = super().get_queryset()
        
        # Then apply any additional filtering from the service
        filters = dict(self.request.query_params)
        
        # Apply service filtering on top of the base queryset (which includes archiving)
        if filters:
            # Get filtered queryset from service but starting from our base queryset
            filtered_queryset = DiscountValidationService.get_filtered_discounts(filters)
            # Combine with base queryset to maintain archiving logic
            return base_queryset.filter(id__in=filtered_queryset.values_list('id', flat=True))
        
        return base_queryset

class AvailableDiscountListView(ReadOnlyBaseViewSet):
    """
    Provides a read-only list of all currently active discounts.
    This view is optimized to prefetch related fields to avoid N+1 queries.
    """
    queryset = Discount.objects.filter(is_active=True)  # Only non-archived active discounts
    serializer_class = DiscountSerializer

@api_view(['POST'])
def apply_discount_code(request):
    """Apply discount code to order using validation service"""
    order_id = request.data.get('order_id')
    code = request.data.get('code')
    
    result = DiscountValidationService.validate_discount_code(code, order_id)
    
    if result["success"]:
        return Response(result)
    else:
        # Determine appropriate status code based on error
        if "not found" in result["error"]:
            status_code = status.HTTP_404_NOT_FOUND
        elif "required" in result["error"]:
            status_code = status.HTTP_400_BAD_REQUEST
        else:
            status_code = status.HTTP_400_BAD_REQUEST
            
        return Response(result, status=status_code)
