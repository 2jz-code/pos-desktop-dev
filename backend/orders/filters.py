import django_filters
from django.db.models import Q
from core_backend.base.filters import BaseFilterSet
from .models import Order


class OrderFilter(BaseFilterSet):
    """
    Custom filter for Orders with smart date range filtering.

    When date_range_gte/lte is provided:
    - Shows orders where created_at OR completed_at falls in the range
    - Can be refined with date_filter_type: 'created', 'completed', or 'all' (default)
    """

    # Date range filters that apply to BOTH created_at and completed_at
    date_range_gte = django_filters.DateFilter(method='filter_date_range_start')
    date_range_lte = django_filters.DateFilter(method='filter_date_range_end')

    # Optional: Filter by specific date type
    date_filter_type = django_filters.ChoiceFilter(
        choices=[('all', 'All Activity'), ('created', 'Created Only'), ('completed', 'Completed Only')],
        method='filter_date_type'
    )

    # Keep individual field filters for backward compatibility
    created_at__gte = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    completed_at__gte = django_filters.DateTimeFilter(field_name='completed_at', lookup_expr='gte')
    completed_at__lte = django_filters.DateTimeFilter(field_name='completed_at', lookup_expr='lte')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Store date range values for use in date_type filter
        self._date_range_start = None
        self._date_range_end = None
        self._date_type = None

    def filter_date_range_start(self, queryset, name, value):
        """Store start date and apply OR filter if end date is also set"""
        self._date_range_start = value
        return self._apply_date_range_filter(queryset)

    def filter_date_range_end(self, queryset, name, value):
        """Store end date and apply OR filter if start date is also set"""
        self._date_range_end = value
        return self._apply_date_range_filter(queryset)

    def filter_date_type(self, queryset, name, value):
        """Store date type filter (applied after range filter)"""
        self._date_type = value
        return queryset  # Will be applied in _apply_date_range_filter

    def _apply_date_range_filter(self, queryset):
        """
        Apply date range filter with OR logic.
        Shows orders where created_at OR completed_at falls in the range.
        Can be refined by date_filter_type.
        """
        from datetime import datetime, time
        from django.utils import timezone

        if not self._date_range_start and not self._date_range_end:
            return queryset

        # Convert date-only inputs to full datetime ranges
        start_datetime = None
        end_datetime = None

        if self._date_range_start:
            # Start of day
            start_datetime = datetime.combine(self._date_range_start, time.min)
            start_datetime = timezone.make_aware(start_datetime)

        if self._date_range_end:
            # End of day (23:59:59.999999)
            end_datetime = datetime.combine(self._date_range_end, time.max)
            end_datetime = timezone.make_aware(end_datetime)

        # Get the date filter type (default to 'all')
        date_type = self._date_type or self.data.get('date_filter_type', 'all')

        # Build Q objects based on filter type
        if date_type == 'created':
            # Only filter by created_at
            q_filter = Q()
            if start_datetime:
                q_filter &= Q(created_at__gte=start_datetime)
            if end_datetime:
                q_filter &= Q(created_at__lte=end_datetime)

        elif date_type == 'completed':
            # Only filter by completed_at
            q_filter = Q()
            if start_datetime:
                q_filter &= Q(completed_at__gte=start_datetime)
            if end_datetime:
                q_filter &= Q(completed_at__lte=end_datetime)

        else:  # 'all' or default
            # OR logic: Show if created OR completed in range
            q_created = Q()
            q_completed = Q()

            if start_datetime:
                q_created &= Q(created_at__gte=start_datetime)
                q_completed &= Q(completed_at__gte=start_datetime)

            if end_datetime:
                q_created &= Q(created_at__lte=end_datetime)
                q_completed &= Q(completed_at__lte=end_datetime)

            q_filter = q_created | q_completed

        return queryset.filter(q_filter)

    class Meta:
        model = Order
        fields = {
            'status': ['exact'],
            'payment_status': ['exact'],
            'order_type': ['exact'],
            'store_location': ['exact'],
        }
