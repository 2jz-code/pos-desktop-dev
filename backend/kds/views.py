from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import datetime, timedelta
import logging

from .services.history_service import KDSHistoryService

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def zone_history(request, zone_id):
    """
    Get paginated history for a specific zone

    Query parameters:
    - page: Page number (default: 1)
    - page_size: Items per page (default: 50)
    - date_from: Start date (ISO format)
    - date_to: End date (ISO format)
    - search: Search term for filtering
    """
    try:
        page = int(request.GET.get('page', 1))
        page_size = min(int(request.GET.get('page_size', 50)), 100)  # Cap at 100
        date_from_str = request.GET.get('date_from')
        date_to_str = request.GET.get('date_to')
        search_term = request.GET.get('search', '').strip()

        # Parse date filters
        date_from, date_to = KDSHistoryService.parse_date_filters(date_from_str, date_to_str)

        # Get history data
        history_data = KDSHistoryService.get_zone_history(
            zone_id=zone_id,
            page=page,
            page_size=page_size,
            date_from=date_from,
            date_to=date_to,
            search_term=search_term if search_term else None
        )

        logger.info(f"API: Retrieved history for zone {zone_id}, page {page}, {len(history_data.get('orders', []))} orders")

        return Response(history_data, status=status.HTTP_200_OK)

    except ValueError as e:
        logger.warning(f"Invalid parameters for zone history: {e}")
        return Response(
            {'error': 'Invalid parameters', 'details': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"Error getting zone history: {e}")
        return Response(
            {'error': 'Internal server error', 'details': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_history(request):
    """
    Search completed orders across all zones

    Query parameters:
    - search: Search term (required, min 2 characters)
    - page: Page number (default: 1)
    - page_size: Items per page (default: 50)
    - date_from: Start date (ISO format)
    - date_to: End date (ISO format)
    """
    try:
        search_term = request.GET.get('search', '').strip()

        if not search_term or len(search_term) < 2:
            return Response(
                {'error': 'Search term must be at least 2 characters'},
                status=status.HTTP_400_BAD_REQUEST
            )

        page = int(request.GET.get('page', 1))
        page_size = min(int(request.GET.get('page_size', 50)), 100)  # Cap at 100
        date_from_str = request.GET.get('date_from')
        date_to_str = request.GET.get('date_to')

        # Parse date filters
        date_from, date_to = KDSHistoryService.parse_date_filters(date_from_str, date_to_str)

        # Search all zones
        search_data = KDSHistoryService.search_all_zones(
            search_term=search_term,
            page=page,
            page_size=page_size,
            date_from=date_from,
            date_to=date_to
        )

        logger.info(f"API: Search '{search_term}' returned {len(search_data.get('orders', []))} results")

        return Response(search_data, status=status.HTTP_200_OK)

    except ValueError as e:
        logger.warning(f"Invalid parameters for search: {e}")
        return Response(
            {'error': 'Invalid parameters', 'details': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"Error searching orders: {e}")
        return Response(
            {'error': 'Internal server error', 'details': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_timeline(request, order_id):
    """
    Get detailed timeline for a specific order

    URL parameters:
    - order_id: KDS Order ID
    """
    try:
        timeline_data = KDSHistoryService.get_order_timeline(order_id)

        if 'error' in timeline_data:
            if 'not found' in timeline_data['error'].lower():
                return Response(timeline_data, status=status.HTTP_404_NOT_FOUND)
            else:
                return Response(timeline_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        logger.info(f"API: Retrieved timeline for order {order_id}")

        return Response(timeline_data, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Error getting order timeline: {e}")
        return Response(
            {'error': 'Internal server error', 'details': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recent_summary(request):
    """
    Get summary statistics for recently completed orders

    Query parameters:
    - zone_id: Specific zone ID (optional, default: all zones)
    - hours: Number of hours to look back (default: 24)
    """
    try:
        zone_id = request.GET.get('zone_id')
        hours = int(request.GET.get('hours', 24))

        # Cap hours at reasonable limit
        hours = min(hours, 168)  # Max 1 week

        summary_data = KDSHistoryService.get_recent_completed_summary(
            zone_id=zone_id,
            hours=hours
        )

        logger.info(f"API: Retrieved recent summary for zone {zone_id}, last {hours} hours")

        return Response(summary_data, status=status.HTTP_200_OK)

    except ValueError as e:
        logger.warning(f"Invalid parameters for recent summary: {e}")
        return Response(
            {'error': 'Invalid parameters', 'details': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"Error getting recent summary: {e}")
        return Response(
            {'error': 'Internal server error', 'details': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
