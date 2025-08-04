"""
Soft delete (archiving) infrastructure for the Ajeen POS system.

This module provides reusable components for implementing soft deletes across
all models in the system, ensuring data integrity and audit trails.
"""

from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model


class SoftDeleteQuerySet(models.QuerySet):
    """
    Custom QuerySet that provides soft delete functionality.
    """
    
    def active(self):
        """Return only active (non-archived) records."""
        return self.filter(is_active=True)
    
    def archived(self):
        """Return only archived records."""
        return self.filter(is_active=False)
    
    def with_archived(self):
        """Return all records including archived ones."""
        # Return a fresh queryset without any is_active filtering
        return SoftDeleteQuerySet(self.model, using=self._db)
    
    def archive(self, archived_by=None):
        """
        Archive (soft delete) all records in this queryset.
        
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
        Unarchive (restore) all records in this queryset.
        """
        return self.update(
            is_active=True,
            archived_at=None,
            archived_by=None
        )


class SoftDeleteManager(models.Manager):
    """
    Custom manager that filters out archived records by default.
    """
    
    def get_queryset(self):
        """Return only active records by default."""
        return SoftDeleteQuerySet(self.model, using=self._db).active()
    
    def with_archived(self):
        """Return all records including archived ones."""
        return SoftDeleteQuerySet(self.model, using=self._db)
    
    def archived_only(self):
        """Return only archived records."""
        return SoftDeleteQuerySet(self.model, using=self._db).archived()


class SoftDeleteMixin(models.Model):
    """
    Abstract base class that provides soft delete functionality.
    
    Models inheriting from this mixin will have:
    - is_active field to mark records as archived
    - archived_at timestamp when record was archived
    - archived_by user who archived the record
    - archive() and unarchive() methods
    - Custom manager that filters archived records by default
    """
    
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Designates whether this record is active. "
                  "Inactive records are considered archived/soft-deleted."
    )
    
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when this record was archived."
    )
    
    archived_by = models.ForeignKey(
        get_user_model(),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_archived",
        help_text="User who archived this record."
    )
    
    # Use the custom manager
    objects = SoftDeleteManager()
    
    class Meta:
        abstract = True
    
    def archive(self, archived_by=None):
        """
        Archive (soft delete) this record.
        
        Args:
            archived_by: User instance who performed the archiving
        """
        self.is_active = False
        self.archived_at = timezone.now()
        if archived_by:
            self.archived_by = archived_by
        self.save(update_fields=['is_active', 'archived_at', 'archived_by'])
    
    def unarchive(self):
        """
        Unarchive (restore) this record.
        """
        self.is_active = True
        self.archived_at = None
        self.archived_by = None
        self.save(update_fields=['is_active', 'archived_at', 'archived_by'])
    
    @property
    def is_archived(self):
        """Return True if this record is archived."""
        return not self.is_active
    
    def delete(self, using=None, keep_parents=False):
        """
        Override delete to perform soft delete instead.
        
        To perform a hard delete, use force_delete() method.
        """
        self.archive()
    
    def force_delete(self, using=None, keep_parents=False):
        """
        Perform actual hard delete of the record.
        Use with caution - this permanently removes data.
        """
        super().delete(using=using, keep_parents=keep_parents)