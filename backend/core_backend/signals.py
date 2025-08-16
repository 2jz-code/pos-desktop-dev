"""
Signal handlers for automatic cache warming on data changes.
These signals ensure that caches are proactively warmed when critical data changes.
"""

from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from django.conf import settings
from celery import current_app
import logging

logger = logging.getLogger(__name__)


def is_cache_warming_enabled():
    """Check if automatic cache warming is enabled"""
    return getattr(settings, 'CACHE_WARMING_ENABLED', True)


def queue_cache_warming_task(task_name, *args, **kwargs):
    """Queue a cache warming task asynchronously"""
    try:
        if not is_cache_warming_enabled():
            return
            
        # Use delay to run asynchronously without blocking the request
        current_app.send_task(task_name, args=args, kwargs=kwargs)
        logger.debug(f"Queued cache warming task: {task_name}")
        
    except Exception as e:
        logger.warning(f"Failed to queue cache warming task {task_name}: {e}")


# ============================================================================
# PRODUCT-RELATED CACHE WARMING SIGNALS
# ============================================================================

@receiver(post_save, sender='products.Product')
def warm_product_caches_on_product_change(sender, instance, created, **kwargs):
    """Warm product caches when a product is created or updated"""
    try:
        # Only warm if the product affects cached data
        if created or instance.is_active:
            logger.debug(f"Product {'created' if created else 'updated'}: {instance.name} - warming product caches")
            queue_cache_warming_task('core_backend.infrastructure.tasks.warm_product_caches')
            
    except Exception as e:
        logger.error(f"Error in product cache warming signal: {e}")


