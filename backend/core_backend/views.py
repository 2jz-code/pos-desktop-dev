from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from django.http import JsonResponse
from .infrastructure.cache import CacheMonitor, AdvancedCacheManager, CacheWarmingManager
import logging

logger = logging.getLogger(__name__)

@api_view(['GET'])
@permission_classes([IsAdminUser])
def cache_health_check(request):
    """API endpoint for cache health monitoring"""
    try:
        health_results = CacheMonitor.health_check()
        stats = CacheMonitor.get_all_cache_stats()
        
        overall_status = 'healthy'
        if any(result.get('status') != 'healthy' for result in health_results.values()):
            overall_status = 'degraded'
        
        return Response({
            'overall_status': overall_status,
            'timestamp': request.META.get('HTTP_DATE'),
            'caches': health_results,
            'statistics': stats
        })
    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        return Response({
            'error': 'Health check failed',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def warm_caches(request):
    """API endpoint to manually trigger cache warming"""
    try:
        results = CacheWarmingManager.warm_critical_caches()
        
        success_count = sum(1 for r in results if r['success'])
        total_count = len(results)
        
        return Response({
            'status': 'completed',
            'message': f'Cache warming completed: {success_count}/{total_count} successful',
            'results': results
        })
    except Exception as e:
        logger.error(f"Manual cache warming failed: {e}")
        return Response({
            'error': 'Cache warming failed',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def invalidate_cache(request):
    """API endpoint to invalidate cache patterns"""
    pattern = request.data.get('pattern')
    cache_name = request.data.get('cache_name', 'default')
    
    if not pattern:
        return Response({
            'error': 'Pattern is required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = AdvancedCacheManager.invalidate_pattern(pattern, cache_name)
        
        if result:
            return Response({
                'status': 'success',
                'message': f'Cache pattern "{pattern}" invalidated in {cache_name}'
            })
        else:
            return Response({
                'status': 'failed',
                'message': f'Failed to invalidate pattern "{pattern}" in {cache_name}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"Cache invalidation failed: {e}")
        return Response({
            'error': 'Cache invalidation failed',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAdminUser])
def cache_statistics(request):
    """API endpoint for detailed cache statistics"""
    try:
        stats = CacheMonitor.get_all_cache_stats()
        
        # Add circuit breaker states
        circuit_states = {}
        for cache_name in ['default', 'static_data', 'session_data']:
            circuit_states[cache_name] = {
                'is_open': AdvancedCacheManager._is_circuit_open(cache_name),
                'state': AdvancedCacheManager._circuit_breaker_state.get(cache_name, {})
            }
        
        return Response({
            'statistics': stats,
            'circuit_breakers': circuit_states,
            'timestamp': request.META.get('HTTP_DATE')
        })
    except Exception as e:
        logger.error(f"Failed to get cache statistics: {e}")
        return Response({
            'error': 'Failed to get statistics',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)