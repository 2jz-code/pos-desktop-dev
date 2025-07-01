from rest_framework.viewsets import ViewSetMixin


class OptimizedQuerysetMixin(ViewSetMixin):
    """
    A ViewSet mixin that automatically optimizes the queryset by inspecting
    the associated serializer for `select_related_fields` and
    `prefetch_related_fields` attributes in its Meta class.
    """

    def get_queryset(self):
        """
        Overrides the default get_queryset to apply optimizations.
        """
        queryset = super().get_queryset()

        serializer_class = self.get_serializer_class()
        if hasattr(serializer_class, "Meta"):
            meta = getattr(serializer_class, "Meta")

            # Apply select_related for foreign key relationships
            if hasattr(meta, "select_related_fields"):
                queryset = queryset.select_related(*meta.select_related_fields)

            # Apply prefetch_related for many-to-many or reverse foreign key
            if hasattr(meta, "prefetch_related_fields"):
                queryset = queryset.prefetch_related(*meta.prefetch_related_fields)

        return queryset
