from django.shortcuts import render
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, viewsets, generics
from rest_framework.filters import SearchFilter
from .models import Product, Category, Tax, ProductType
from .serializers import (
    ProductSerializer,
    ProductCreateSerializer,
    ProductSyncSerializer,
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

    def get_queryset(self):
        queryset = super().get_queryset()

        # Support for delta sync - filter by modified_since parameter
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    queryset = queryset.filter(updated_at__gte=modified_since_dt)
            except (ValueError, TypeError):
                # If parsing fails, ignore the parameter
                pass

        return queryset

    def get_serializer_class(self):
        # Use sync serializer if sync=true parameter is present
        is_sync_request = self.request.query_params.get("sync") == "true"

        if is_sync_request and self.action in ["list", "retrieve"]:
            return ProductSyncSerializer

        if self.action in ["create", "update", "partial_update"]:
            return ProductCreateSerializer
        return ProductSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    """
    A viewset for viewing categories.
    Can be filtered by parent_id to get child categories, or with `?parent=null` to get top-level categories.
    Supports delta sync with modified_since parameter.
    """

    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Category.objects.all()

        # Support for delta sync - filter by modified_since parameter
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    # Categories don't have updated_at by default, so we'll use id as a proxy
                    # or you can add updated_at field to Category model
                    queryset = queryset.filter(
                        id__gte=1
                    )  # For now, return all until we add updated_at
            except (ValueError, TypeError):
                pass

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
