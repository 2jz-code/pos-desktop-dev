from django.shortcuts import render
from rest_framework import permissions, viewsets, generics
from rest_framework.filters import SearchFilter
from .models import Product, Category, Tax, ProductType
from .serializers import (
    ProductSerializer,
    ProductCreateSerializer,
    CategorySerializer,
    TaxSerializer,
    ProductTypeSerializer,
)
from .filters import ProductFilter
from django_filters.rest_framework import DjangoFilterBackend

# Create your views here.


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = ProductFilter
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ProductCreateSerializer
        return ProductSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    """
    A viewset for viewing categories.
    Can be filtered by parent_id to get child categories, or with `?parent=null` to get top-level categories.
    """

    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Category.objects.all()
        parent_id = self.request.query_params.get("parent")

        if parent_id is not None:
            if parent_id == "null":
                # Filter for top-level categories (those with no parent)
                queryset = queryset.filter(parent__isnull=True)
            else:
                # Filter for child categories of the specified parent
                queryset = queryset.filter(parent_id=parent_id)

        return queryset


class TaxListCreateView(generics.ListCreateAPIView):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    permission_classes = [permissions.IsAdminUser]


class TaxDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    permission_classes = [permissions.IsAdminUser]


class ProductTypeListView(generics.ListCreateAPIView):
    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer
    permission_classes = [permissions.IsAdminUser]


class ProductTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer
    permission_classes = [permissions.IsAdminUser]