@receiver(post_delete, sender='products.Product')
def warm_product_caches_on_product_delete(sender, instance, **kwargs):
    """Warm product caches when a product is deleted"""
    try:
        logger.debug(f"Product deleted: {instance.name} - warming product caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_product_caches')
        
    except Exception as e:
        logger.error(f"Error in product deletion cache warming signal: {e}")


@receiver(post_save, sender='products.Category')
def warm_category_caches_on_category_change(sender, instance, created, **kwargs):
    """Warm category caches when a category is created or updated"""
    try:
        logger.debug(f"Category {'created' if created else 'updated'}: {instance.name} - warming product caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_product_caches')
        
    except Exception as e:
        logger.error(f"Error in category cache warming signal: {e}")


@receiver(post_delete, sender='products.Category')
def warm_category_caches_on_category_delete(sender, instance, **kwargs):
    """Warm category caches when a category is deleted"""
    try:
        logger.debug(f"Category deleted: {instance.name} - warming product caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_product_caches')
        
    except Exception as e:
        logger.error(f"Error in category deletion cache warming signal: {e}")


@receiver(post_save, sender='products.Tax')
def warm_tax_caches_on_tax_change(sender, instance, created, **kwargs):
    """Warm tax caches when a tax is created or updated"""
    try:
        logger.debug(f"Tax {'created' if created else 'updated'}: {instance.name} - warming product caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_product_caches')
        
    except Exception as e:
        logger.error(f"Error in tax cache warming signal: {e}")


@receiver(post_save, sender='products.ProductType')
def warm_product_type_caches_on_type_change(sender, instance, created, **kwargs):
    """Warm product type caches when a product type is created or updated"""
    try:
        logger.debug(f"ProductType {'created' if created else 'updated'}: {instance.name} - warming product caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_product_caches')
        
    except Exception as e:
        logger.error(f"Error in product type cache warming signal: {e}")


# ============================================================================
# SETTINGS-RELATED CACHE WARMING SIGNALS
# ============================================================================

@receiver(post_save, sender='settings.GlobalSettings')
def warm_settings_caches_on_global_settings_change(sender, instance, **kwargs):
    """Warm settings caches when global settings change"""
    try:
        logger.debug("Global settings updated - warming settings caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_settings_caches')
        
    except Exception as e:
        logger.error(f"Error in global settings cache warming signal: {e}")


@receiver(post_save, sender='settings.StoreLocation')
def warm_settings_caches_on_store_location_change(sender, instance, created, **kwargs):
    """Warm settings caches when store location changes"""
    try:
        logger.debug(f"Store location {'created' if created else 'updated'}: {instance.name} - warming settings caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_settings_caches')
        
    except Exception as e:
        logger.error(f"Error in store location cache warming signal: {e}")


# ============================================================================
# INVENTORY-RELATED CACHE WARMING SIGNALS
# ============================================================================

@receiver(post_save, sender='inventory.Location')
def warm_inventory_caches_on_location_change(sender, instance, created, **kwargs):
    """Warm inventory caches when a location is created or updated"""
    try:
        logger.debug(f"Inventory location {'created' if created else 'updated'}: {instance.name} - warming inventory caches")
        queue_cache_warming_task('core_backend.infrastructure.tasks.warm_inventory_caches')
        
    except Exception as e:
        logger.error(f"Error in inventory location cache warming signal: {e}")


# ============================================================================
# DISCOUNT-RELATED CACHE WARMING SIGNALS
# ============================================================================

@receiver(post_save, sender='discounts.Discount')
def warm_discount_caches_on_discount_change(sender, instance, created, **kwargs):
    """Warm discount-related caches when a discount changes"""
    try:
        if instance.is_active:
            logger.debug(f"Discount {'created' if created else 'updated'}: {instance.name} - warming related caches")
            # Discounts can affect product pricing, so warm product caches
            queue_cache_warming_task('core_backend.infrastructure.tasks.warm_product_caches')
        
    except Exception as e:
        logger.error(f"Error in discount cache warming signal: {e}")


# ============================================================================
# USER-RELATED CACHE WARMING SIGNALS  
# ============================================================================

@receiver(post_save, sender='users.User')
def warm_user_caches_on_user_change(sender, instance, created, **kwargs):
    """Warm user-related caches when user data changes"""
    try:
        # Only warm for staff users or significant changes
        if instance.is_staff or created:
            logger.debug(f"User {'created' if created else 'updated'}: {instance.email} - warming relevant caches")
            # Users can affect reports and other cached data
            queue_cache_warming_task('core_backend.infrastructure.tasks.warm_report_caches')
        
    except Exception as e:
        logger.error(f"Error in user cache warming signal: {e}")


# ============================================================================
# GENERAL CACHE INVALIDATION SIGNALS
# ============================================================================

@receiver(post_save)
def smart_cache_warming_on_model_change(sender, instance, created, **kwargs):
    """
    Smart cache warming based on model changes.
    This is a catch-all for models that don't have specific handlers.
    """
    try:
        # Skip if we already have specific handlers for this model
        model_name = f"{sender._meta.app_label}.{sender._meta.model_name}"
        
        # Models with specific handlers - skip to avoid double-warming
        skip_models = {
            'products.product', 'products.category', 'products.tax', 'products.producttype',
            'settings.globalsettings', 'settings.storelocation',
            'inventory.location', 'discounts.discount', 'users.user'
        }
        
        if model_name in skip_models:
            return
            
        # Only warm for significant model changes that might affect caches
        important_apps = {'orders', 'payments', 'reports'}
        
        if sender._meta.app_label in important_apps:
            logger.debug(f"Model change in {model_name} - refreshing critical caches")
            queue_cache_warming_task('core_backend.infrastructure.tasks.refresh_stale_caches')
            
    except Exception as e:
        logger.error(f"Error in smart cache warming signal: {e}")


# ============================================================================
# PERIODIC CACHE HEALTH MONITORING
# ============================================================================

def schedule_cache_health_check():
    """Schedule a cache health check"""
    try:
        queue_cache_warming_task('core_backend.infrastructure.tasks.cache_health_check')
    except Exception as e:
        logger.error(f"Failed to schedule cache health check: {e}")


# This can be called from management commands or other periodic triggers
def trigger_comprehensive_cache_warming():
    """Trigger comprehensive cache warming for all areas"""
    try:
        logger.info("🔥 Triggering comprehensive cache warming...")
        
        # Queue all cache warming tasks
        tasks = [
            'core_backend.infrastructure.tasks.warm_critical_caches',
            'core_backend.infrastructure.tasks.warm_product_caches', 
            'core_backend.infrastructure.tasks.warm_settings_caches',
            'core_backend.infrastructure.tasks.warm_report_caches',
            'core_backend.infrastructure.tasks.warm_inventory_caches'
        ]
        
        for task in tasks:
            queue_cache_warming_task(task)
            
        logger.info(f"✅ Queued {len(tasks)} cache warming tasks")
        
    except Exception as e:
        logger.error(f"Failed to trigger comprehensive cache warming: {e}")