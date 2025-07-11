from django.shortcuts import render, get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, viewsets, generics, status
from rest_framework.filters import SearchFilter
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
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
    queryset = Product.objects.select_related("category").order_by(
        "category__order", "category__name", "name"
    )  # Order by category order, then category name, then product name
    permission_classes = [
        permissions.AllowAny
    ]  # Allow public access for customer website
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = ProductFilter
    search_fields = ["name", "description", "barcode"]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Check if the request is for the customer-facing website
        is_for_website = self.request.query_params.get("for_website") == "true"

        # For update operations (PATCH, PUT, DELETE), include all products
        # This allows unarchiving archived products
        if self.action in ["update", "partial_update", "destroy", "retrieve"]:
            # Don't filter by is_active for individual product operations
            pass
        else:
            # Default to active products only if no is_active filter is specified
            # This maintains backward compatibility for existing API consumers
            is_active_param = self.request.query_params.get("is_active")
            if is_active_param is None:
                # Default behavior: only show active products for list operations
                queryset = queryset.filter(is_active=True)

            # Filter for website visibility: both product and category must be public
            if is_for_website:
                queryset = queryset.filter(is_public=True, category__is_public=True)

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

    @action(detail=False, methods=["get"], url_path="by-name/(?P<name>[^/.]+)")
    def get_by_name(self, request, name=None):
        """
        Get a product by its exact name.
        URL: /api/products/by-name/{product_name}/
        """
        try:
            # URL decode the name parameter
            from urllib.parse import unquote

            if not name:
                return Response(
                    {"error": "Product name is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            decoded_name = unquote(name)

            product = get_object_or_404(Product, name=decoded_name, is_active=True)
            serializer = self.get_serializer(product)
            return Response(serializer.data)
        except Product.DoesNotExist:
            return Response(
                {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
            )


@api_view(["GET"])
@permission_classes([permissions.AllowAny])  # Allow public access for customer website
def barcode_lookup(request, barcode):
    """
    Simple barcode lookup endpoint for POS system.
    Returns product details if found.
    """
    try:
        product = get_object_or_404(Product, barcode=barcode, is_active=True)
        serializer = ProductSerializer(product)
        return Response({"success": True, "product": serializer.data})
    except Product.DoesNotExist:
        return Response(
            {"success": False, "error": "Product not found"},
            status=status.HTTP_404_NOT_FOUND,
        )


class CategoryViewSet(viewsets.ModelViewSet):
    """
    A viewset for viewing categories.
    Can be filtered by parent_id to get child categories, or with `?parent=null` to get top-level categories.
    Supports delta sync with modified_since parameter.
    """

    serializer_class = CategorySerializer
    permission_classes = [
        permissions.AllowAny
    ]  # Allow public access for customer website

    def get_queryset(self):
        queryset = Category.objects.all()

        # Check if the request is for the customer-facing website
        is_for_website = self.request.query_params.get("for_website") == "true"

        if is_for_website:
            queryset = queryset.filter(is_public=True)

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
