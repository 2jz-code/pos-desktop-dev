import django_filters
from django.db import models


class BaseFilterSet(django_filters.FilterSet):
    """
    Base filter set with common filtering patterns.
    """
    
    # Common date range filters
    created_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    updated_after = django_filters.DateTimeFilter(field_name='updated_at', lookup_expr='gte')
    updated_before = django_filters.DateTimeFilter(field_name='updated_at', lookup_expr='lte')
    
    # Active/inactive filtering (for models with is_active field)
    is_active = django_filters.BooleanFilter()
    
    class Meta:
        abstract = True


class ArchivingFilterSet(BaseFilterSet):
    """
    Filter set for models that support archiving.
    """
    
    # Archive status filtering
    include_archived = django_filters.BooleanFilter(method='filter_archived')
    archived_only = django_filters.BooleanFilter(method='filter_archived_only')
    
    def filter_archived(self, queryset, name, value):
        """Include archived records if value is True"""
        if value and hasattr(queryset, 'with_archived'):
            return queryset.with_archived()
        return queryset
    
    def filter_archived_only(self, queryset, name, value):
        """Show only archived records if value is True"""
        if value:
            if hasattr(queryset, 'archived_only'):
                return queryset.archived_only()
            else:
                return queryset.filter(is_active=False)
        return queryset
    
    class Meta:
        abstract = True
