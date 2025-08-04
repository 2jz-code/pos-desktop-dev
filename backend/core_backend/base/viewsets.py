from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from .mixins import OptimizedQuerysetMixin, ArchivingViewSetMixin
from ..pagination import StandardPagination


class BaseViewSet(OptimizedQuerysetMixin, ArchivingViewSetMixin, viewsets.ModelViewSet):
    """
    Base ViewSet that provides standard configuration for all ModelViewSets.
    
    Features:
    - Automatic query optimization via OptimizedQuerysetMixin
    - Archiving support via ArchivingViewSetMixin  
    - Standard pagination, filtering, and search
    - Consistent error handling
    
    Usage:
        class ProductViewSet(BaseViewSet):
            serializer_class = ProductSerializer
            # optimization is handled automatically via serializer Meta
    """
    
    # Standard pagination for all ViewSets
    pagination_class = StandardPagination
    
    # Standard filter backends
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    
    # Default ordering (can be overridden)
    ordering = ['-id']
    
    def get_queryset(self):
        """
        Enhanced queryset with automatic optimization and archiving support.
        Child classes should override this if they need custom filtering.
        """
        queryset = super().get_queryset()
        
        # Add any project-wide filtering logic here
        # For example: tenant filtering, permission-based filtering, etc.
        
        return queryset


class ReadOnlyBaseViewSet(OptimizedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """
    Base ViewSet for read-only endpoints.
    
    Features:
    - Automatic query optimization
    - Standard pagination and filtering
    - No archiving (since read-only)
    """
    
    pagination_class = StandardPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    ordering = ['-id']


class BaseAPIView(viewsets.GenericViewSet):
    """
    Base class for custom API views that need standard project configuration.
    """
    
    pagination_class = StandardPagination
    
    def get_queryset(self):
        """Override in child classes"""
        raise NotImplementedError("Child classes must implement get_queryset")
