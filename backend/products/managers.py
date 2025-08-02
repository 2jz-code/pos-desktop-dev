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


class CategoryManager(TreeManager):
    """
    Custom manager for Category model that combines MPTT tree functionality
    with archiving (soft delete) capabilities.
    """
    
    def get_queryset(self):
        """Return only active categories by default."""
        return CategoryQuerySet(self.model, using=self._db).active()
    
    def with_archived(self):
        """Return all categories including archived ones."""
        return CategoryQuerySet(self.model, using=self._db)
    
    def archived_only(self):
        """Return only archived categories."""
        return CategoryQuerySet(self.model, using=self._db).archived()