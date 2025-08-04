"""
Permissions for archiving functionality.

Provides role-based access control for archive/unarchive operations.
"""

from rest_framework.permissions import BasePermission
from users.permissions import IsManagerOrHigher


class CanArchiveRecords(BasePermission):
    """
    Permission to archive records.
    Only managers and above can archive records.
    """
    
    def has_permission(self, request, view):
        """Check if user has permission to archive records."""
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Use existing manager permission logic
        manager_permission = IsManagerOrHigher()
        return manager_permission.has_permission(request, view)
    
    def has_object_permission(self, request, view, obj):
        """Check if user has permission to archive specific object."""
        # For now, same as general permission
        # Could be extended for object-specific rules
        return self.has_permission(request, view)


class CanUnarchiveRecords(BasePermission):
    """
    Permission to unarchive records.
    Only managers and above can unarchive records.
    
    Note: Unarchiving might require higher permissions than archiving
    in some organizations, as it can restore deleted data.
    """
    
    def has_permission(self, request, view):
        """Check if user has permission to unarchive records."""
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Use existing manager permission logic
        manager_permission = IsManagerOrHigher()
        return manager_permission.has_permission(request, view)
    
    def has_object_permission(self, request, view, obj):
        """Check if user has permission to unarchive specific object."""
        return self.has_permission(request, view)


class CanForceDelete(BasePermission):
    """
    Permission to permanently delete records.
    Only superusers can force delete (hard delete) records.
    
    This is the highest level of destructive permission.
    """
    
    def has_permission(self, request, view):
        """Check if user has permission to force delete records."""
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Only superusers can permanently delete
        return request.user.is_superuser
    
    def has_object_permission(self, request, view, obj):
        """Check if user has permission to force delete specific object."""
        return self.has_permission(request, view)


class CanViewArchived(BasePermission):
    """
    Permission to view archived records.
    Staff members and above can view archived records.
    """
    
    def has_permission(self, request, view):
        """Check if user has permission to view archived records."""
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Staff and above can view archived records
        return request.user.is_staff
    
    def has_object_permission(self, request, view, obj):
        """Check if user has permission to view specific archived object."""
        return self.has_permission(request, view)