from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Discount
from core_backend.infrastructure.cache_utils import invalidate_cache_pattern
import logging

logger = logging.getLogger(__name__)

@receiver([post_save, post_delete], sender=Discount)
def handle_discount_changes(sender, instance=None, **kwargs):
    """Invalidate discount-related caches when discounts change"""
    try:
        # Invalidate active discounts cache
        invalidate_cache_pattern('get_active_discounts')
        
        # Invalidate discount eligibility cache patterns
        invalidate_cache_pattern('get_discount_eligibility_for_order_type')
        
        logger.info(f"Invalidated discount caches after change to discount: {instance.name if instance else 'unknown'}")
        
    except Exception as e:
        logger.error(f"Failed to invalidate discount caches: {e}")