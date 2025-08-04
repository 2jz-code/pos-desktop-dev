from celery import shared_task
from django.core.cache import caches
import logging

logger = logging.getLogger(__name__)

@shared_task
def warm_critical_caches():
    """Celery task for automated cache warming"""
    from .cache import CacheWarmingManager
    
    try:
        results = CacheWarmingManager.warm_critical_caches()
        
        success_count = sum(1 for r in results if r['success'])
        total_count = len(results)
        
        logger.info(f"Cache warming completed: {success_count}/{total_count} successful")
        
        return {
            'status': 'completed',
            'success_count': success_count,
            'total_count': total_count,
            'results': results
        }
    except Exception as e:
        logger.error(f"Cache warming task failed: {e}")
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
    from .cache import AdvancedCacheManager
    
    try:
        result = AdvancedCacheManager.invalidate_pattern(pattern, cache_name)
        
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