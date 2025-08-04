from rest_framework.viewsets import ViewSetMixin
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from django.db import models
from .permissions import CanArchiveRecords, CanUnarchiveRecords, CanForceDelete, CanViewArchived


class OptimizedQuerysetMixin(ViewSetMixin):
    """
    A ViewSet mixin that automatically optimizes the queryset by inspecting
    the associated serializer for `select_related_fields` and
    `prefetch_related_fields` attributes in its Meta class.
    
    This mixin is action-aware and will use the appropriate serializer
    for the current action when determining optimizations.
    """

    def get_queryset(self):
        """
        Overrides the default get_queryset to apply optimizations based on
        the current action's serializer.
        """
        queryset = super().get_queryset()

        # Get the serializer class for the current action
        # This handles ViewSets that use different serializers for different actions
        try:
            serializer_class = self.get_serializer_class()
        except (AttributeError, AssertionError):
            # If we can't get serializer class (e.g., in admin or tests), skip optimization
            return queryset

        if hasattr(serializer_class, "Meta"):
            meta = getattr(serializer_class, "Meta")

            # Apply select_related for foreign key relationships
            if hasattr(meta, "select_related_fields") and meta.select_related_fields:
                queryset = queryset.select_related(*meta.select_related_fields)

            # Apply prefetch_related for many-to-many or reverse foreign key
            if hasattr(meta, "prefetch_related_fields") and meta.prefetch_related_fields:
                queryset = queryset.prefetch_related(*meta.prefetch_related_fields)

        return queryset


class SerializerOptimizedMixin:
    """
    Mixin for APIView/GenericAPIView that applies serializer optimization fields.
    Useful for views that don't inherit from ViewSetMixin but still want optimization.
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
    
    @action(detail=True, methods=['post'], permission_classes=[CanArchiveRecords])
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
    
    @action(detail=True, methods=['post'], permission_classes=[CanUnarchiveRecords])
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
