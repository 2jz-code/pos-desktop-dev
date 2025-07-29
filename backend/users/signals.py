from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import User
from core_backend.cache_utils import invalidate_cache_pattern
import logging

logger = logging.getLogger(__name__)

@receiver([post_save, post_delete], sender=User)
def handle_user_changes(sender, instance=None, **kwargs):
    """Invalidate user-related caches when users change"""
    try:
        # Invalidate POS staff cache when any user changes
        invalidate_cache_pattern('get_pos_staff_users')
        
        # Invalidate role permissions cache if role changed
        if hasattr(instance, 'role'):
            invalidate_cache_pattern('get_user_permissions_by_role')
        
        logger.info(f"Invalidated user caches after change to user: {instance.username if instance else 'unknown'}")
        
    except Exception as e:
        logger.error(f"Failed to invalidate user caches: {e}")