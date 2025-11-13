import django_filters
from django.db import models
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from datetime import datetime, time, timedelta
import logging

logger = logging.getLogger(__name__)


def normalize_datetime_value(value, *, is_end=False):
    """
    Normalize a date or datetime string to a timezone-aware datetime.

    Args:
        value: Can be a string (date or datetime), date object, or datetime object
        is_end: If True and value is date-only, returns end of day (23:59:59.999999)
                If False, returns start of day (00:00:00)

    Returns:
        Timezone-aware datetime object

    Examples:
        normalize_datetime_value("2025-11-11", is_end=False)  # 2025-11-11 00:00:00
        normalize_datetime_value("2025-11-11", is_end=True)   # 2025-11-11 23:59:59.999999
        normalize_datetime_value("2025-11-11T10:30:00Z")      # 2025-11-11 10:30:00 (unchanged)
    """
    if not value:
        return value

    # If already a datetime, make sure it's timezone-aware
    if isinstance(value, datetime):
        if timezone.is_naive(value):
            return timezone.make_aware(value)
        return value

    # If it's a date object, convert to datetime
    if hasattr(value, 'year') and not isinstance(value, datetime):
        # It's a date object
        if is_end:
            dt = datetime.combine(value, time.max)
        else:
            dt = datetime.combine(value, time.min)
        return timezone.make_aware(dt)

    # Try parsing as datetime first (includes time component)
    if isinstance(value, str):
        # Try full datetime parse
        dt = parse_datetime(value)
        if dt:
            if timezone.is_naive(dt):
                return timezone.make_aware(dt)
            return dt

        # Try date-only parse
        date_obj = parse_date(value)
        if date_obj:
            if is_end:
                dt = datetime.combine(date_obj, time.max)
            else:
                dt = datetime.combine(date_obj, time.min)
            return timezone.make_aware(dt)

    # Return as-is if we can't parse it
    return value


class FlexibleDateTimeFilter(django_filters.DateTimeFilter):
    """
    A DateTimeFilter that intelligently handles date-only inputs.

    When a date-only value like "2025-11-11" is provided:
    - For 'gte'/'gt' lookups: Uses start of day (00:00:00)
    - For 'lte'/'lt' lookups: Uses end of day (23:59:59.999999)
    - For 'exact' lookups: Uses start of day

    When a full datetime is provided (e.g., "2025-11-11T10:30:00Z"):
    - Uses the exact time as specified
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Store the lookup expression for later use
        self._lookup_expr = self.lookup_expr

    def filter(self, qs, value):
        # If value is already a datetime with time=00:00:00, it was likely parsed from a date-only string
        # Check if we need to adjust it to end of day for lte/lt lookups
        if isinstance(value, datetime) and value.time() == time(0, 0, 0):
            is_end = self.lookup_expr in ['lte', 'lt']

            if is_end:
                # Convert to end of day (23:59:59.999999)
                value = datetime.combine(value.date(), time.max)
                if timezone.is_naive(value):
                    value = timezone.make_aware(value)
                logger.info(f"FlexibleDateTimeFilter: Adjusted {self.field_name}__{self.lookup_expr} to end of day: {value}")
            else:
                logger.info(f"FlexibleDateTimeFilter: Kept {self.field_name}__{self.lookup_expr} at start of day: {value}")

        return super().filter(qs, value)


class BaseFilterSet(django_filters.FilterSet):
    """
    Base filter set with common filtering patterns.

    Automatically uses FlexibleDateTimeFilter for all DateTimeField filters,
    allowing date-only inputs like "2025-11-11" to work intuitively as full-day ranges.
    """

    # Common date range filters
    created_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    updated_after = django_filters.DateTimeFilter(field_name='updated_at', lookup_expr='gte')
    updated_before = django_filters.DateTimeFilter(field_name='updated_at', lookup_expr='lte')

    # Active/inactive filtering (for models with is_active field)
    is_active = django_filters.BooleanFilter()

    @classmethod
    def filter_for_field(cls, field, field_name, lookup_expr='exact'):
        """
        Override filter_for_field to use FlexibleDateTimeFilter for DateTimeFields.
        This method is called by django-filters when auto-generating filters.
        """
        # For DateTimeField, use our FlexibleDateTimeFilter
        if isinstance(field, models.DateTimeField):
            return FlexibleDateTimeFilter(field_name=field_name, lookup_expr=lookup_expr)

        # For all other fields, use the default behavior
        return super().filter_for_field(field, field_name, lookup_expr)

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
