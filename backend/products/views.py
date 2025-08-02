from django.shortcuts import render, get_object_or_404
from django.utils.dateparse import parse_datetime
from django.db import models
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
    ProductModifierSetSerializer,
    BasicProductSerializer
)
from .services import ProductService
from .filters import ProductFilter
from django_filters.rest_framework import DjangoFilterBackend
from core_backend.mixins import ArchivingViewSetMixin

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
    queryset = ModifierSet.objects.all().prefetch_related(
        'options',
        'product_modifier_sets__product'
    )
    serializer_class = ModifierSetSerializer
    permission_classes = [permissions.IsAdminUser]

    @action(detail=True, methods=['get'], url_path='usage')
    def get_usage_analytics(self, request, pk=None):
        """
        Get usage analytics for a specific modifier set.
        Returns statistics about how this modifier set is being used.
        """
        try:
            modifier_set = self.get_object()
            
            # Get basic usage statistics
            product_count = modifier_set.product_modifier_sets.count()
            
            # Get list of products using this modifier set
            product_modifier_sets = modifier_set.product_modifier_sets.select_related('product').all()
            products = [pms.product for pms in product_modifier_sets]
            
            # Calculate additional analytics
            usage_data = {
                'modifier_set_id': modifier_set.id,
                'modifier_set_name': modifier_set.name,
                'product_count': product_count,
                'products': BasicProductSerializer(products, many=True).data,
                'is_used': product_count > 0,
                'usage_level': self._get_usage_level(product_count),
                'option_count': modifier_set.options.count(),
                'selection_type': modifier_set.selection_type,
                'min_selections': modifier_set.min_selections,
                'max_selections': modifier_set.max_selections,
                'is_conditional': modifier_set.triggered_by_option is not None,
            }
            
            return Response(usage_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='products')
    def get_products_using_modifier_set(self, request, pk=None):
        """
        Get all products that use this modifier set.
        Returns detailed information about products and their modifier configurations.
        """
        try:
            modifier_set = self.get_object()
            
            # Get products using this modifier set with their configurations
            product_modifier_sets = modifier_set.product_modifier_sets.select_related('product').prefetch_related(
                'hidden_options',
                'extra_options'
            ).all()
            
            products_data = []
            for pms in product_modifier_sets:
                product = pms.product
                
                # Get hidden and extra options for this product
                hidden_options = list(pms.hidden_options.values('id', 'name'))
                extra_options = list(pms.extra_options.values('id', 'name', 'price_delta'))
                
                product_data = {
                    'id': product.id,
                    'name': product.name,
                    'barcode': product.barcode,
                    'price': float(product.price),
                    'is_active': product.is_active,
                    'category': product.category.name if product.category else None,
                    'modifier_config': {
                        'display_order': pms.display_order,
                        'is_required_override': pms.is_required_override,
                        'hidden_options': hidden_options,
                        'extra_options': extra_options,
                        'hidden_option_count': len(hidden_options),
                        'extra_option_count': len(extra_options),
                    }
                }
                products_data.append(product_data)
            
            # Sort by display order, then by product name
            products_data.sort(key=lambda x: (x['modifier_config']['display_order'], x['name']))
            
            return Response(products_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='analytics-summary')
    def get_analytics_summary(self, request):
        """
        Get overall analytics summary for all modifier sets.
        Returns aggregated statistics across all modifier sets.
        """
        try:
            modifier_sets = self.get_queryset()
            
            total_sets = modifier_sets.count()
            used_sets = modifier_sets.filter(product_modifier_sets__isnull=False).distinct().count()
            unused_sets = total_sets - used_sets
            
            # Calculate total products using modifiers
            total_products_with_modifiers = Product.objects.filter(
                product_modifier_sets__isnull=False
            ).distinct().count()
            
            # Get modifier set usage distribution
            usage_distribution = {
                'unused': modifier_sets.filter(product_modifier_sets__isnull=True).count(),
                'low_usage': modifier_sets.annotate(
                    product_count=models.Count('product_modifier_sets')
                ).filter(product_count__gt=0, product_count__lte=3).count(),
                'medium_usage': modifier_sets.annotate(
                    product_count=models.Count('product_modifier_sets')
                ).filter(product_count__gt=3, product_count__lte=10).count(),
                'high_usage': modifier_sets.annotate(
                    product_count=models.Count('product_modifier_sets')
                ).filter(product_count__gt=10).count(),
            }
            
            # Calculate average options per set
            avg_options_per_set = modifier_sets.annotate(
                option_count=models.Count('options')
            ).aggregate(models.Avg('option_count'))['option_count__avg'] or 0
            
            summary_data = {
                'total_modifier_sets': total_sets,
                'used_modifier_sets': used_sets,
                'unused_modifier_sets': unused_sets,
                'usage_percentage': round((used_sets / total_sets * 100) if total_sets > 0 else 0, 1),
                'total_products_with_modifiers': total_products_with_modifiers,
                'average_options_per_set': round(avg_options_per_set, 1),
                'usage_distribution': usage_distribution,
                'most_used_sets': self._get_most_used_sets(),
                'least_used_sets': self._get_least_used_sets(),
            }
            
            return Response(summary_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_usage_level(self, product_count):
        """Helper method to determine usage level based on product count."""
        if product_count == 0:
            return 'unused'
        elif product_count <= 3:
            return 'low'
        elif product_count <= 10:
            return 'medium'
        else:
            return 'high'

    def _get_most_used_sets(self):
        """Get the top 5 most used modifier sets."""
        return ModifierSet.objects.annotate(
            product_count=models.Count('product_modifier_sets')
        ).filter(product_count__gt=0).order_by('-product_count')[:5].values(
            'id', 'name', 'internal_name', 'product_count'
        )

    def _get_least_used_sets(self):
        """Get modifier sets that are unused or have low usage."""
        return ModifierSet.objects.annotate(
            product_count=models.Count('product_modifier_sets')
        ).filter(product_count__lte=1).order_by('product_count', 'name')[:10].values(
            'id', 'name', 'internal_name', 'product_count'
        )

class ModifierOptionViewSet(viewsets.ModelViewSet):
    queryset = ModifierOption.objects.all()
    serializer_class = ModifierOptionSerializer
    permission_classes = [permissions.IsAdminUser]

# Create your views here.


class ProductViewSet(ArchivingViewSetMixin, viewsets.ModelViewSet):
    queryset = Product.objects.with_archived().select_related(
        "category", "product_type"
    ).prefetch_related(
        "taxes",
        "modifier_sets",
        "product_modifier_sets__modifier_set__options",
        "product_modifier_sets__hidden_options",
        "product_modifier_sets__extra_options"
    ).order_by("category__order", "category__name", "name")
    permission_classes = [
        permissions.AllowAny
    ]  # Allow public access for customer website
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = ProductFilter
    search_fields = ["name", "description", "barcode"]

    def get_queryset(self):
        # First, let the ArchivingViewSetMixin handle archiving parameters
        queryset = super().get_queryset()

        # Check if the request is for the customer-facing website
        is_for_website = self.request.query_params.get("for_website") == "true"

        # For update operations (PATCH, PUT, DELETE), include archived products for archiving endpoints
        # This allows unarchiving archived products
        if self.action in ["update", "partial_update", "destroy", "retrieve", "archive", "unarchive"]:
            # Include all products (active and archived) for individual operations
            if hasattr(queryset, 'with_archived'):
                queryset = queryset.with_archived()
        else:
            # For list operations, only apply additional filters if no archiving params are used
            include_archived = self.request.query_params.get('include_archived')
            is_active_param = self.request.query_params.get("is_active")
            
            # Only apply additional filtering if no archiving parameters are present
            if not include_archived and is_active_param is not None:
                # Explicit is_active parameter (backward compatibility)
                is_active = is_active_param.lower() == "true"
                queryset = queryset.filter(is_active=is_active)

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

    def list(self, request, *args, **kwargs):
        # Cache for common POS queries
        query_params = dict(request.GET.items())
        
        # Cache unfiltered requests
        if not query_params:
            products = ProductService.get_cached_products_list()
            serializer = self.get_serializer(products, many=True)
            return Response(serializer.data)
        
        # Cache the most common POS query: ?is_active=true
        if query_params == {'is_active': 'true'}:
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

            product = get_object_or_404(
                Product.objects.select_related("category", "product_type").prefetch_related(
                    "taxes",
                    "modifier_sets", 
                    "product_modifier_sets__modifier_set__options",
                    "product_modifier_sets__hidden_options",
                    "product_modifier_sets__extra_options"
                ),
                name=decoded_name,
                is_active=True
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
    Returns product details if found.
    """
    try:
        product = get_object_or_404(
            Product.objects.select_related("category", "product_type").prefetch_related(
                "taxes",
                "modifier_sets",
                "product_modifier_sets__modifier_set__options",
                "product_modifier_sets__hidden_options",
                "product_modifier_sets__extra_options"
            ),
            barcode=barcode,
            is_active=True
        )
        serializer = ProductSerializer(product)
        return Response({"success": True, "product": serializer.data})
    except Product.DoesNotExist:
        return Response(
            {"success": False, "error": "Product not found"},
            status=status.HTTP_404_NOT_FOUND,
        )


class CategoryViewSet(ArchivingViewSetMixin, viewsets.ModelViewSet):
    """
    A viewset for viewing categories.
    Can be filtered by parent_id to get child categories, or with `?parent=null` to get top-level categories.
    Supports delta sync with modified_since parameter.
    Supports archiving with include_archived parameter.
    """
    
    queryset = Category.objects.select_related("parent").prefetch_related("children")
    serializer_class = CategorySerializer
    permission_classes = [
        permissions.AllowAny
    ]  # Allow public access for customer website

    def get_queryset(self):
        # Handle archiving logic first
        include_archived = self.request.query_params.get('include_archived', '').lower()
        
        if include_archived in ['true', '1', 'yes']:
            # Include archived records - get all categories
            queryset = Category.objects.with_archived()
        elif include_archived == 'only':
            # Show only archived records
            queryset = Category.objects.archived_only()
        else:
            # Default: show only active records
            queryset = Category.objects.all()
        
        # Apply optimizations
        queryset = queryset.select_related("parent").prefetch_related("children")

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

    def list(self, request, *args, **kwargs):
        # Use cache for simple requests without complex filtering
        if (not request.query_params.get("parent") and 
            not request.query_params.get("modified_since") and
            not request.query_params.get("include_archived")):
            categories = ProductService.get_cached_category_tree()
            serializer = self.get_serializer(categories, many=True)
            return Response(serializer.data)
        
        # Fall back to normal queryset for filtered requests
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def archive(self, request, pk=None):
        """
        Archive a category. Requires admin permissions.
        """
        category = self.get_object()
        
        if not category.is_active:
            return Response(
                {'error': 'Category is already archived.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        category.archive(archived_by=request.user if request.user.is_authenticated else None)
        
        return Response(
            {'message': 'Category archived successfully.'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def unarchive(self, request, pk=None):
        """
        Unarchive a category. Requires admin permissions.
        """
        # Get the category including archived ones
        try:
            category = Category.objects.with_archived().get(pk=pk)
        except Category.DoesNotExist:
            return Response(
                {'error': 'Category not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if category.is_active:
            return Response(
                {'error': 'Category is not archived.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        category.unarchive()
        
        return Response(
            {'message': 'Category unarchived successfully.'},
            status=status.HTTP_200_OK
        )


class TaxListCreateView(generics.ListCreateAPIView):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    permission_classes = [permissions.IsAdminUser]


class TaxDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    permission_classes = [permissions.IsAdminUser]


class ProductTypeViewSet(ArchivingViewSetMixin, viewsets.ModelViewSet):
    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer
    permission_classes = [ReadOnlyForCashiers]
    
    def get_queryset(self):
        # Handle archiving logic directly to avoid mixin conflicts
        include_archived = self.request.query_params.get('include_archived', '').lower()
        
        if include_archived in ['true', '1', 'yes']:
            # Include archived records - get all product types
            queryset = ProductType.objects.with_archived()
        elif include_archived == 'only':
            # Show only archived records
            queryset = ProductType.objects.archived_only()
        else:
            # Default: show only active records
            queryset = ProductType.objects.all()
        
        return queryset

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def archive(self, request, pk=None):
        """
        Archive a product type. Requires admin permissions.
        """
        product_type = self.get_object()
        
        if not product_type.is_active:
            return Response(
                {'error': 'Product type is already archived.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        product_type.archive(archived_by=request.user if request.user.is_authenticated else None)
        
        return Response(
            {'message': 'Product type archived successfully.'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def unarchive(self, request, pk=None):
        """
        Unarchive a product type. Requires admin permissions.
        """
        # Get the product type including archived ones
        try:
            product_type = ProductType.objects.with_archived().get(pk=pk)
        except ProductType.DoesNotExist:
            return Response(
                {'error': 'Product type not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if product_type.is_active:
            return Response(
                {'error': 'Product type is not archived.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        product_type.unarchive()
        
        return Response(
            {'message': 'Product type unarchived successfully.'},
            status=status.HTTP_200_OK
        )
