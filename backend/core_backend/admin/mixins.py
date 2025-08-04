"""
Admin mixins for archiving functionality.

Provides reusable admin components for models using the SoftDeleteMixin.
"""

from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.contrib import messages
from django.utils.html import format_html
from django.utils.safestring import mark_safe


class ArchivingAdminMixin:
    """
    Admin mixin that provides archiving functionality for models using SoftDeleteMixin.
    
    Features:
    - Replaces delete actions with archive actions
    - Adds archive/unarchive admin actions
    - Shows archived status in list view
    - Provides archived record filtering
    """
    
    def get_list_display(self, request):
        """Add archived status to list display if not already present."""
        list_display = list(super().get_list_display(request) if hasattr(super(), 'get_list_display') 
                           else getattr(self, 'list_display', []))
        
        # Add archived status if model has archiving and it's not already in list
        if (hasattr(self.model, 'is_active') and 
            'get_archived_status' not in list_display and 
            'is_active' not in list_display):
            list_display.append('get_archived_status')
        
        return list_display
    
    def get_list_filter(self, request):
        """Add is_active filter if not already present."""
        list_filter = list(super().get_list_filter(request) if hasattr(super(), 'get_list_filter') 
                          else getattr(self, 'list_filter', []))
        
        # Add is_active filter if model has archiving and it's not already there
        if hasattr(self.model, 'is_active') and 'is_active' not in list_filter:
            list_filter.insert(0, 'is_active')  # Add at beginning for prominence
        
        return list_filter
    
    def get_actions(self, request):
        """Replace delete action with archive actions."""
        actions = super().get_actions(request)
        
        # Remove default delete action if model supports archiving
        if hasattr(self.model, 'is_active') and 'delete_selected' in actions:
            del actions['delete_selected']
        
        return actions
    
    def get_queryset(self, request):
        """Include archived records in admin by default (admins should see everything)."""
        queryset = super().get_queryset(request)
        
        # If model uses archiving, show all records (including archived) in admin
        if hasattr(queryset, 'with_archived'):
            queryset = queryset.with_archived()
        
        return queryset
    
    @admin.display(description='Status', boolean=True)
    def get_archived_status(self, obj):
        """Display archived status with visual indicator."""
        if hasattr(obj, 'is_active'):
            return obj.is_active
        return True
    
    @admin.action(description='Archive selected items')
    def archive_selected(self, request, queryset):
        """Archive selected records."""
        if not hasattr(queryset.model, 'is_active'):
            self.message_user(
                request, 
                "This model does not support archiving.", 
                level=messages.ERROR
            )
            return
        
        # Filter to only active records
        active_queryset = queryset.filter(is_active=True)
        count = active_queryset.count()
        
        if count == 0:
            self.message_user(
                request, 
                "No active records selected.", 
                level=messages.WARNING
            )
            return
        
        # Archive the records
        if hasattr(active_queryset, 'archive'):
            active_queryset.archive(archived_by=request.user)
        else:
            # Fallback for individual archiving
            for obj in active_queryset:
                obj.archive(archived_by=request.user)
        
        self.message_user(
            request,
            f"Successfully archived {count} {queryset.model._meta.verbose_name_plural}.",
            level=messages.SUCCESS
        )
    
    @admin.action(description='Unarchive selected items')
    def unarchive_selected(self, request, queryset):
        """Unarchive selected records."""
        if not hasattr(queryset.model, 'is_active'):
            self.message_user(
                request, 
                "This model does not support unarchiving.", 
                level=messages.ERROR
            )
            return
        
        # Filter to only archived records
        archived_queryset = queryset.filter(is_active=False)
        count = archived_queryset.count()
        
        if count == 0:
            self.message_user(
                request, 
                "No archived records selected.", 
                level=messages.WARNING
            )
            return
        
        # Unarchive the records
        if hasattr(archived_queryset, 'unarchive'):
            archived_queryset.unarchive()
        else:
            # Fallback for individual unarchiving
            for obj in archived_queryset:
                obj.unarchive()
        
        self.message_user(
            request,
            f"Successfully unarchived {count} {queryset.model._meta.verbose_name_plural}.",
            level=messages.SUCCESS
        )
    
    @admin.action(description='Permanently delete selected items (DANGER)')
    def force_delete_selected(self, request, queryset):
        """Force delete selected records (hard delete)."""
        count = queryset.count()
        
        if count == 0:
            self.message_user(
                request, 
                "No records selected.", 
                level=messages.WARNING
            )
            return
        
        # Perform hard delete
        for obj in queryset:
            if hasattr(obj, 'force_delete'):
                obj.force_delete()
            else:
                obj.delete()
        
        self.message_user(
            request,
            f"Permanently deleted {count} {queryset.model._meta.verbose_name_plural}.",
            level=messages.WARNING
        )
    
    actions = ['archive_selected', 'unarchive_selected', 'force_delete_selected']
    
    def get_readonly_fields(self, request, obj=None):
        """Make archiving fields readonly."""
        readonly_fields = list(super().get_readonly_fields(request, obj) if hasattr(super(), 'get_readonly_fields') 
                              else getattr(self, 'readonly_fields', []))
        
        # Add archiving fields as readonly if model supports it
        if hasattr(self.model, 'is_active'):
            archiving_fields = ['archived_at', 'archived_by']
            for field in archiving_fields:
                if hasattr(self.model, field) and field not in readonly_fields:
                    readonly_fields.append(field)
        
        return readonly_fields
    
    def get_fieldsets(self, request, obj=None):
        """Add archiving fieldset if not already present."""
        fieldsets = super().get_fieldsets(request, obj) if hasattr(super(), 'get_fieldsets') else None
        
        if not fieldsets:
            return fieldsets
        
        # Check if model supports archiving and fieldsets don't already include archiving info
        if hasattr(self.model, 'is_active'):
            # Check if any fieldset already contains archiving fields
            has_archiving_fields = False
            archiving_fields = {'is_active', 'archived_at', 'archived_by'}
            
            for name, opts in fieldsets:
                if 'fields' in opts:
                    fields = set(opts['fields'])
                    if fields.intersection(archiving_fields):
                        has_archiving_fields = True
                        break
            
            # Add archiving fieldset if not present
            if not has_archiving_fields:
                archiving_fieldset = (
                    'Archiving Status', 
                    {
                        'fields': ('is_active', 'archived_at', 'archived_by'),
                        'classes': ('collapse',),
                        'description': 'Archive status and metadata. Archived records are hidden from normal operations.'
                    }
                )
                fieldsets = list(fieldsets) + [archiving_fieldset]
        
        return fieldsets


class ReadOnlyArchivingAdminMixin(ArchivingAdminMixin):
    """
    A variant of ArchivingAdminMixin that makes archived records completely read-only.
    Useful for models where archived records should never be modified.
    """
    
    def get_readonly_fields(self, request, obj=None):
        """Make all fields readonly for archived records."""
        readonly_fields = super().get_readonly_fields(request, obj)
        
        # If this is an archived record, make all fields readonly
        if obj and hasattr(obj, 'is_active') and not obj.is_active:
            # Get all field names from the model
            all_fields = [field.name for field in obj._meta.get_fields() 
                         if not field.many_to_many and not field.one_to_many]
            return all_fields
        
        return readonly_fields
    
    def has_change_permission(self, request, obj=None):
        """Restrict change permissions for archived records."""
        if obj and hasattr(obj, 'is_active') and not obj.is_active:
            # Allow viewing but not editing archived records
            return False
        return super().has_change_permission(request, obj)