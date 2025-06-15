from django.shortcuts import render
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Location, InventoryStock, Recipe
from .serializers import (
    LocationSerializer,
    InventoryStockSerializer,
    RecipeSerializer,
    StockAdjustmentSerializer,
    StockTransferSerializer,
)

# Create your views here.

# --- Model-based Views ---


class LocationListCreateView(generics.ListCreateAPIView):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAdminUser]


class LocationDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAdminUser]


class RecipeListCreateView(generics.ListCreateAPIView):
    queryset = Recipe.objects.all()
    serializer_class = RecipeSerializer
    permission_classes = [permissions.IsAdminUser]


class RecipeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Recipe.objects.all()
    serializer_class = RecipeSerializer
    permission_classes = [permissions.IsAdminUser]


class InventoryStockListView(generics.ListAPIView):
    queryset = InventoryStock.objects.select_related("product", "location").all()
    serializer_class = InventoryStockSerializer
    permission_classes = [permissions.IsAdminUser]
    # Advanced filtering (e.g., by location or product) could be added here later.


# --- Service-driven Views ---


class AdjustStockView(APIView):
    """
    An endpoint to add or remove stock from a single location.
    - Positive quantity: adds stock.
    - Negative quantity: removes stock.
    """

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, *args, **kwargs):
        serializer = StockAdjustmentSerializer(data=request.data)
        if serializer.is_valid():
            try:
                serializer.save()
                return Response(
                    {"status": "success", "message": "Stock adjusted successfully."},
                    status=status.HTTP_200_OK,
                )
            except ValueError as e:
                return Response(
                    {"status": "error", "message": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TransferStockView(APIView):
    """
    An endpoint to transfer stock between two locations.
    """

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, *args, **kwargs):
        serializer = StockTransferSerializer(data=request.data)
        if serializer.is_valid():
            try:
                serializer.save()
                return Response(
                    {"status": "success", "message": "Stock transferred successfully."},
                    status=status.HTTP_200_OK,
                )
            except ValueError as e:
                return Response(
                    {"status": "error", "message": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
