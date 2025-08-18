from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import InventoryStock, Recipe, RecipeItem
from core_backend.infrastructure.cache_utils import invalidate_cache_pattern
import logging

logger = logging.getLogger(__name__)

@receiver([post_save, post_delete], sender=InventoryStock)
def handle_inventory_stock_changes(sender, instance=None, **kwargs):
    """Invalidate inventory-related caches when stock levels change"""
    try:
        # Invalidate stock level caches
        if instance and instance.location_id:
            invalidate_cache_pattern(f'get_stock_levels_by_location')
        
        # Invalidate inventory availability status
        invalidate_cache_pattern('get_inventory_availability_status')
        
        # Invalidate POS menu layout since it includes availability
        invalidate_cache_pattern('get_pos_menu_layout')
        
        logger.info(f"Invalidated inventory caches after stock change for product_id: {instance.product.id if instance and instance.product else 'unknown'}")
        
    except Exception as e:
        logger.error(f"Failed to invalidate inventory caches: {e}")

@receiver([post_save, post_delete], sender=Recipe)
def handle_recipe_changes(sender, instance=None, **kwargs):
    """Invalidate recipe-related caches when recipes change"""
    try:
        # Invalidate recipe ingredients mapping
        invalidate_cache_pattern('get_recipe_ingredients_map')
        
        # Invalidate inventory availability (recipe changes affect menu item availability)
        invalidate_cache_pattern('get_inventory_availability_status')
        
        # Invalidate POS menu layout
        invalidate_cache_pattern('get_pos_menu_layout')
        
        logger.info(f"Invalidated recipe caches after change to recipe for product_id: {instance.product.id if instance and instance.product else 'unknown'}")
        
    except Exception as e:
        logger.error(f"Failed to invalidate recipe caches: {e}")

@receiver([post_save, post_delete], sender=RecipeItem)
def handle_recipe_item_changes(sender, instance=None, **kwargs):
    """Invalidate recipe caches when recipe items change"""
    try:
        # Invalidate recipe ingredients mapping
        invalidate_cache_pattern('get_recipe_ingredients_map')
        
        # Invalidate inventory availability
        invalidate_cache_pattern('get_inventory_availability_status')
        
        # Invalidate POS menu layout
        invalidate_cache_pattern('get_pos_menu_layout')
        
        logger.info(f"Invalidated recipe caches after recipe item change: product_id {instance.product.id if instance and instance.product else 'unknown'}")
        
    except Exception as e:
        logger.error(f"Failed to invalidate recipe item caches: {e}")