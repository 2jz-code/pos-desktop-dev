from django.core.cache import cache
from functools import wraps
import hashlib
import json
import time
import logging

logger = logging.getLogger(__name__)

def simple_cache(timeout=300, key_prefix='', log_performance=True):
    """Simple caching decorator with performance logging"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            # Simple key generation
            key_data = f"{func.__module__}.{func.__name__}:{args}:{sorted(kwargs.items())}"
            cache_key = f"{key_prefix}:{hashlib.md5(key_data.encode()).hexdigest()}"
            
            result = cache.get(cache_key)
            
            if result is None:
                # Cache MISS - execute function
                result = func(*args, **kwargs)
                cache.set(cache_key, result, timeout)
                
                execution_time = (time.time() - start_time) * 1000  # Convert to ms
                if log_performance:
                    logger.info(f"🔥 CACHE MISS: {func.__name__} took {execution_time:.1f}ms (DB query)")
            else:
                # Cache HIT - return cached result
                execution_time = (time.time() - start_time) * 1000  # Convert to ms
                if log_performance:
                    logger.info(f"⚡ CACHE HIT: {func.__name__} took {execution_time:.1f}ms (cached)")
            
            return result
        return wrapper
    return decorator

def invalidate_cache_pattern(pattern):
    """Simple pattern invalidation - expand later"""
    # For now, just clear keys we know about
    if hasattr(cache, 'delete_pattern'):
        cache.delete_pattern(f"*{pattern}*")