"""
Admin mixins for dependency-aware archiving functionality.

Provides enhanced admin actions that validate dependencies and show
warnings before archiving categories and product types.
"""

from django.contrib import admin, messages
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.urls import path
from django.shortcuts import get_object_or_404, redirect
from django.contrib.admin.utils import unquote

from .dependency_service import DependencyValidationService
from .models import Category, ProductType


class DependencyAwareArchivingMixin:
    """
    Mixin that provides dependency-aware archiving actions for admin.
    """
    
    def get_urls(self):
        """Add custom URL patterns for confirmation views."""
        urls = super().get_urls()
        info = self.model._meta.app_label, self.model._meta.model_name
        
        custom_urls = [
            path(
                '<path:object_id>/confirm-archive/',
                self.admin_site.admin_view(self.confirm_archive_view),
                name='%s_%s_confirm_archive' % info,
            ),
        ]
        return custom_urls + urls
    
    def confirm_archive_view(self, request, object_id):
        """Show confirmation page with dependency information before archiving."""
        obj = get_object_or_404(self.model, pk=unquote(object_id))
        
        if request.method == 'POST':
            # Process the archiving
            force = request.POST.get('force') == 'true'
            handle_products = request.POST.get('handle_products', 'set_null')
            
            try:
                if isinstance(obj, Category):
                    obj.archive(archived_by=request.user, force=force, handle_products=handle_products)
                    messages.success(request, f'Category "{obj.name}" has been archived successfully.')
                elif isinstance(obj, ProductType):
                    obj.archive(archived_by=request.user, force=force)
                    messages.success(request, f'Product type "{obj.name}" has been archived successfully.')
                
                return redirect(f'admin:{obj._meta.app_label}_{obj._meta.model_name}_changelist')
                
            except ValueError as e:
                messages.error(request, str(e))
                return redirect(f'admin:{obj._meta.app_label}_{obj._meta.model_name}_change', object_id)
        
        # GET request - show confirmation page
        validation_data = self._get_validation_data(obj)
        
        context = dict(
            self.admin_site.each_context(request),
            opts=self.model._meta,
            object=obj,
            validation_data=validation_data,
        )
        
        return TemplateResponse(
            request,
            'admin/products/confirm_archive.html',
            context,
        )
    
    def _get_validation_data(self, obj):
        """Get validation data for the confirmation page."""
        if isinstance(obj, Category):
            return DependencyValidationService.validate_category_archiving(obj, force=False)
        elif isinstance(obj, ProductType):
            return DependencyValidationService.validate_product_type_archiving(obj, force=False)
        return None
    
    @admin.action(description='Archive selected items (with dependency check)')
    def archive_with_dependency_check(self, request, queryset):
        """Archive selected items after checking dependencies."""
        if queryset.count() == 1:
            # Single item - redirect to confirmation page
            obj = queryset.first()
            return redirect(f'admin:{obj._meta.app_label}_{obj._meta.model_name}_confirm_archive', obj.pk)
        
        # Multiple items - show bulk confirmation
        validation_results = []
        can_archive_all = True
        
        for obj in queryset:
            validation = self._get_validation_data(obj)
            validation_results.append({
                'object': obj,
                'validation': validation,
            })
            if not validation['can_archive']:
                can_archive_all = False
        
        if can_archive_all:
            # Archive all items
            archived_count = 0
            for obj in queryset:
                try:
                    obj.archive(archived_by=request.user)
                    archived_count += 1
                except Exception as e:
                    messages.error(request, f'Error archiving {obj}: {e}')
            
            messages.success(
                request,
                f'Successfully archived {archived_count} {queryset.model._meta.verbose_name_plural}.'
            )
        else:
            # Show warnings for items that cannot be archived
            warnings = []
            for result in validation_results:
                if not result['validation']['can_archive']:
                    warnings.extend(result['validation']['warnings'])
            
            messages.warning(
                request,
                f"Some items cannot be archived: {'; '.join(warnings[:3])}{'...' if len(warnings) > 3 else ''}"
            )
    
    def get_actions(self, request):
        """Add custom archiving action to admin actions."""
        actions = super().get_actions(request)
        actions['archive_with_dependency_check'] = (
            self.archive_with_dependency_check,
            'archive_with_dependency_check',
            self.archive_with_dependency_check.short_description
        )
        return actions


class CategoryDependencyAdminMixin(DependencyAwareArchivingMixin):
    """
    Admin mixin specifically for Category model with dependency checking.
    """
    
    def get_list_display(self, request):
        """Add dependency count to list display."""
        list_display = list(super().get_list_display(request))
        if 'get_dependent_products_count' not in list_display:
            list_display.append('get_dependent_products_count')
        return list_display
    
    @admin.display(description='Dependent Products')
    def get_dependent_products_count(self, obj):
        """Display count of products that depend on this category."""
        if not obj.pk:
            return '-'
        
        count = obj.products.filter(is_active=True).count()
        if count > 0:
            return f"{count} products"
        return "None"


class ProductTypeDependencyAdminMixin(DependencyAwareArchivingMixin):
    """
    Admin mixin specifically for ProductType model with dependency checking.
    """
    
    def get_list_display(self, request):
        """Add dependency count to list display."""
        list_display = list(super().get_list_display(request))
        if 'get_dependent_products_count' not in list_display:
            list_display.append('get_dependent_products_count')
        return list_display
    
    @admin.display(description='Dependent Products')
    def get_dependent_products_count(self, obj):
        """Display count of products that depend on this product type."""
        if not obj.pk:
            return '-'
        
        count = obj.products.filter(is_active=True).count()
        if count > 0:
            return f"{count} products"
        return "None"