"""
Custom managers for products app models.

Provides specialized managers for models that need custom queryset behavior,
particularly for MPTT models with archiving functionality.
"""

from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from mptt.managers import TreeManager
from mptt.querysets import TreeQuerySet

from tenant.managers import get_current_tenant


class CategoryQuerySet(TreeQuerySet):
    """
    Custom QuerySet for Category model that provides archiving functionality
    while maintaining MPTT tree structure.
    """
    
    def active(self):
        """Return only active (non-archived) categories."""
        return self.filter(is_active=True)
    
    def archived(self):
        """Return only archived categories."""
        return self.filter(is_active=False)
    
    def with_archived(self):
        """Return all categories including archived ones."""
        return self
    
    def archive(self, archived_by=None):
        """
        Archive (soft delete) all categories in this queryset.
        
        Args:
            archived_by: User instance who performed the archiving
        """
        update_fields = {
            'is_active': False,
            'archived_at': timezone.now()
        }
        if archived_by:
            update_fields['archived_by'] = archived_by
        
        return self.update(**update_fields)
    
    def unarchive(self):
        """
        Unarchive (restore) all categories in this queryset.
        """
        return self.update(
            is_active=True,
            archived_at=None,
            archived_by=None
        )
    
    def hierarchical_order(self):
        """
        Return categories in hierarchical order: parent categories first (by their order),
        then all their subcategories (by their order), then next parent, etc.
        
        This ensures proper hierarchical display where all children of a parent
        appear together before moving to the next parent category.
        """
        from django.db.models import Case, When, F, Value, IntegerField
        
        # Use Django ORM annotations instead of raw SQL for better compatibility
        return self.annotate(
            parent_order=Case(
                When(parent_id__isnull=True, then=F('order')),
                default=F('parent__order'),
                output_field=IntegerField()
            ),
            category_level=Case(
                When(parent_id__isnull=True, then=Value(0)),
                default=Value(1),
                output_field=IntegerField()
            )
        ).order_by('parent_order', 'category_level', 'order', 'name')


class CategoryManager(TreeManager):
    """
    Custom manager for Category model that combines MPTT tree functionality
    with tenant filtering and archiving (soft delete) capabilities.
    """

    def get_queryset(self):
        """Return only active categories for the current tenant."""
        tenant = get_current_tenant()

        # Get base queryset from TreeManager
        qs = super().get_queryset()

        # Apply tenant filter (fail-closed: return empty if no tenant context)
        if tenant:
            qs = qs.filter(tenant=tenant, is_active=True)
        else:
            qs = qs.none()

        return qs

    def with_archived(self):
        """Return all categories (including archived) for the current tenant."""
        tenant = get_current_tenant()

        qs = CategoryQuerySet(self.model, using=self._db)

        if tenant:
            qs = qs.filter(tenant=tenant)
        else:
            qs = qs.none()

        return qs

    def archived_only(self):
        """Return only archived categories for the current tenant."""
        tenant = get_current_tenant()

        qs = CategoryQuerySet(self.model, using=self._db).archived()

        if tenant:
            qs = qs.filter(tenant=tenant)
        else:
            qs = qs.none()

        return qs

    def all_tenants(self):
        """
        Return all categories across all tenants (admin only).
        Bypasses tenant filtering for Django admin and system operations.
        """
        return CategoryQuerySet(self.model, using=self._db)

    def hierarchical_order(self):
        """Return active categories in hierarchical order for current tenant."""
        return self.get_queryset().hierarchical_order()

    def all_hierarchical_order(self):
        """Return all categories (including archived) in hierarchical order for current tenant."""
        return self.with_archived().hierarchical_order()