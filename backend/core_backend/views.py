from rest_framework.decorators import api_view, permission_classes
from users.permissions import IsAdminOrHigher
from rest_framework.response import Response
from rest_framework import status
from django.http import JsonResponse
from .infrastructure.cache import CacheMonitor, AdvancedCacheManager, CacheWarmingManager
from django.conf import settings
import secrets
import logging
from django_ratelimit.decorators import ratelimit

logger = logging.getLogger(__name__)

@api_view(['GET'])
@permission_classes([IsAdminOrHigher])
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
@permission_classes([IsAdminOrHigher])
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
@permission_classes([IsAdminOrHigher])
def invalidate_cache(request):
    """API endpoint to invalidate cache patterns with proper tenant scoping"""
    pattern = request.data.get('pattern')
    cache_name = request.data.get('cache_name', 'static_data')

    if not pattern:
        return Response({
            'error': 'Pattern is required'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Use centralized function with tenant scoping for proper multi-tenant cache invalidation
        from .infrastructure.cache_utils import invalidate_cache_pattern
        result = invalidate_cache_pattern(pattern, cache_name=cache_name, tenant=request.tenant)

        tenant_name = request.tenant.name if hasattr(request, 'tenant') and request.tenant else 'None'

        if result:
            return Response({
                'status': 'success',
                'message': f'Cache pattern "{pattern}" invalidated in {cache_name} for tenant {tenant_name}'
            })
        else:
            return Response({
                'status': 'failed',
                'message': f'Failed to invalidate pattern "{pattern}" in {cache_name} for tenant {tenant_name}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"Cache invalidation failed: {e}")
        return Response({
            'error': 'Cache invalidation failed',
            'details': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAdminOrHigher])
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

def ratelimited429(request, exception=None):
    """Default JSON response for rate-limited requests (HTTP 429)."""
    return JsonResponse({"error": "Too many requests"}, status=429)


@ratelimit(key='ip', rate='60/m', method='GET', block=True)
@api_view(['GET'])
@permission_classes([])  # AllowAny
def issue_csrf_token(request):
    """
    Issue a CSRF token for double-submit pattern.
    - Sets a Secure, HttpOnly cookie `csrf_token` (SameSite=None for Electron).
    - Returns the token in the response body so Electron can store it in memory.
    """
    try:
        token = secrets.token_urlsafe(32)

        # Cookie security based on environment
        is_secure = getattr(settings, 'CSRF_COOKIE_SECURE', True)
        samesite_policy = getattr(settings, 'CSRF_COOKIE_SAMESITE', 'None') or 'None'

        resp = Response({
            'csrfToken': token
        }, status=status.HTTP_200_OK)

        resp.set_cookie(
            key='csrf_token',
            value=token,
            max_age=60 * 60,  # 1 hour
            path='/',
            domain=None,
            secure=is_secure,
            httponly=True,  # Prevent JS access; Electron reads from body
            samesite=samesite_policy,
        )
        return resp
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
