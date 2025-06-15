from django.shortcuts import render
from rest_framework import generics, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from orders.models import Order
from .models import Discount
from .serializers import DiscountSerializer, DiscountApplySerializer
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
    """

    queryset = Discount.objects.all().order_by("name")
    serializer_class = DiscountSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = DiscountFilter


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
