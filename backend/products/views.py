from django.shortcuts import render, get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, viewsets, generics, status
from rest_framework.filters import SearchFilter
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from .models import Product, Category, Tax, ProductType, ModifierSet, ModifierOption, ProductModifierSet, ProductSpecificOption
from users.permissions import ReadOnlyForCashiers
from .serializers import (
    ProductSerializer,
    ProductCreateSerializer,
    ProductSyncSerializer,
    CategorySerializer,
    TaxSerializer,
    ProductTypeSerializer,
    ModifierSetSerializer,
    ModifierOptionSerializer,
    ProductModifierSetSerializer
)
from .filters import ProductFilter
from django_filters.rest_framework import DjangoFilterBackend

class ProductModifierSetViewSet(viewsets.ModelViewSet):
    queryset = ProductModifierSet.objects.all()
    serializer_class = ProductModifierSetSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        return self.queryset.filter(product_id=self.kwargs['product_pk'])

    def perform_create(self, serializer):
        serializer.save(product_id=self.kwargs['product_pk'])

    @action(detail=True, methods=['post'], url_path='add-product-specific-option')
    def add_product_specific_option(self, request, product_pk=None, pk=None):
        """
        Add a product-specific option to a modifier set for this product.
        Creates a new ModifierOption and links it as a product-specific option.
        """
        try:
            product_modifier_set = self.get_object()
            
            # Create the modifier option
            option_data = {
                'name': request.data.get('name'),
                'price_delta': request.data.get('price_delta', 0.00),
                'display_order': request.data.get('display_order', 0),
                'modifier_set': product_modifier_set.modifier_set.id,
                'is_product_specific': True  # Mark as product-specific
            }
            
            option_serializer = ModifierOptionSerializer(data=option_data)
            if option_serializer.is_valid():
                modifier_option = option_serializer.save()
                
                # Create the product-specific relationship
                ProductSpecificOption.objects.create(
                    product_modifier_set=product_modifier_set,
                    modifier_option=modifier_option
                )
                
                return Response({
                    'success': True,
                    'option': option_serializer.data,
                    'message': 'Product-specific option created successfully'
                }, status=status.HTTP_201_CREATED)
            else:
                return Response({
                    'success': False,
                    'errors': option_serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['delete'], url_path='remove-product-specific-option/(?P<option_id>[^/.]+)')
    def remove_product_specific_option(self, request, product_pk=None, pk=None, option_id=None):
        """
        Remove a product-specific option from this product.
        This deletes both the ProductSpecificOption relationship and the ModifierOption itself.
        """
        try:
            product_modifier_set = self.get_object()
            
            # Find the product-specific option
            product_specific_option = ProductSpecificOption.objects.get(
                product_modifier_set=product_modifier_set,
                modifier_option_id=option_id
            )
            
            # Delete the modifier option (this will cascade to delete the ProductSpecificOption)
            modifier_option = product_specific_option.modifier_option
            modifier_option.delete()
            
            return Response({
                'success': True,
                'message': 'Product-specific option removed successfully'
            }, status=status.HTTP_200_OK)
            
        except ProductSpecificOption.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Product-specific option not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ModifierSetViewSet(viewsets.ModelViewSet):
    queryset = ModifierSet.objects.all().prefetch_related('options')
    serializer_class = ModifierSetSerializer
    permission_classes = [permissions.IsAdminUser]

class ModifierOptionViewSet(viewsets.ModelViewSet):
    queryset = ModifierOption.objects.all()
    serializer_class = ModifierOptionSerializer
    permission_classes = [permissions.IsAdminUser]

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
    permission_classes = [ReadOnlyForCashiers]


class ProductTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer
    permission_classes = [ReadOnlyForCashiers]
