from django.core.cache import cache
from functools import wraps
import hashlib
import json
import time
import logging

# Import the new advanced cache system
from .cache import AdvancedCacheManager, advanced_cache

logger = logging.getLogger(__name__)

def simple_cache(timeout=300, key_prefix='', log_performance=True, cache_name='static_data'):
    """Enhanced simple caching decorator with advanced backend support"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            # Use advanced cache manager for better reliability
            cache_instance = AdvancedCacheManager.get_cache(cache_name)
            if not cache_instance:
                # Fallback to direct function execution
                result = func(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000
                if log_performance:
                    log_cache_performance(f"unavailable_{func.__name__}", hit=False, execution_time=execution_time, cache_name="unavailable")
                return result
            
            # Generate cache key with versioning
            cache_key = AdvancedCacheManager.cache_key(
                'simple_cache', func.__name__, key_prefix,
                args_hash=hashlib.md5(str(args).encode()).hexdigest()[:8],
                kwargs_hash=hashlib.md5(str(sorted(kwargs.items())).encode()).hexdigest()[:8]
            )
            
            try:
                result = cache_instance.get(cache_key)
                
                if result is None:
                    # Cache MISS - execute function
                    result = func(*args, **kwargs)
                    cache_instance.set(cache_key, result, timeout)
                    
                    execution_time = (time.time() - start_time) * 1000
                    if log_performance:
                        log_cache_performance(cache_key, hit=False, execution_time=execution_time, cache_name=cache_name)
                else:
                    # Cache HIT - return cached result
                    execution_time = (time.time() - start_time) * 1000
                    if log_performance:
                        log_cache_performance(cache_key, hit=True, execution_time=execution_time, cache_name=cache_name)
                
                return result
                
            except Exception as e:
                # Graceful degradation on cache errors
                logger.error(f"Cache error in {func.__name__}: {e}")
                result = func(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000
                if log_performance:
                    log_cache_performance(f"error_{func.__name__}", hit=False, execution_time=execution_time, cache_name="error")
                return result
                
        return wrapper
    return decorator

def invalidate_cache_pattern(pattern, cache_name='static_data'):
    """Enhanced pattern invalidation using advanced cache manager"""
    # Use advanced cache manager for better error handling
    result_static = AdvancedCacheManager.invalidate_pattern(pattern, 'static_data')
    result_default = AdvancedCacheManager.invalidate_pattern(pattern, 'default')
    
    if result_static or result_default:
        logger.info(f"Successfully invalidated pattern '{pattern}' across caches")
    else:
        logger.warning(f"Failed to invalidate pattern '{pattern}'")
    
    return result_static or result_default

# Convenience functions for common cache operations
def cache_static_data(timeout=3600*6):
    """Decorator for highly static data (6 hours default)"""
    return simple_cache(timeout=timeout, cache_name='static_data', key_prefix='static')

def cache_dynamic_data(timeout=300):
    """Decorator for dynamic data (5 minutes default)"""
    return simple_cache(timeout=timeout, cache_name='default', key_prefix='dynamic')

def cache_session_data(timeout=900):
    """Decorator for session-related data (15 minutes default)"""
    return simple_cache(timeout=timeout, cache_name='session_data', key_prefix='session')

# Enhanced cache monitoring and performance tracking
def log_cache_performance(cache_key, hit=True, execution_time=None, cache_name='default'):
    """Enhanced cache hit/miss logging with performance metrics"""
    try:
        if execution_time is not None:
            status = "HIT" if hit else "MISS"
            cache_source = cache_name.upper()
            
            # Use different log levels based on performance
            if execution_time > 1000:  # Over 1 second
                logger.warning(f"🐌 SLOW CACHE {status} [{cache_source}]: {cache_key[:50]}... took {execution_time:.1f}ms")
            elif execution_time > 500:  # Over 500ms
                logger.info(f"⏰ CACHE {status} [{cache_source}]: {cache_key[:50]}... took {execution_time:.1f}ms")
            else:
                logger.debug(f"⚡ CACHE {status} [{cache_source}]: {cache_key[:50]}... took {execution_time:.1f}ms")
                
            # Track cache performance metrics (could be sent to monitoring service)
            _track_cache_metrics(cache_key, hit, execution_time, cache_name)
                
    except Exception as e:
        logger.error(f"Error logging cache performance: {e}")

def _track_cache_metrics(cache_key, hit, execution_time, cache_name):
    """Track cache metrics for monitoring (placeholder for future monitoring integration)"""
    try:
        # This could be enhanced to send metrics to monitoring services
        # like DataDog, New Relic, or custom analytics
        
        # For now, just store basic stats in memory for debugging
        if not hasattr(_track_cache_metrics, 'stats'):
            _track_cache_metrics.stats = {
                'total_hits': 0,
                'total_misses': 0,
                'total_requests': 0,
                'avg_hit_time': 0,
                'avg_miss_time': 0,
                'slow_queries': 0
            }
        
        stats = _track_cache_metrics.stats
        stats['total_requests'] += 1
        
        if hit:
            stats['total_hits'] += 1
            stats['avg_hit_time'] = ((stats['avg_hit_time'] * (stats['total_hits'] - 1)) + execution_time) / stats['total_hits']
        else:
            stats['total_misses'] += 1
            stats['avg_miss_time'] = ((stats['avg_miss_time'] * (stats['total_misses'] - 1)) + execution_time) / stats['total_misses']
            
        if execution_time > 1000:
            stats['slow_queries'] += 1
            
        # Log summary stats every 100 requests
        if stats['total_requests'] % 100 == 0:
            hit_rate = (stats['total_hits'] / stats['total_requests']) * 100
            logger.info(f"📊 CACHE STATS: {hit_rate:.1f}% hit rate, {stats['total_requests']} total requests, "
                       f"{stats['slow_queries']} slow queries, avg hit: {stats['avg_hit_time']:.1f}ms, "
                       f"avg miss: {stats['avg_miss_time']:.1f}ms")
                       
    except Exception as e:
        logger.error(f"Error tracking cache metrics: {e}")

def get_cache_performance_stats():
    """Get current cache performance statistics"""
    try:
        if hasattr(_track_cache_metrics, 'stats'):
            stats = _track_cache_metrics.stats.copy()
            if stats['total_requests'] > 0:
                stats['hit_rate'] = (stats['total_hits'] / stats['total_requests']) * 100
                stats['miss_rate'] = (stats['total_misses'] / stats['total_requests']) * 100
            else:
                stats['hit_rate'] = 0
                stats['miss_rate'] = 0
            return stats
        return None
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        return None

def clear_cache_performance_stats():
    """Clear cache performance statistics"""
    try:
        if hasattr(_track_cache_metrics, 'stats'):
            delattr(_track_cache_metrics, 'stats')
        logger.info("Cache performance stats cleared")
    except Exception as e:
        logger.error(f"Error clearing cache stats: {e}")

def warm_critical_caches():
    """Warm up critical application caches for better startup performance"""
    try:
        logger.info("🔥 Starting critical cache warming...")
        warmed_caches = []
        
        # Warm settings cache
        try:
            from settings.config import app_settings
            if app_settings.warm_settings_cache():
                warmed_caches.append("settings")
        except Exception as e:
            logger.warning(f"Failed to warm settings cache: {e}")
        
        # Warm product caches
        try:
            from products.services import ProductService
            ProductService.get_cached_category_tree()
            ProductService.get_cached_active_products_list()
            ProductService.get_cached_product_types()
            ProductService.get_cached_taxes()
            warmed_caches.append("products")
        except Exception as e:
            logger.warning(f"Failed to warm product caches: {e}")
        
        # Warm report KPIs
        try:
            from reports.services import ReportService
            ReportService.get_cached_business_kpis()
            warmed_caches.append("reports")
        except Exception as e:
            logger.warning(f"Failed to warm report caches: {e}")
        
        logger.info(f"✅ Cache warming completed. Warmed: {', '.join(warmed_caches)}")
        return warmed_caches
        
    except Exception as e:
        logger.error(f"Error during cache warming: {e}")
        return []