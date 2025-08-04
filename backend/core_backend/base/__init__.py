"""
Core backend base components.

This package provides foundational classes and utilities that should be used
throughout the Django application for consistency and maintainability.
"""

from .viewsets import BaseViewSet, ReadOnlyBaseViewSet, BaseAPIView
from .serializers import (
    BaseModelSerializer, 
    BasicProductSerializer, 
    BasicCategorySerializer,
    TimestampedSerializer
)
from .mixins import OptimizedQuerysetMixin, ArchivingViewSetMixin
from .filters import BaseFilterSet, ArchivingFilterSet

__all__ = [
    # ViewSets
    'BaseViewSet',
    'ReadOnlyBaseViewSet', 
    'BaseAPIView',
    
    # Serializers
    'BaseModelSerializer',
    'BasicProductSerializer',
    'BasicCategorySerializer', 
    'TimestampedSerializer',
    
    # Mixins
    'OptimizedQuerysetMixin',
    'ArchivingViewSetMixin',
    
    # Filters
    'BaseFilterSet',
    'ArchivingFilterSet',
]
