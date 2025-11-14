from django_filters import rest_framework as filters
from .models import ManagerApprovalRequest, ApprovalStatus, ActionType


class ManagerApprovalRequestFilter(filters.FilterSet):
    """
    Filter for ManagerApprovalRequest queryset.

    Supports filtering by:
    - status (exact or multiple)
    - action_type (exact or multiple)
    - store_location (exact)
    - initiator (exact)
    - approver (exact)
    - created_at (date range)
    - expires_at (date range)
    """

    # Status filtering (supports multiple)
    status = filters.MultipleChoiceFilter(
        choices=ApprovalStatus.choices,
        help_text="Filter by status. Can specify multiple: ?status=PENDING&status=APPROVED"
    )

    # Action type filtering (supports multiple)
    action_type = filters.MultipleChoiceFilter(
        choices=ActionType.choices,
        help_text="Filter by action type. Can specify multiple."
    )

    # Store location filtering
    store_location = filters.UUIDFilter(
        field_name='store_location__id',
        help_text="Filter by store location ID"
    )

    # User filtering
    initiator = filters.UUIDFilter(
        field_name='initiator__id',
        help_text="Filter by initiator user ID"
    )

    approver = filters.UUIDFilter(
        field_name='approver__id',
        help_text="Filter by approver user ID"
    )

    # Date range filtering
    created_after = filters.DateTimeFilter(
        field_name='created_at',
        lookup_expr='gte',
        help_text="Filter requests created after this datetime"
    )

    created_before = filters.DateTimeFilter(
        field_name='created_at',
        lookup_expr='lte',
        help_text="Filter requests created before this datetime"
    )

    expires_after = filters.DateTimeFilter(
        field_name='expires_at',
        lookup_expr='gte',
        help_text="Filter requests expiring after this datetime"
    )

    expires_before = filters.DateTimeFilter(
        field_name='expires_at',
        lookup_expr='lte',
        help_text="Filter requests expiring before this datetime"
    )

    # Pending and non-expired (for manager queues)
    is_actionable = filters.BooleanFilter(
        method='filter_is_actionable',
        help_text="If true, only show pending and non-expired requests"
    )

    class Meta:
        model = ManagerApprovalRequest
        fields = [
            'status',
            'action_type',
            'store_location',
            'initiator',
            'approver',
            'order',
            'discount',
        ]

    def filter_is_actionable(self, queryset, name, value):
        """
        Filter for actionable requests (PENDING and not expired).
        Used for manager approval queues.
        """
        if value:
            from django.utils import timezone
            return queryset.filter(
                status=ApprovalStatus.PENDING,
                expires_at__gt=timezone.now()
            )
        return queryset
