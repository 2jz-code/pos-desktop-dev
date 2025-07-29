"""
Simple cache monitoring utilities for Phase 1 performance testing
"""
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.contrib.admin.views.decorators import staff_member_required
import time

@require_GET
@staff_member_required
def cache_stats(request):
    """
    Simple cache statistics endpoint for monitoring performance
    Access at: /admin/cache-stats/
    """
    try:
        # Test cache connectivity
        test_key = f"cache_test_{int(time.time())}"
        cache.set(test_key, "test", 10)
        cache_available = cache.get(test_key) == "test"
        cache.delete(test_key)
        
        # Get Redis info if available
        cache_info = {}
        if hasattr(cache, '_cache') and hasattr(cache._cache, 'get_client'):
            try:
                client = cache._cache.get_client(write=False)
                info = client.info()
                cache_info = {
                    'redis_version': info.get('redis_version', 'Unknown'),
                    'used_memory_human': info.get('used_memory_human', 'Unknown'),
                    'connected_clients': info.get('connected_clients', 'Unknown'),
                    'total_commands_processed': info.get('total_commands_processed', 'Unknown'),
                    'keyspace_hits': info.get('keyspace_hits', 0),
                    'keyspace_misses': info.get('keyspace_misses', 0),
                }
                
                # Calculate hit rate
                hits = int(cache_info['keyspace_hits'])
                misses = int(cache_info['keyspace_misses'])
                total = hits + misses
                hit_rate = (hits / total * 100) if total > 0 else 0
                cache_info['hit_rate_percentage'] = round(hit_rate, 1)
                
            except Exception as e:
                cache_info['error'] = f"Could not get Redis info: {str(e)}"
        
        return JsonResponse({
            'cache_available': cache_available,
            'cache_backend': str(cache.__class__),
            'timestamp': int(time.time()),
            'redis_info': cache_info,
            'cached_keys_sample': [
                'products_all',
                'products_active',  # New POS-specific cache
                'categories_tree', 
                'product_types',
                'taxes',
                'modifier_sets',
                'global_settings',
                'store_locations'
            ]
        })
        
    except Exception as e:
        return JsonResponse({
            'error': f"Cache monitoring failed: {str(e)}",
            'cache_available': False
        }, status=500)


def clear_cache_pattern(request, pattern):
    """
    Clear cache by pattern - for testing performance
    Access at: /admin/clear-cache/{pattern}/
    """
    if not request.user.is_staff:
        return JsonResponse({'error': 'Unauthorized'}, status=403)
        
    try:
        from .cache_utils import invalidate_cache_pattern
        invalidate_cache_pattern(pattern)
        return JsonResponse({
            'success': True,
            'message': f'Cleared cache pattern: {pattern}',
            'timestamp': int(time.time())
        })
    except Exception as e:
        return JsonResponse({
            'error': f'Failed to clear cache: {str(e)}'
        }, status=500)