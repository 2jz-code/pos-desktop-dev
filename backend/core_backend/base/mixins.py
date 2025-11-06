from rest_framework.viewsets import ViewSetMixin
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status, serializers
from django.db.models import Prefetch
from .permissions import CanArchiveRecords, CanUnarchiveRecords, CanForceDelete, CanViewArchived


class OptimizedQuerysetMixin(ViewSetMixin):
    """
    A ViewSet mixin that automatically optimizes the queryset by recursively
    inspecting the associated serializer and its nested serializers for
    `select_related_fields` and `prefetch_related_fields` attributes in their
    Meta classes.
    """

    def _get_nested_optimizations(self, serializer_class, base_path=""):
        """
        Recursively find all select_related and prefetch_related fields
        from a serializer and its nested serializers.
        """
        select_related = set()
        prefetch_related = set()

        if not hasattr(serializer_class, "Meta"):
            return select_related, prefetch_related

        meta = getattr(serializer_class, "Meta")
        model = getattr(meta, "model", None)

        # Get optimizations from the current serializer
        for field in getattr(meta, "select_related_fields", []):
            select_related.add(f"{base_path}{field}")

        for field in getattr(meta, "prefetch_related_fields", []):
            # Handle Prefetch objects correctly
            if isinstance(field, Prefetch):
                if base_path:
                    # For nested prefetch, we need to adjust the prefetch_to path
                    prefetch_related.add(Prefetch(f"{base_path}{field.prefetch_to}", queryset=field.queryset))
                else:
                    prefetch_related.add(field)
            else:
                prefetch_related.add(f"{base_path}{field}")

        # Temporarily disable recursive optimization to prevent over-optimization
        # The explicit optimization fields in serializer Meta classes are sufficient
        # TODO: Re-enable with smarter field mapping once manual optimizations are complete
        pass

        return select_related, prefetch_related

    def get_queryset(self):
        """
        Overrides the default get_queryset to apply optimizations based on
        the current action's serializer and its nested serializers.
        """
        queryset = super().get_queryset()

        try:
            serializer_class = self.get_serializer_class()
        except (AttributeError, AssertionError):
            return queryset

        select_related, prefetch_related = self._get_nested_optimizations(serializer_class)

        if select_related:
            queryset = queryset.select_related(*select_related)

        if prefetch_related:
            queryset = queryset.prefetch_related(*prefetch_related)

        return queryset


class SerializerOptimizedMixin:
    """
    Mixin for APIView/GenericAPIView that applies serializer optimization fields.
    Useful for views that don't inherit from ViewSetMixin but still want optimization.

    IMPORTANT: When using this mixin, child classes should override get_queryset() to
    re-evaluate their queryset at request time for proper tenant context.
    """

    def get_queryset(self):
        queryset = super().get_queryset()

        # Get serializer class and apply optimizations
        serializer_class = self.get_serializer_class()
        if hasattr(serializer_class, "Meta"):
            meta = getattr(serializer_class, "Meta")

            # Apply select_related for foreign key relationships
            if hasattr(meta, "select_related_fields") and meta.select_related_fields:
                queryset = queryset.select_related(*meta.select_related_fields)

            # Apply prefetch_related for many-to-many or reverse foreign key
            if hasattr(meta, "prefetch_related_fields") and meta.prefetch_related_fields:
                queryset = queryset.prefetch_related(*meta.prefetch_related_fields)

        return queryset


