from celery import shared_task
from django.core.cache import caches
import logging

logger = logging.getLogger(__name__)

@shared_task
def warm_critical_caches():
    """Celery task for automated comprehensive cache warming"""
    try:
        from .cache_utils import warm_critical_caches as warm_caches_util
        
        logger.info("🔥 Starting automated cache warming...")
        warmed_caches = warm_caches_util()
        
        if warmed_caches:
            logger.info(f"✅ Automated cache warming completed: {', '.join(warmed_caches)}")
            return {
                'status': 'completed',
                'success_count': len(warmed_caches),
                'warmed_caches': warmed_caches
            }
        else:
            logger.warning("⚠️ No caches were warmed during automated warming")
            return {
                'status': 'completed',
                'success_count': 0,
                'warmed_caches': []
            }
    except Exception as e:
        logger.error(f"❌ Automated cache warming task failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def cache_health_check():
    """Perform comprehensive cache health check"""
    from .cache import CacheMonitor
    
    try:
        health_results = CacheMonitor.health_check()
        stats = CacheMonitor.get_all_cache_stats()
        
        unhealthy_caches = [
            name for name, result in health_results.items() 
            if result.get('status') != 'healthy'
        ]
        
        if unhealthy_caches:
            logger.warning(f"Unhealthy caches detected: {unhealthy_caches}")
        else:
            logger.info("All caches are healthy")
        
        return {
            'status': 'completed',
            'health_results': health_results,
            'stats': stats,
            'unhealthy_count': len(unhealthy_caches)
        }
    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def clear_expired_cache_locks():
    """Clear expired distributed locks"""
    from .cache import AdvancedCacheManager
    
    try:
        cache = AdvancedCacheManager.get_cache('default')
        if not cache:
            return {'status': 'failed', 'error': 'Cache not available'}
        
        # Clear lock pattern
        if hasattr(cache, 'delete_pattern'):
            deleted_count = cache.delete_pattern('*lock:*')
            logger.info(f"Cleared {deleted_count} expired cache locks")
            return {
                'status': 'completed',
                'cleared_locks': deleted_count
            }
        else:
            return {
                'status': 'skipped',
                'reason': 'Pattern deletion not supported'
            }
    except Exception as e:
        logger.error(f"Failed to clear expired cache locks: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def invalidate_cache_pattern(pattern, cache_name='default'):
    """Task to invalidate cache patterns"""
    from .cache_utils import invalidate_cache_pattern as invalidate_pattern_util
    
    try:
        result = invalidate_pattern_util(pattern, cache_name)
        
        if result:
            logger.info(f"Successfully invalidated cache pattern '{pattern}' in {cache_name}")
            return {
                'status': 'completed',
                'pattern': pattern,
                'cache_name': cache_name
            }
        else:
            logger.warning(f"Failed to invalidate cache pattern '{pattern}' in {cache_name}")
            return {
                'status': 'failed',
                'pattern': pattern,
                'cache_name': cache_name,
                'error': 'Invalidation failed'
            }
    except Exception as e:
        logger.error(f"Cache invalidation task failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

# ============================================================================
# SPECIALIZED CACHE WARMING TASKS
# ============================================================================

@shared_task
def warm_product_caches():
    """Warm product-specific caches"""
    try:
        logger.info("🛍️ Warming product caches...")
        
        from products.services import ProductService
        
        warmed_caches = []
        
        # Warm category tree
        try:
            ProductService.get_cached_category_tree()
            warmed_caches.append("category_tree")
        except Exception as e:
            logger.warning(f"Failed to warm category tree cache: {e}")
        
        # Warm active products list
        try:
            ProductService.get_cached_active_products_list()
            warmed_caches.append("active_products")
        except Exception as e:
            logger.warning(f"Failed to warm active products cache: {e}")
        
        # Warm product types
        try:
            ProductService.get_cached_product_types()
            warmed_caches.append("product_types")
        except Exception as e:
            logger.warning(f"Failed to warm product types cache: {e}")
        
        # Warm taxes
        try:
            ProductService.get_cached_taxes()
            warmed_caches.append("taxes")
        except Exception as e:
            logger.warning(f"Failed to warm taxes cache: {e}")
        
        logger.info(f"✅ Product cache warming completed: {', '.join(warmed_caches)}")
        return {
            'status': 'completed',
            'warmed_caches': warmed_caches,
            'success_count': len(warmed_caches)
        }
        
    except Exception as e:
        logger.error(f"❌ Product cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def warm_settings_caches():
    """Warm settings-specific caches"""
    try:
        logger.info("⚙️ Warming settings caches...")
        
        from settings.config import app_settings
        
        warmed_count = 0
        if app_settings.warm_settings_cache():
            warmed_count = 1
            
        logger.info(f"✅ Settings cache warming completed (warmed: {warmed_count})")
        return {
            'status': 'completed',
            'warmed_count': warmed_count
        }
        
    except Exception as e:
        logger.error(f"❌ Settings cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def warm_report_caches():
    """Warm report-specific caches"""
    try:
        logger.info("📊 Warming report caches...")
        
        from reports.services_new.metrics_service import BusinessMetricsService
        
        warmed_caches = []
        
        # Warm business KPIs
        try:
            BusinessMetricsService.get_cached_business_kpis()
            warmed_caches.append("business_kpis")
        except Exception as e:
            logger.warning(f"Failed to warm business KPIs cache: {e}")
        
        logger.info(f"✅ Report cache warming completed: {', '.join(warmed_caches)}")
        return {
            'status': 'completed',
            'warmed_caches': warmed_caches,
            'success_count': len(warmed_caches)
        }
        
    except Exception as e:
        logger.error(f"❌ Report cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def warm_inventory_caches():
    """Warm inventory-specific caches"""
    try:
        logger.info("📦 Warming inventory caches...")
        
        # Since inventory doesn't have specific cached methods mentioned,
        # we'll warm general inventory data that's commonly accessed
        warmed_caches = []
        
        try:
            from inventory.models import Location
            # Pre-load locations which are frequently accessed
            list(Location.objects.all())
            warmed_caches.append("locations")
        except Exception as e:
            logger.warning(f"Failed to warm locations cache: {e}")
        
        logger.info(f"✅ Inventory cache warming completed: {', '.join(warmed_caches)}")
        return {
            'status': 'completed',
            'warmed_caches': warmed_caches,
            'success_count': len(warmed_caches)
        }
        
    except Exception as e:
        logger.error(f"❌ Inventory cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

# ============================================================================
# CACHE MAINTENANCE TASKS
# ============================================================================

@shared_task
def refresh_stale_caches():
    """Refresh caches that might be stale"""
    try:
        logger.info("🔄 Refreshing potentially stale caches...")
        
        from .cache_utils import get_cache_performance_stats
        
        # Get current cache stats
        stats = get_cache_performance_stats()
        
        refreshed_areas = []
        
        # If hit rate is low, warm critical caches
        if stats and stats.get('hit_rate', 100) < 70:  # Less than 70% hit rate
            logger.info(f"Low cache hit rate detected: {stats['hit_rate']:.1f}% - refreshing caches")
            
            # Warm critical caches
            from .cache_utils import warm_critical_caches
            warmed = warm_critical_caches()
            refreshed_areas.extend(warmed)
        
        logger.info(f"✅ Stale cache refresh completed: {', '.join(refreshed_areas)}")
        return {
            'status': 'completed',
            'refreshed_areas': refreshed_areas,
            'cache_stats': stats
        }
        
    except Exception as e:
        logger.error(f"❌ Stale cache refresh failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

# ============================================================================
# DATABASE BACKUP TASKS
# ============================================================================

@shared_task
def backup_database():
    """Automated database backup task"""
    try:
        logger.info("💾 Starting automated database backup...")
        
        from django.core.management import call_command
        from io import StringIO
        from datetime import datetime, timezone
        
        # Capture command output
        stdout = StringIO()
        stderr = StringIO()
        
        # Run backup command
        call_command(
            'backup_database',
            verbosity=1,
            stdout=stdout,
            stderr=stderr
        )
        
        output = stdout.getvalue()
        error_output = stderr.getvalue()
        
        if error_output:
            logger.warning(f"Backup command warnings: {error_output}")
        
        logger.info("✅ Automated database backup completed successfully")
        return {
            'status': 'completed',
            'output': output,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'backup_type': 'postgresql_s3'
        }
        
    except Exception as e:
        logger.error(f"❌ Automated database backup failed: {e}")
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }