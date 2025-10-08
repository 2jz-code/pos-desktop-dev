from django.core.cache import caches
from django.core.cache.utils import make_template_fragment_key
from functools import wraps
import logging
import json
import hashlib
import time
from typing import Optional, Any, Dict, List
from contextlib import contextmanager

logger = logging.getLogger(__name__)

class AdvancedCacheManager:
    """Sophisticated cache management with circuit breaker and monitoring"""
    
    STATIC_CACHE = 'static_data'
    DYNAMIC_CACHE = 'default'
    SESSION_CACHE = 'session_data'
    
    # Circuit breaker state
    _circuit_breaker_state = {}
    _circuit_failure_threshold = 5
    _circuit_timeout = 300  # 5 minutes
    
    @classmethod
    def get_cache(cls, cache_name='default'):
        """Get cache with circuit breaker protection"""
        if cls._is_circuit_open(cache_name):
            logger.warning(f"Circuit breaker open for cache: {cache_name}")
            return None
        
        try:
            return caches[cache_name]
        except Exception as e:
            cls._record_failure(cache_name)
            logger.error(f"Cache failure for {cache_name}: {e}")
            return None
    
    @classmethod
    def _is_circuit_open(cls, cache_name):
        """Check if circuit breaker is open"""
        state = cls._circuit_breaker_state.get(cache_name, {})
        failures = state.get('failures', 0)
        last_failure = state.get('last_failure', 0)
        
        if failures >= cls._circuit_failure_threshold:
            if time.time() - last_failure < cls._circuit_timeout:
                return True
            else:
                # Reset circuit breaker
                cls._circuit_breaker_state[cache_name] = {'failures': 0}
        
        return False
    
    @classmethod
    def _record_failure(cls, cache_name):
        """Record cache failure for circuit breaker"""
        state = cls._circuit_breaker_state.get(cache_name, {'failures': 0})
        state['failures'] += 1
        state['last_failure'] = time.time()
        cls._circuit_breaker_state[cache_name] = state
    
    @classmethod
    def cache_key(cls, app_name, model_name, identifier='all', version=None, **kwargs):
        """Advanced cache key with versioning"""
        from django.conf import settings
        
        # Include cache version for deployment-safe cache busting
        cache_version = version or getattr(settings, 'CACHE_VERSION', 1)
        
        # Build parameterized key
        params = ':'.join(f"{k}={v}" for k, v in sorted(kwargs.items()))
        base_key = f"{app_name}:{model_name}:{identifier}"
        
        if params:
            base_key = f"{base_key}:{params}"
        
        return f"v{cache_version}:{base_key}"
    
    @classmethod
    @contextmanager
    def cache_lock(cls, lock_key, timeout=60):
        """Distributed lock for cache warming"""
        cache = cls.get_cache(cls.DYNAMIC_CACHE)
        if not cache:
            yield False
            return
        
        lock_acquired = cache.add(f"lock:{lock_key}", "locked", timeout)
        try:
            yield lock_acquired
        finally:
            if lock_acquired:
                cache.delete(f"lock:{lock_key}")
    
    @classmethod
    def invalidate_pattern(cls, pattern, cache_name='default'):
        """Pattern-based cache invalidation with error handling"""
        cache = cls.get_cache(cache_name)
        if not cache:
            return False
        
        try:
            if hasattr(cache, 'delete_pattern'):
                deleted_count = cache.delete_pattern(pattern)
                logger.info(f"Invalidated {deleted_count} keys matching '{pattern}' in {cache_name}")
                return True
            else:
                logger.warning(f"Pattern deletion not supported for cache: {cache_name}")
                return False
        except Exception as e:
            logger.error(f"Cache invalidation failed for pattern '{pattern}': {e}")
            return False
    
    @classmethod
    def get_cache_stats(cls, cache_name='default'):
        """Get cache statistics for monitoring"""
        cache = cls.get_cache(cache_name)
        if not cache:
            return None
        
        try:
            if hasattr(cache, 'get_stats'):
                return cache.get_stats()
            else:
                # Basic stats if advanced stats not available
                return {
                    'cache_name': cache_name,
                    'circuit_state': cls._circuit_breaker_state.get(cache_name, {}),
                    'available': True
                }
        except Exception as e:
            logger.error(f"Failed to get cache stats for {cache_name}: {e}")
            return None

class CacheWarmingManager:
    """Intelligent cache warming system"""
    
    @classmethod
    def warm_critical_caches(cls):
        """Warm up critical application caches"""
        warming_tasks = [
            ('products', cls._warm_products_cache),
            ('categories', cls._warm_categories_cache),
            ('settings', cls._warm_settings_cache),
            ('users', cls._warm_users_cache),
            ('discounts', cls._warm_discounts_cache),
            ('reviews', cls._warm_reviews_cache),
            ('inventory', cls._warm_inventory_cache),
            ('orders', cls._warm_orders_cache),
            ('pos_layout', cls._warm_pos_layout_cache),
            ('business_kpis', cls._warm_reports_cache),
            ('sales_analytics', cls._warm_analytics_cache),
            ('performance', cls._warm_performance_cache),
        ]
        
        results = []
        for cache_type, warming_func in warming_tasks:
            with AdvancedCacheManager.cache_lock(f"warm_{cache_type}"):
                try:
                    result = warming_func()
                    logger.info(f"Successfully warmed {cache_type} cache: {result}")
                    results.append({'type': cache_type, 'success': True, 'result': result})
                except Exception as e:
                    logger.error(f"Failed to warm {cache_type} cache: {e}")
                    results.append({'type': cache_type, 'success': False, 'error': str(e)})
        
        return results
    
    @classmethod
    def warm_critical_caches_simple(cls):
        """Simple critical cache warming for backward compatibility (from cache_utils.py)"""
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
                from reports.services_new.metrics_service import BusinessMetricsService
                BusinessMetricsService.get_cached_business_kpis()
                warmed_caches.append("reports")
            except Exception as e:
                logger.warning(f"Failed to warm report caches: {e}")
            
            logger.info(f"✅ Cache warming completed. Warmed: {', '.join(warmed_caches)}")
            return warmed_caches
            
        except Exception as e:
            logger.error(f"Error during cache warming: {e}")
            return []
    
    @classmethod
    def _warm_products_cache(cls):
        """Warm products cache"""
        try:
            from products.services import ProductService
            products = ProductService.get_cached_products_list()
            categories = ProductService.get_cached_category_tree()
            return f"Warmed {len(products)} products and {len(categories)} categories"
        except ImportError:
            return "Products service not available"
    
    @classmethod
    def _warm_categories_cache(cls):
        """Warm categories cache"""
        try:
            from products.services import ProductService
            categories = ProductService.get_cached_category_tree()
            return f"Warmed {len(categories)} categories"
        except ImportError:
            return "Products service not available"
    
    @classmethod
    def _warm_settings_cache(cls):
        """Warm settings cache"""
        try:
            from settings.config import app_settings
            settings_data = app_settings.get_cached_global_settings()
            return "Warmed global settings"
        except ImportError:
            return "Settings service not available"
    
    @classmethod
    def _warm_users_cache(cls):
        """Warm users cache"""
        try:
            from users.services import UserService
            staff_users = UserService.get_pos_staff_users()
            permissions = UserService.get_user_permissions_by_role()
            return f"Warmed {len(staff_users)} staff users and {len(permissions)} role permissions"
        except ImportError:
            return "Users service not available"
    
    @classmethod
    def _warm_discounts_cache(cls):
        """Warm discounts cache"""
        try:
            from discounts.services import DiscountService
            active_discounts = DiscountService.get_active_discounts()
            return f"Warmed {len(active_discounts)} active discounts"
        except ImportError:
            return "Discounts service not available"
    
    @classmethod
    def _warm_reviews_cache(cls):
        """Warm Google Reviews cache"""
        try:
            from integrations.services import GooglePlacesService
            summary = GooglePlacesService.get_business_rating_summary()
            highlights = GooglePlacesService.get_recent_reviews_highlights()
            return f"Warmed Google reviews: {summary.get('total_reviews', 0)} total reviews, {highlights.get('count', 0)} highlights"
        except ImportError:
            return "Google Places service not available"
    
    @classmethod
    def _warm_inventory_cache(cls):
        """Warm inventory caches"""
        try:
            from inventory.services import InventoryService
            from settings.config import app_settings
            
            # Get default location for stock levels
            default_location = app_settings.get_default_location()
            stock_levels = InventoryService.get_stock_levels_by_location(default_location.id)
            recipe_map = InventoryService.get_recipe_ingredients_map()
            availability = InventoryService.get_inventory_availability_status(default_location.id)
            
            return f"Warmed inventory: {len(stock_levels)} stock levels, {len(recipe_map)} recipes, {len(availability)} availability statuses"
        except ImportError:
            return "Inventory service not available"
    
    @classmethod
    def _warm_orders_cache(cls):
        """Warm order calculation caches"""
        try:
            from orders.services import OrderService
            
            # Warm tax calculation matrix
            tax_matrix = OrderService.get_tax_calculation_matrix()
            
            return f"Warmed order calculations: tax matrix with {len(tax_matrix.get('matrix', {}))} price points"
        except ImportError:
            return "Orders service not available"
    
    @classmethod
    def _warm_pos_layout_cache(cls):
        """Warm complete POS layout cache"""
        try:
            from products.services import ProductService
            
            # This will warm all dependent caches too
            layout = ProductService.get_pos_menu_layout()
            metadata = layout.get('metadata', {})
            
            return f"Warmed POS layout: {metadata.get('total_products', 0)} products, {metadata.get('total_categories', 0)} categories, {metadata.get('total_modifiers', 0)} modifiers"
        except ImportError:
            return "Products service not available"
    
    @classmethod
    def _warm_reports_cache(cls):
        """Warm advanced reports caches"""
        try:
            from reports.services_new.metrics_service import BusinessMetricsService
            
            # Warm business KPIs and historical trends
            business_kpis = BusinessMetricsService.get_cached_business_kpis()
            historical_trends = BusinessMetricsService.get_historical_trends_data()
            
            return f"Warmed reports: ${business_kpis.get('monthly_revenue', 0):.0f} monthly revenue, {len(historical_trends.get('monthly_trends', []))} trend points"
        except ImportError:
            return "Reports service not available"
    
    @classmethod
    def _warm_analytics_cache(cls):
        """Warm sales and payment analytics caches"""
        try:
            from reports.services_new.metrics_service import BusinessMetricsService
            
            # Warm real-time sales and payment analytics
            sales_summary = BusinessMetricsService.get_real_time_sales_summary()
            payment_analytics = BusinessMetricsService.get_payment_analytics()
            
            return f"Warmed analytics: ${sales_summary.get('today_revenue', 0):.0f} today, {len(payment_analytics.get('payment_methods', []))} payment methods"
        except ImportError:
            return "Reports service not available"
    
    @classmethod
    def _warm_performance_cache(cls):
        """Warm performance monitoring caches"""
        try:
            from reports.services_new.metrics_service import BusinessMetricsService
            
            # Warm performance monitoring
            performance_data = BusinessMetricsService.get_performance_monitoring_cache()
            cache_health = performance_data.get('cache_health', {})
            
            healthy_caches = sum(1 for status in cache_health.values() if status.get('status') == 'healthy')
            total_caches = len(cache_health)
            
            return f"Warmed performance monitoring: {healthy_caches}/{total_caches} caches healthy"
        except ImportError:
            return "Reports service not available"

def advanced_cache(timeout=300, cache_name='default', key_prefix=None, 
                  version=None, warm_on_miss=False, serialize_complex=True):
    """Advanced caching decorator with warming and serialization"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate sophisticated cache key
            if key_prefix:
                cache_key = f"{key_prefix}:{func.__name__}"
            else:
                cache_key = f"{func.__module__}:{func.__name__}"
            
            # Add version and parameters
            cache_key = AdvancedCacheManager.cache_key(
                'function', cache_key, 'result', version=version,
                args_hash=hashlib.md5(str(args).encode()).hexdigest()[:8],
                kwargs_hash=hashlib.md5(str(sorted(kwargs.items())).encode()).hexdigest()[:8]
            )
            
            cache = AdvancedCacheManager.get_cache(cache_name)
            if not cache:
                return func(*args, **kwargs)  # Graceful degradation
            
            try:
                result = cache.get(cache_key)
                
                if result is None:
                    # Cache warming lock for expensive operations
                    if warm_on_miss:
                        with AdvancedCacheManager.cache_lock(f"warm_{cache_key}"):
                            result = cache.get(cache_key)  # Double-check after lock
                            if result is None:
                                result = func(*args, **kwargs)
                                if serialize_complex:
                                    result = _serialize_complex_types(result)
                                cache.set(cache_key, result, timeout)
                    else:
                        result = func(*args, **kwargs)
                        if serialize_complex:
                            result = _serialize_complex_types(result)
                        cache.set(cache_key, result, timeout)
                    
                    logger.debug(f"Cache MISS: {cache_key}")
                else:
                    logger.debug(f"Cache HIT: {cache_key}")
                
                return result
                
            except Exception as e:
                logger.error(f"Cache operation failed for {cache_key}: {e}")
                return func(*args, **kwargs)  # Graceful degradation
                
        return wrapper
    return decorator

def _serialize_complex_types(data):
    """Handle complex Django types for cache serialization"""
    if hasattr(data, '__iter__') and not isinstance(data, (str, bytes)):
        # Handle querysets and model instances
        return [item.pk if hasattr(item, 'pk') else item for item in data]
    return data

# Cache monitoring utilities
class CacheMonitor:
    """Cache monitoring and metrics collection"""
    
    # Store performance metrics
    _performance_stats = {
        'total_hits': 0,
        'total_misses': 0,
        'total_requests': 0,
        'avg_hit_time': 0,
        'avg_miss_time': 0,
        'slow_queries': 0
    }
    
    @classmethod
    def get_all_cache_stats(cls):
        """Get comprehensive cache statistics"""
        cache_names = ['default', 'static_data', 'session_data']
        stats = {}
        
        for cache_name in cache_names:
            stats[cache_name] = AdvancedCacheManager.get_cache_stats(cache_name)
        
        return stats
    
    @classmethod
    def health_check(cls):
        """Perform cache health check"""
        results = {}
        cache_names = ['default', 'static_data', 'session_data']
        
        for cache_name in cache_names:
            try:
                cache = AdvancedCacheManager.get_cache(cache_name)
                if cache:
                    # Test basic operations
                    test_key = f"health_check_{cache_name}_{int(time.time())}"
                    cache.set(test_key, "test", 10)
                    value = cache.get(test_key)
                    cache.delete(test_key)
                    
                    results[cache_name] = {
                        'status': 'healthy' if value == "test" else 'degraded',
                        'available': True,
                        'circuit_open': AdvancedCacheManager._is_circuit_open(cache_name)
                    }
                else:
                    results[cache_name] = {
                        'status': 'unavailable',
                        'available': False,
                        'circuit_open': AdvancedCacheManager._is_circuit_open(cache_name)
                    }
            except Exception as e:
                results[cache_name] = {
                    'status': 'error',
                    'available': False,
                    'error': str(e),
                    'circuit_open': AdvancedCacheManager._is_circuit_open(cache_name)
                }
        
        return results
    
    @classmethod
    def log_cache_performance(cls, cache_key, hit=True, execution_time=None, cache_name='default'):
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
                    # Changed to INFO so cache hits are visible in production logs
                    logger.info(f"⚡ CACHE {status} [{cache_source}]: {cache_key[:50]}... took {execution_time:.1f}ms")
                    
                # Track cache performance metrics (could be sent to monitoring service)
                cls._track_cache_metrics(cache_key, hit, execution_time, cache_name)
                    
        except Exception as e:
            logger.error(f"Error logging cache performance: {e}")
    
    @classmethod
    def _track_cache_metrics(cls, cache_key, hit, execution_time, cache_name):
        """Track cache metrics for monitoring (moved from cache_utils.py)"""
        try:
            stats = cls._performance_stats
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
    
    @classmethod
    def get_cache_performance_stats(cls):
        """Get current cache performance statistics"""
        try:
            stats = cls._performance_stats.copy()
            if stats['total_requests'] > 0:
                stats['hit_rate'] = (stats['total_hits'] / stats['total_requests']) * 100
                stats['miss_rate'] = (stats['total_misses'] / stats['total_requests']) * 100
            else:
                stats['hit_rate'] = 0
                stats['miss_rate'] = 0
            return stats
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return None
    
    @classmethod
    def clear_cache_performance_stats(cls):
        """Clear cache performance statistics"""
        try:
            cls._performance_stats = {
                'total_hits': 0,
                'total_misses': 0,
                'total_requests': 0,
                'avg_hit_time': 0,
                'avg_miss_time': 0,
                'slow_queries': 0
            }
            logger.info("Cache performance stats cleared")
        except Exception as e:
            logger.error(f"Error clearing cache stats: {e}")

# Convenience functions for common cache operations
def cache_get_or_set(key, callable_func, timeout=300, cache_name='default'):
    """Get from cache or set if not exists"""
    cache = AdvancedCacheManager.get_cache(cache_name)
    if not cache:
        return callable_func()
    
    try:
        result = cache.get(key)
        if result is None:
            result = callable_func()
            cache.set(key, result, timeout)
        return result
    except Exception as e:
        logger.error(f"Cache get_or_set failed for {key}: {e}")
        return callable_func()

def invalidate_cache_groups(*groups):
    """Invalidate multiple cache groups"""
    for group in groups:
        for cache_name in ['default', 'static_data']:
            AdvancedCacheManager.invalidate_pattern(f"*{group}*", cache_name)