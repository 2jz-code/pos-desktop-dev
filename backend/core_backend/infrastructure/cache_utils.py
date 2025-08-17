from django.core.cache import cache
from functools import wraps
import hashlib
import json
import time
import logging

# Import the new advanced cache system
from .cache import AdvancedCacheManager, advanced_cache, CacheWarmingManager, CacheMonitor

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
                    CacheMonitor.log_cache_performance(f"unavailable_{func.__name__}", hit=False, execution_time=execution_time, cache_name="unavailable")
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
                        CacheMonitor.log_cache_performance(cache_key, hit=False, execution_time=execution_time, cache_name=cache_name)
                else:
                    # Cache HIT - return cached result
                    execution_time = (time.time() - start_time) * 1000
                    if log_performance:
                        CacheMonitor.log_cache_performance(cache_key, hit=True, execution_time=execution_time, cache_name=cache_name)
                
                return result
                
            except Exception as e:
                # Graceful degradation on cache errors
                logger.error(f"Cache error in {func.__name__}: {e}")
                result = func(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000
                if log_performance:
                    CacheMonitor.log_cache_performance(f"error_{func.__name__}", hit=False, execution_time=execution_time, cache_name="error")
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

# =============================================================================
# CONSOLIDATED FUNCTIONS (now available from .cache import)
# =============================================================================

# Performance tracking functions - now available from CacheMonitor
def get_cache_performance_stats():
    """Get current cache performance statistics (delegated to CacheMonitor)"""
    return CacheMonitor.get_cache_performance_stats()

def clear_cache_performance_stats():
    """Clear cache performance statistics (delegated to CacheMonitor)"""
    return CacheMonitor.clear_cache_performance_stats()

def warm_critical_caches():
    """Simple critical cache warming (delegated to CacheWarmingManager)"""
    return CacheWarmingManager.warm_critical_caches_simple()

# Backward compatibility aliases (with deprecation warnings)
def log_cache_performance(cache_key, hit=True, execution_time=None, cache_name='default'):
    """DEPRECATED: Use CacheMonitor.log_cache_performance() instead"""
    import warnings
    warnings.warn(
        "log_cache_performance is deprecated. Use CacheMonitor.log_cache_performance() instead.", 
        DeprecationWarning, 
        stacklevel=2
    )
    return CacheMonitor.log_cache_performance(cache_key, hit, execution_time, cache_name)