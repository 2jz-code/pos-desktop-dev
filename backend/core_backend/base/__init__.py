"""
Core backend base components.

This package provides foundational classes and utilities that should be used
throughout the Django application for consistency and maintainability.
"""

from .viewsets import BaseViewSet, ReadOnlyBaseViewSet, BaseAPIView
from .serializers import (
    BaseModelSerializer,
    TimestampedSerializer
)
from .mixins import OptimizedQuerysetMixin, ArchivingViewSetMixin, SerializerOptimizedMixin
from .filters import BaseFilterSet, ArchivingFilterSet

__all__ = [
    # ViewSets
    'BaseViewSet',
    'ReadOnlyBaseViewSet',
    'BaseAPIView',

    # Serializers
    'BaseModelSerializer',
    'TimestampedSerializer',

    # Mixins
    'OptimizedQuerysetMixin',
    'ArchivingViewSetMixin',
    'SerializerOptimizedMixin',

    # Filters
    'BaseFilterSet',
    'ArchivingFilterSet',
]
