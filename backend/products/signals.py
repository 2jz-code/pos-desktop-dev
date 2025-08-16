from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import logging
from django.utils import timezone  # Add this import
from django.conf import settings

from .models import Product, Category, ProductType, Tax, ModifierSet
from .image_service import ImageService  # Import ImageService
from core_backend.infrastructure.cache_utils import invalidate_cache_pattern
import os  # Import os

logger = logging.getLogger(__name__)


def broadcast_entity_change(entity_type, entity_id, action="changed"):
    """
    Broadcast entity changes via WebSocket to all connected clients
    This enables real-time sync across multiple terminals
    """
    try:
        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("No channel layer configured for WebSocket notifications")
            return

        # For MVP, we broadcast to all clients. In multi-tenant, this would be tenant-specific
        message = {
            "type": "sync_notification",
            "event_data": {
                "type": "entity_changed",
                "entity": entity_type,
                "id": entity_id,
                "action": action,
                "timestamp": str(timezone.now()) if "timezone" in globals() else None,
            },
        }

        # Broadcast to a general sync group (all terminals)
        # In multi-tenant architecture, this would be tenant-specific groups
        async_to_sync(channel_layer.group_send)(
            "sync_notifications", message  # General sync group for MVP
        )

        logger.info(f"📡 Broadcasted {action} for {entity_type}:{entity_id}")

    except Exception as e:
        logger.error(f"Failed to broadcast entity change: {e}")


# === PRODUCT SIGNALS ===


@receiver(post_save, sender=Product)
def process_product_image(sender, instance, created, **kwargs):
    """
    After a product is saved, if it has a newly uploaded image,
    process it and replace it with the WebP version.
    """
    # Check if there's an image and if it hasn't been processed yet
    # Also check if the image has changed from its original filename to avoid reprocessing already processed images
    # Skip processing if this save is from the Celery task (to prevent infinite loops)
    if (instance.image and 
        (created or instance.image.name != instance.original_filename) and
        not getattr(instance, '_skip_image_processing', False)):

        # Store the path to the originally uploaded file if it exists
        original_image_path = None
        if not created and instance.image.path and os.path.exists(instance.image.path):
            original_image_path = instance.image.path

        try:
            # Process the image asynchronously
            ImageService.process_image_async(instance.id, instance.image)
            return  # Exit early as async processing will handle the rest
            
        except Exception as e:
            logger.error(f"Error queuing async image processing for product {instance.id}: {e}")
            # Don't raise the exception to prevent the product save from failing

    # Also broadcast the change for real-time updates
    action = "created" if created else "updated"
    broadcast_entity_change("products", instance.id, action)
    
    # Use centralized cache invalidation from ProductService
    from .services import ProductService
    ProductService.invalidate_product_cache(instance.id)
    
    # Proactively warm product caches in background
    try:
        from celery import current_app
        current_app.send_task('core_backend.infrastructure.tasks.warm_product_caches')
    except Exception as e:
        logger.warning(f"Failed to queue product cache warming: {e}")


@receiver(post_delete, sender=Product)
def handle_product_delete(sender, instance, **kwargs):
    """
    Handle product delete events: broadcast change and delete associated image file.
    """
    # Delete the image file when the product is deleted
    ImageService.delete_image_file(instance.image)
    broadcast_entity_change("products", instance.id, "deleted")
    
    # Use centralized cache invalidation from ProductService
    from .services import ProductService
    ProductService.invalidate_product_cache(instance.id)
    
    # Proactively warm product caches in background
    try:
        from celery import current_app
        current_app.send_task('core_backend.infrastructure.tasks.warm_product_caches')
    except Exception as e:
        logger.warning(f"Failed to queue product cache warming: {e}")


# Note: Product save/delete signals are handled by process_product_image and handle_product_delete above
# No additional product signal handlers needed - they would cause duplicate cache invalidation


# === CATEGORY SIGNALS ===


@receiver(post_save, sender=Category)
def handle_category_change(sender, instance, created, **kwargs):
    """Handle category create/update events"""
    action = "created" if created else "updated"
    broadcast_entity_change("categories", instance.id, action)
    
    # Invalidate category and product caches using broader patterns
    invalidate_cache_pattern('*get_cached_category_tree*')
    invalidate_cache_pattern('*get_cached_products_list*')
    invalidate_cache_pattern('*get_cached_active_products_list*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache
    
    # Proactively warm product caches in background
    try:
        from celery import current_app
        current_app.send_task('core_backend.infrastructure.tasks.warm_product_caches')
    except Exception as e:
        logger.warning(f"Failed to queue category cache warming: {e}")


@receiver(post_delete, sender=Category)
def handle_category_delete(sender, instance, **kwargs):
    """Handle category delete events"""
    broadcast_entity_change("categories", instance.id, "deleted")
    
    # Invalidate category and product caches using broader patterns
    invalidate_cache_pattern('*get_cached_category_tree*')
    invalidate_cache_pattern('*get_cached_products_list*')
    invalidate_cache_pattern('*get_cached_active_products_list*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache
    
    # Proactively warm product caches in background
    try:
        from celery import current_app
        current_app.send_task('core_backend.infrastructure.tasks.warm_product_caches')
    except Exception as e:
        logger.warning(f"Failed to queue category cache warming: {e}")


# === PRODUCT TYPE SIGNALS ===


@receiver(post_save, sender=ProductType)
def handle_product_type_change(sender, instance, created, **kwargs):
    """Handle product type create/update events"""
    action = "created" if created else "updated"
    broadcast_entity_change("product_types", instance.id, action)
    
    # Invalidate product type cache using broader patterns
    invalidate_cache_pattern('*get_cached_product_types*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache


@receiver(post_delete, sender=ProductType)
def handle_product_type_delete(sender, instance, **kwargs):
    """Handle product type delete events"""
    broadcast_entity_change("product_types", instance.id, "deleted")
    
    # Invalidate product type cache using broader patterns
    invalidate_cache_pattern('*get_cached_product_types*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache


# === TAX SIGNALS ===

@receiver(post_save, sender=Tax)
def handle_tax_change(sender, instance, created, **kwargs):
    """Handle tax create/update events"""
    action = "created" if created else "updated"
    broadcast_entity_change("taxes", instance.id, action)
    
    # Invalidate tax cache using broader patterns
    invalidate_cache_pattern('*get_cached_taxes*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache


@receiver(post_delete, sender=Tax)
def handle_tax_delete(sender, instance, **kwargs):
    """Handle tax delete events"""
    broadcast_entity_change("taxes", instance.id, "deleted")
    
    # Invalidate tax cache using broader patterns
    invalidate_cache_pattern('*get_cached_taxes*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache


# === MODIFIER SET SIGNALS ===

@receiver(post_save, sender=ModifierSet)
def handle_modifier_set_change(sender, instance, created, **kwargs):
    """Handle modifier set create/update events"""
    action = "created" if created else "updated"
    broadcast_entity_change("modifier_sets", instance.id, action)
    
    # Invalidate modifier set cache using broader patterns
    invalidate_cache_pattern('*get_cached_modifier_sets*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache


@receiver(post_delete, sender=ModifierSet)
def handle_modifier_set_delete(sender, instance, **kwargs):
    """Handle modifier set delete events"""
    broadcast_entity_change("modifier_sets", instance.id, "deleted")
    
    # Invalidate modifier set cache using broader patterns
    invalidate_cache_pattern('*get_cached_modifier_sets*')
    invalidate_cache_pattern('*get_pos_menu_layout*')  # Also invalidate menu layout cache
