from django.shortcuts import render, get_object_or_404
from django.utils.dateparse import parse_datetime
from django.db import models
from rest_framework import permissions, viewsets, generics, status
from rest_framework.filters import SearchFilter
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from .models import (
    Product,
    Category,
    Tax,
    ProductType,
    ModifierSet,
    ModifierOption,
    ProductModifierSet,
    ProductSpecificOption,
)
from users.permissions import ReadOnlyForCashiers
from .serializers import (
    ProductSerializer,
    ProductCreateSerializer,
    ProductSyncSerializer,
    OptimizedProductSerializer,
    POSProductSerializer,
    CategorySerializer,
    TaxSerializer,
    ProductTypeSerializer,
    ModifierSetSerializer,
    ModifierOptionSerializer,
    ProductModifierSetSerializer,
    BasicProductSerializer,
)
from .services import ProductService
from .filters import ProductFilter
from django_filters.rest_framework import DjangoFilterBackend
from core_backend.base.viewsets import BaseViewSet


class ProductModifierSetViewSet(BaseViewSet):
    queryset = ProductModifierSet.objects.all()
    serializer_class = ProductModifierSetSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        return self.queryset.filter(product_id=self.kwargs["product_pk"])

    def perform_create(self, serializer):
        serializer.save(product_id=self.kwargs["product_pk"])

    @action(detail=True, methods=["post"], url_path="add-product-specific-option")
    def add_product_specific_option(self, request, product_pk=None, pk=None):
        """
        Add a product-specific option to a modifier set for this product.
        Creates a new ModifierOption and links it as a product-specific option.
        """
        try:
            product_modifier_set = self.get_object()

            # Create the modifier option
            option_data = {
                "name": request.data.get("name"),
                "price_delta": request.data.get("price_delta", 0.00),
                "display_order": request.data.get("display_order", 0),
                "modifier_set": product_modifier_set.modifier_set.id,
                "is_product_specific": True,  # Mark as product-specific
            }

            option_serializer = ModifierOptionSerializer(data=option_data)
            if option_serializer.is_valid():
                modifier_option = option_serializer.save()

                # Create the product-specific relationship
                ProductSpecificOption.objects.create(
                    product_modifier_set=product_modifier_set,
                    modifier_option=modifier_option,
                )

                return Response(
                    {
                        "success": True,
                        "option": option_serializer.data,
                        "message": "Product-specific option created successfully",
                    },
                    status=status.HTTP_201_CREATED,
                )
            else:
                return Response(
                    {"success": False, "errors": option_serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        except Exception as e:
            return Response(
                {"success": False, "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(
        detail=True,
        methods=["delete"],
        url_path="remove-product-specific-option/(?P<option_id>[^/.]+)",
    )
    def remove_product_specific_option(
        self, request, product_pk=None, pk=None, option_id=None
    ):
        """
        Remove a product-specific option from this product.
        This deletes both the ProductSpecificOption relationship and the ModifierOption itself.
        """
        try:
            product_modifier_set = self.get_object()

            # Find the product-specific option
            product_specific_option = ProductSpecificOption.objects.get(
                product_modifier_set=product_modifier_set, modifier_option_id=option_id
            )

            # Delete the modifier option (this will cascade to delete the ProductSpecificOption)
            modifier_option = product_specific_option.modifier_option
            modifier_option.delete()

            return Response(
                {
                    "success": True,
                    "message": "Product-specific option removed successfully",
                },
                status=status.HTTP_200_OK,
            )

        except ProductSpecificOption.DoesNotExist:
            return Response(
                {"success": False, "error": "Product-specific option not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {"success": False, "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ModifierSetViewSet(BaseViewSet):
    queryset = ModifierSet.objects.all()
    serializer_class = ModifierSetSerializer
    permission_classes = [permissions.IsAdminUser]

    @action(detail=True, methods=["get"], url_path="usage")
    def get_usage_analytics(self, request, pk=None):
        """
        Get usage analytics for a specific modifier set.
        Returns statistics about how this modifier set is being used.
        """
        try:
            modifier_set = self.get_object()
            from .services import ProductAnalyticsService
            
            usage_data = ProductAnalyticsService.get_modifier_set_usage_analytics(modifier_set)
            return Response(usage_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["get"], url_path="products")
    def get_products_using_modifier_set(self, request, pk=None):
        """
        Get all products that use this modifier set.
        Returns detailed information about products and their modifier configurations.
        """
        try:
            modifier_set = self.get_object()
            from .services import ProductAnalyticsService
            
            products_data = ProductAnalyticsService.get_products_using_modifier_set(modifier_set)
            return Response(products_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=["get"], url_path="analytics-summary")
    def get_analytics_summary(self, request):
        """
        Get overall analytics summary for all modifier sets.
        Returns aggregated statistics across all modifier sets.
        """
        try:
            from .services import ProductAnalyticsService
            
            summary_data = ProductAnalyticsService.get_modifier_sets_analytics_summary()
            return Response(summary_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )



class ModifierOptionViewSet(BaseViewSet):
    queryset = ModifierOption.objects.all()
    serializer_class = ModifierOptionSerializer
    permission_classes = [permissions.IsAdminUser]


# Create your views here.


class ProductViewSet(BaseViewSet):
    queryset = Product.objects.with_archived().order_by(
        "category__order", "category__name", "name"
    )
    permission_classes = [
        permissions.AllowAny
    ]  # Allow public access for customer website
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = ProductFilter
    search_fields = ["name", "description", "barcode"]

    def get_queryset(self):
        """
        Get queryset using ProductSearchService for business logic.
        Extracted filtering logic (30+ lines) to service layer.
        """
        from .services import ProductSearchService
        
        is_for_website = self.request.query_params.get("for_website") == "true"
        
        if is_for_website:
            # Use service for website-specific filtering
            queryset = ProductSearchService.get_products_for_website()
        else:
            queryset = super().get_queryset()
        
        # Handle delta sync using service
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            modified_queryset = ProductSearchService.get_products_modified_since(modified_since)
            if modified_queryset is not None:
                queryset = queryset.filter(id__in=modified_queryset.values_list('id', flat=True))
        
        return queryset

    def list(self, request, *args, **kwargs):
        # Cache for common POS queries
        query_params = dict(request.GET.items())

        # Cache unfiltered requests
        if not query_params:
            products = ProductService.get_cached_products_list()
            serializer = self.get_serializer(products, many=True)
            return Response(serializer.data)

        # Cache the most common POS query: ?is_active=true
        if query_params == {"is_active": "true"}:
            products = ProductService.get_cached_active_products_list()
            serializer = self.get_serializer(products, many=True)
            return Response(serializer.data)

        # Fall back to optimized queryset for other filtered requests
        return super().list(request, *args, **kwargs)

    def get_serializer_class(self):
        # Use sync serializer if sync=true parameter is present
        is_sync_request = self.request.query_params.get("sync") == "true"

        if is_sync_request and self.action in ["list", "retrieve"]:
            return ProductSyncSerializer

        # Check if this is for the customer website - use full serializer with description
        is_for_website = self.request.query_params.get("for_website") == "true"
        
        if self.action == "list":
            if is_for_website:
                return ProductSerializer  # Full serializer with description for customer site
            return POSProductSerializer  # Lightweight POS serializer with modifier detection
        elif self.action in ["create", "update", "partial_update"]:
            return ProductCreateSerializer
        return ProductSerializer  # Full detail view

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

            product = get_object_or_404(
                Product.objects.all(),  # Let serializer handle optimization
                name=decoded_name,
                is_active=True,
            )
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
    Business logic (25+ lines) extracted to ProductSearchService.
    """
    from .services import ProductSearchService
    from rest_framework.exceptions import ValidationError as DRFValidationError
    
    try:
        product = ProductSearchService.search_products_by_barcode(
            barcode, include_inactive=False
        )
        
        if product:
            serializer = ProductSerializer(product, context={'request': request})
            return Response({"success": True, "product": serializer.data})
        else:
            return Response(
                {"success": False, "error": "Product not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
    except ValidationError as e:
        return Response(
            {"success": False, "error": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )


class CategoryViewSet(BaseViewSet):
    """
    A viewset for viewing categories.
    Can be filtered by parent_id to get child categories, or with `?parent=null` to get top-level categories.
    Supports delta sync with modified_since parameter.
    Supports archiving with include_archived parameter.
    """

    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [
        permissions.AllowAny
    ]  # Allow public access for customer website

    def get_queryset(self):
        # Get queryset with archiving logic applied by parent classes (ArchivingViewSetMixin)
        queryset = super().get_queryset()

        is_for_website = self.request.query_params.get("for_website") == "true"
        if is_for_website:
            queryset = queryset.filter(is_public=True, is_active=True)

        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    queryset = queryset.filter(
                        id__gte=1
                    )  # Replace with updated_at if available
            except (ValueError, TypeError):
                pass

        parent_id = self.request.query_params.get("parent")
        if parent_id is not None:
            if parent_id == "null":
                queryset = queryset.filter(parent__isnull=True)
            else:
                queryset = queryset.filter(parent_id=parent_id)

        return queryset

    def list(self, request, *args, **kwargs):
        # Use cache for simple requests without complex filtering
        if (
            not request.query_params.get("parent")
            and not request.query_params.get("modified_since")
            and not request.query_params.get("include_archived")
        ):
            categories = ProductService.get_cached_category_tree()
            serializer = self.get_serializer(categories, many=True)
            return Response(serializer.data)

        # Fall back to normal queryset for filtered requests
        return super().list(request, *args, **kwargs)


class TaxViewSet(BaseViewSet):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    permission_classes = [permissions.IsAdminUser]


class ProductTypeViewSet(BaseViewSet):
    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer
    permission_classes = [ReadOnlyForCashiers]

    
