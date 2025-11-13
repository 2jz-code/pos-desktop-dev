"""
Custom filter backends for the project.

This module provides a custom DjangoFilterBackend that automatically
uses our BaseFilterSet with FlexibleDateTimeFilter for all views.
"""

import logging
logger = logging.getLogger(__name__)
logger.info("🔥🔥🔥 core_backend.filter_backends module loaded! 🔥🔥🔥")

from django_filters.rest_framework import DjangoFilterBackend


class ProjectFilterBackend(DjangoFilterBackend):
    """
    Custom filter backend that uses BaseFilterSet as the default base class.

    This ensures all DateTimeField filters throughout the project automatically
    use FlexibleDateTimeFilter, allowing date-only inputs like "2025-11-11" to
    work intuitively as full-day ranges.

    Usage in views:
        class MyViewSet(viewsets.ModelViewSet):
            filterset_fields = {
                'created_at': ['gte', 'lte', 'exact'],
                'status': ['exact'],
            }

    The above will automatically use FlexibleDateTimeFilter for created_at filters,
    so queries like ?created_at__gte=2025-11-11&created_at__lte=2025-11-11 will
    return all records from that entire day.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        logger.info("🎯 ProjectFilterBackend instance created!")

    @property
    def filterset_base(self):
        """Lazy import to avoid circular dependency"""
        from core_backend.base.filters import BaseFilterSet
        return BaseFilterSet

    def get_filterset_class(self, view, queryset=None):
        """
        Return the filterset class to use, ensuring BaseFilterSet is the base.

        When filterset_fields is a dict like {"created_at": ["gte", "lte"]},
        we manually create FlexibleDateTimeFilter instances for DateTimeFields.
        """
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"ProjectFilterBackend.get_filterset_class called for view: {view.__class__.__name__}")

        from django.db import models
        from core_backend.base.filters import FlexibleDateTimeFilter

        filterset_class = super().get_filterset_class(view, queryset)
        logger.info(f"  - super().get_filterset_class returned: {filterset_class}")

        # If a filterset_class is explicitly defined on the view, use it
        if filterset_class:
            return filterset_class

        # Otherwise, create one dynamically with BaseFilterSet as the base
        filterset_fields = getattr(view, 'filterset_fields', None)

        if filterset_fields:
            model = queryset.model if queryset is not None else view.queryset.model

            # When filterset_fields is a dict, we need to manually generate filters
            if isinstance(filterset_fields, dict):
                import logging
                logger = logging.getLogger(__name__)

                # Build filter attributes dictionary and track DateTime fields
                filter_attrs = {}
                datetime_fields = set()
                remaining_fields = {}

                for field_name, lookups in filterset_fields.items():
                    # Get the model field
                    try:
                        model_field = model._meta.get_field(field_name)
                    except:
                        remaining_fields[field_name] = lookups
                        continue

                    # For DateTimeFields, use FlexibleDateTimeFilter
                    if isinstance(model_field, models.DateTimeField):
                        datetime_fields.add(field_name)
                        logger.info(f"ProjectFilterBackend: Creating FlexibleDateTimeFilter for {field_name} with lookups {lookups}")
                        for lookup in lookups:
                            filter_name = f"{field_name}__{lookup}" if lookup != 'exact' else field_name
                            filter_attrs[filter_name] = FlexibleDateTimeFilter(
                                field_name=field_name,
                                lookup_expr=lookup
                            )
                            logger.info(f"  - Created filter: {filter_name} (lookup_expr={lookup})")
                    else:
                        # Keep non-DateTime fields for Meta.fields
                        remaining_fields[field_name] = lookups

                # Build a dynamic FilterSet class with only non-DateTime fields in Meta
                # (DateTime filters are added manually to avoid django-filters auto-generation)
                class AutoFilterSet(self.filterset_base):
                    class Meta:
                        model = model
                        fields = remaining_fields  # Exclude DateTime fields

                # Add the explicit FlexibleDateTimeFilter instances
                for name, filter_instance in filter_attrs.items():
                    setattr(AutoFilterSet, name, filter_instance)

                logger.info(f"ProjectFilterBackend: Created AutoFilterSet with {len(filter_attrs)} DateTime filters and {len(remaining_fields)} other filters")

                return AutoFilterSet
            else:
                # Simple list format - use default behavior with our base
                class AutoFilterSet(self.filterset_base):
                    class Meta:
                        model = model
                        fields = filterset_fields

                return AutoFilterSet

        return None