class ArchivingViewSetMixin(ViewSetMixin):
    """
    A ViewSet mixin that provides archiving functionality for models using SoftDeleteMixin.
    
    Features:
    - Automatically filters out archived records by default
    - Supports ?include_archived=true query parameter to include archived records
    - Provides archive/unarchive actions
    - Handles bulk archiving operations
    """
    
    def get_queryset(self):
        """
        Override queryset to handle archiving based on query parameters.
        """
        queryset = super().get_queryset()
        
        # Check if the model uses our archiving system
        if hasattr(queryset.model, 'is_active'):
            # Check for include_archived parameter
            include_archived = self.request.query_params.get('include_archived', '').lower()
            
            if include_archived in ['true', '1', 'yes']:
                # Include archived records - use with_archived if available
                if hasattr(queryset, 'with_archived'):
                    queryset = queryset.with_archived()
                # If no custom manager, don't filter (assumes default queryset includes all)
            elif include_archived == 'only':
                # Show only archived records - need to start fresh to avoid SoftDeleteManager filtering
                if hasattr(queryset.model, '_default_manager'):
                    # Get a fresh queryset that includes all records
                    base_queryset = queryset.model._default_manager.with_archived() if hasattr(queryset.model._default_manager, 'with_archived') else queryset.model._default_manager.all()
                    queryset = base_queryset.filter(is_active=False)
                else:
                    queryset = queryset.filter(is_active=False)
            # Default: show only active records (handled by SoftDeleteManager)
        
        return queryset
    
    @action(detail=True, methods=['post', 'patch'], permission_classes=[CanArchiveRecords])
    def archive(self, request, pk=None):
        """
        Archive a single record.
        """
        obj = self.get_object()
        
        if not hasattr(obj, 'archive'):
            return Response(
                {'error': 'This model does not support archiving.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not obj.is_active:
            return Response(
                {'error': 'Record is already archived.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        obj.archive(archived_by=request.user if request.user.is_authenticated else None)
        
        return Response(
            {'message': f'{obj._meta.verbose_name} archived successfully.'},
            status=status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['post', 'patch'], permission_classes=[CanUnarchiveRecords])
    def unarchive(self, request, pk=None):
        """
        Unarchive a single record.
        """
        # Use base queryset to avoid custom filtering that might exclude archived records
        model = self.get_queryset().model
        if hasattr(model, '_default_manager') and hasattr(model._default_manager, 'with_archived'):
            queryset = model._default_manager.with_archived()
        else:
            # Fallback: use base queryset without filtering
            queryset = model._default_manager.all()
        
        try:
            obj = queryset.get(pk=pk)
        except queryset.model.DoesNotExist:
            return Response(
                {'error': 'Record not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not hasattr(obj, 'unarchive'):
            return Response(
                {'error': 'This model does not support unarchiving.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if obj.is_active:
            return Response(
                {'error': 'Record is not archived.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        obj.unarchive()
        
        return Response(
            {'message': f'{obj._meta.verbose_name} unarchived successfully.'},
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['post'], permission_classes=[CanArchiveRecords])
    def bulk_archive(self, request):
        """
        Archive multiple records by their IDs.
        Expected payload: {"ids": [1, 2, 3]}
        """
        ids = request.data.get('ids', [])
        
        if not ids:
            return Response(
                {'error': 'No IDs provided.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.get_queryset().filter(pk__in=ids, is_active=True)
        
        if not hasattr(queryset, 'archive'):
            return Response(
                {'error': 'This model does not support bulk archiving.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        archived_count = queryset.archive(
            archived_by=request.user if request.user.is_authenticated else None
        )
        
        return Response(
            {
                'message': f'{archived_count} records archived successfully.',
                'archived_count': archived_count
            },
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['post'], permission_classes=[CanUnarchiveRecords])
    def bulk_unarchive(self, request):
        """
        Unarchive multiple records by their IDs.
        Expected payload: {"ids": [1, 2, 3]}
        """
        ids = request.data.get('ids', [])
        
        if not ids:
            return Response(
                {'error': 'No IDs provided.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get queryset that includes archived records
        queryset = self.get_queryset()
        if hasattr(queryset, 'with_archived'):
            queryset = queryset.with_archived()
        
        queryset = queryset.filter(pk__in=ids, is_active=False)
        
        if not hasattr(queryset, 'unarchive'):
            return Response(
                {'error': 'This model does not support bulk unarchiving.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        unarchived_count = queryset.unarchive()
        
        return Response(
            {
                'message': f'{unarchived_count} records unarchived successfully.',
                'unarchived_count': unarchived_count
            },
            status=status.HTTP_200_OK
        )


class TenantScopedQuerysetMixin:
    """
    Automatically filters queryset by request.tenant.

    Usage:
        class ProductViewSet(TenantScopedQuerysetMixin, BaseViewSet):
            # Queryset is automatically tenant-filtered

    For global access (admin/background jobs), set:
        allow_global_access = True

    Example:
        class ProductAdminViewSet(TenantScopedQuerysetMixin, BaseViewSet):
            allow_global_access = True  # Superuser can see all tenants
    """

    # Override in viewset to allow superuser/admin/background job access
    allow_global_access = False

    def get_queryset(self):
        qs = super().get_queryset()

        # Only filter if model has tenant field
        if not hasattr(qs.model, 'tenant'):
            return qs  # Model is not tenant-aware, skip filtering

        # Check if request has tenant context
        if not hasattr(self.request, 'tenant'):
            # FAIL LOUD: No tenant context when model requires it
            if not self.allow_global_access:
                raise ValueError(
                    f"{self.__class__.__name__} requires tenant context. "
                    f"Set allow_global_access=True for admin/background jobs."
                )
            return qs  # Allow global access for admin/background jobs

        # Normal tenant filtering
        if self.request.tenant:
            qs = qs.filter(tenant=self.request.tenant)
        elif self.request.user.is_superuser or self.request.user.is_staff:
            # Superuser/staff can access all tenants
            # (Admin interface scenario)
            pass  # Return unfiltered queryset
        elif not self.allow_global_access:
            # FAIL LOUD: Tenant-aware model but no tenant and not admin
            raise ValueError(
                f"{self.__class__.__name__}: No tenant context for non-admin user. "
                f"This likely indicates a middleware issue."
            )

        return qs


class FieldsetQueryParamsMixin:
    """
    Parses standard query params and injects into serializer context.

    Supported params:
    - ?view=list|detail|pos|sync (selects fieldset)
    - ?fields=id,name,price (ad-hoc field filtering)
    - ?expand=category,taxes (relationship expansion)

    Usage:
        class ProductViewSet(TenantScopedQuerysetMixin, FieldsetQueryParamsMixin, BaseViewSet):
            serializer_class = ProductSerializer  # Uses FieldsetMixin

            # Optional: Override default view mode logic
            def _get_default_view_mode(self):
                action = getattr(self, 'action', None)
                if action == 'list' and self.is_pos_request():
                    return 'pos'
                return super()._get_default_view_mode()

    Note: Name changed from QueryParamsMixin to FieldsetQueryParamsMixin for clarity.
    """

    def get_serializer_context(self):
        context = super().get_serializer_context()

        # Smart default: map action → view_mode automatically
        default_view = self._get_default_view_mode()
        view_mode = self.request.query_params.get('view', default_view)

        fields_param = self.request.query_params.get('fields', '')
        expand_param = self.request.query_params.get('expand', '')

        # Convert to appropriate types
        requested_fields = [f.strip() for f in fields_param.split(',') if f.strip()]
        expand = {e.strip() for e in expand_param.split(',') if e.strip()}

        context.update({
            'view_mode': view_mode,
            'requested_fields': requested_fields if requested_fields else None,
            'expand': expand,
        })

        return context

    def _get_default_view_mode(self):
        """
        Override this to change default view mode per action or client type.

        Examples:
            # Different view for POS vs web
            if self.request.headers.get('X-Client-Type') == 'POS':
                return 'pos'

            # Different view based on action
            if self.action == 'list':
                return 'list'
        """
        action = getattr(self, 'action', None)

        # Smart defaults
        if action == 'list':
            return 'list'
        elif action in ['retrieve', 'create', 'update', 'partial_update']:
            return 'detail'
        else:
            return 'detail'

