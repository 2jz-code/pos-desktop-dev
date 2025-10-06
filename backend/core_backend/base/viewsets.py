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

        IMPORTANT: Re-evaluates queryset at request time to ensure tenant context is applied.
        The class-level queryset attribute is evaluated at import time (before tenant context exists),
        so we must call Model.objects again here to get a fresh queryset with tenant filtering,
        THEN pass it through the mixin chain.
        """
        # If we have a class-level queryset, replace it with a fresh tenant-scoped one
        if hasattr(self, 'queryset') and self.queryset is not None:
            model = self.queryset.model
            # Temporarily replace queryset so mixins process the fresh tenant-scoped version
            original_queryset = self.queryset
            self.queryset = model.objects.all()

            # Call super() to let mixins process the fresh queryset
            # MRO: OptimizedQuerysetMixin → ArchivingViewSetMixin → ModelViewSet
            result = super().get_queryset()

            # Restore original to avoid side effects on other requests
            self.queryset = original_queryset
            return result
        else:
            # No class-level queryset, just let mixins handle it
            return super().get_queryset()


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

    def get_queryset(self):
        """Re-evaluate queryset at request time for tenant context"""
        if hasattr(self, 'queryset') and self.queryset is not None:
            queryset = self.queryset.model.objects.all()
        else:
            queryset = super().get_queryset()
        return queryset


class BaseAPIView(viewsets.GenericViewSet):
    """
    Base class for custom API views that need standard project configuration.
    """
    
    pagination_class = StandardPagination
    
    def get_queryset(self):
        """Override in child classes"""
        raise NotImplementedError("Child classes must implement get_queryset")
