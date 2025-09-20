from typing import Dict, List, Optional, Any, Tuple
from django.utils import timezone
from django.core.paginator import Paginator
from datetime import datetime, timedelta
import logging

from ..models import KDSOrder, KDSOrderItem, KDSOrderStatus

logger = logging.getLogger(__name__)


class KDSHistoryService:
    """Centralized business logic for KDS history and completed orders"""

    @classmethod
    def _is_qc_zone(cls, zone_id: str) -> bool:
        """Check if a zone is a QC zone"""
        try:
            from .zone_service import KDSZoneService
            zone = KDSZoneService.get_zone(zone_id)
            logger.info(f"Zone service returned for {zone_id}: {zone}")
            if zone:
                logger.info(f"Zone {zone_id} type: {zone.zone_type}")
                return zone.zone_type == 'qc'
            else:
                logger.warning(f"Zone service returned None for {zone_id}")
                return False
        except Exception as e:
            logger.warning(f"Could not determine zone type for {zone_id}: {e}")
            return False

    @classmethod
    def get_zone_history(
        cls,
        zone_id: str,
        page: int = 1,
        page_size: int = 50,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        search_term: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get paginated history for a specific zone with optional search

        Returns:
            Dict containing orders, pagination info, and metadata
        """
        try:
            logger.info(f"Getting history for zone {zone_id}, page {page}, search: {search_term}")

            # Determine if this is a QC zone
            is_qc_zone = cls._is_qc_zone(zone_id)
            logger.info(f"Zone {zone_id} detected as QC zone: {is_qc_zone}")

            # Also check total completed orders in system for debugging
            total_completed = KDSOrder.objects.filter(status=KDSOrderStatus.COMPLETED).count()
            logger.info(f"Total completed orders in system: {total_completed}")

            # Use model manager for optimized queries
            if search_term:
                if is_qc_zone:
                    # QC zones see all completed orders, not zone-specific
                    queryset = KDSOrder.objects.search_completed_orders(
                        search_term=search_term,
                        zone_id=None,  # All zones for QC
                        date_from=date_from,
                        date_to=date_to,
                        limit=1000
                    )
                else:
                    queryset = KDSOrder.objects.search_completed_orders(
                        search_term=search_term,
                        zone_id=zone_id,
                        date_from=date_from,
                        date_to=date_to,
                        limit=1000
                    )
            else:
                if is_qc_zone:
                    # QC zones see all completed orders - use search method with empty term
                    queryset = KDSOrder.objects.search_completed_orders(
                        search_term="",  # Empty search term to get all
                        zone_id=None,   # No zone filtering for QC
                        date_from=date_from,
                        date_to=date_to,
                        limit=1000
                    )
                else:
                    queryset = KDSOrder.objects.completed_orders_for_zone(
                        zone_id=zone_id,
                        date_from=date_from,
                        date_to=date_to,
                        limit=1000
                    )

            # Paginate results
            paginator = Paginator(queryset, page_size)
            page_obj = paginator.get_page(page)

            # Convert to history summary format
            orders_data = []
            for kds_order in page_obj.object_list:
                try:
                    order_data = kds_order.get_history_summary()

                    if is_qc_zone:
                        # For QC zones, show all items grouped by zone
                        items_by_zone = {}
                        for item in kds_order.items.all():
                            zone = item.assigned_zone
                            if zone not in items_by_zone:
                                items_by_zone[zone] = []
                            items_by_zone[zone].append(item.get_history_summary())
                        order_data['items_by_zone'] = items_by_zone
                    else:
                        # For kitchen zones, show only items for this zone
                        zone_items = []
                        for item in kds_order.items.filter(assigned_zone=zone_id):
                            zone_items.append(item.get_history_summary())
                        order_data['zone_items'] = zone_items

                    orders_data.append(order_data)

                except Exception as e:
                    logger.error(f"Error formatting order {kds_order.id} for history: {e}")
                    continue

            result = {
                'orders': orders_data,
                'pagination': {
                    'current_page': page,
                    'total_pages': paginator.num_pages,
                    'total_count': paginator.count,
                    'page_size': page_size,
                    'has_next': page_obj.has_next(),
                    'has_previous': page_obj.has_previous(),
                },
                'filters': {
                    'zone_id': zone_id,
                    'date_from': date_from.isoformat() if date_from else None,
                    'date_to': date_to.isoformat() if date_to else None,
                    'search_term': search_term,
                },
                'metadata': {
                    'query_timestamp': timezone.now().isoformat(),
                    'result_count': len(orders_data),
                }
            }

            logger.info(f"Successfully retrieved {len(orders_data)} orders for zone {zone_id}")
            return result

        except Exception as e:
            logger.error(f"Error getting zone history: {e}")
            return {
                'orders': [],
                'pagination': {
                    'current_page': 1,
                    'total_pages': 0,
                    'total_count': 0,
                    'page_size': page_size,
                    'has_next': False,
                    'has_previous': False,
                },
                'filters': {
                    'zone_id': zone_id,
                    'date_from': date_from.isoformat() if date_from else None,
                    'date_to': date_to.isoformat() if date_to else None,
                    'search_term': search_term,
                },
                'error': str(e)
            }

    @classmethod
    def search_all_zones(
        cls,
        search_term: str,
        page: int = 1,
        page_size: int = 50,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Search completed orders across all zones

        Returns:
            Dict containing search results and pagination info
        """
        try:
            logger.info(f"Searching all zones for: {search_term}")

            if not search_term or len(search_term.strip()) < 2:
                return {
                    'orders': [],
                    'pagination': {
                        'current_page': 1,
                        'total_pages': 0,
                        'total_count': 0,
                        'page_size': page_size,
                        'has_next': False,
                        'has_previous': False,
                    },
                    'error': 'Search term must be at least 2 characters'
                }

            # Search across all zones
            queryset = KDSOrder.objects.search_completed_orders(
                search_term=search_term.strip(),
                zone_id=None,  # All zones
                date_from=date_from,
                date_to=date_to,
                limit=1000
            )

            # Paginate results
            paginator = Paginator(queryset, page_size)
            page_obj = paginator.get_page(page)

            # Convert to history summary format
            orders_data = []
            for kds_order in page_obj.object_list:
                try:
                    order_data = kds_order.get_history_summary()

                    # Add all items grouped by zone
                    items_by_zone = {}
                    for item in kds_order.items.all():
                        zone = item.assigned_zone
                        if zone not in items_by_zone:
                            items_by_zone[zone] = []
                        items_by_zone[zone].append(item.get_history_summary())

                    order_data['items_by_zone'] = items_by_zone
                    orders_data.append(order_data)

                except Exception as e:
                    logger.error(f"Error formatting order {kds_order.id} for search: {e}")
                    continue

            result = {
                'orders': orders_data,
                'pagination': {
                    'current_page': page,
                    'total_pages': paginator.num_pages,
                    'total_count': paginator.count,
                    'page_size': page_size,
                    'has_next': page_obj.has_next(),
                    'has_previous': page_obj.has_previous(),
                },
                'search': {
                    'term': search_term,
                    'date_from': date_from.isoformat() if date_from else None,
                    'date_to': date_to.isoformat() if date_to else None,
                },
                'metadata': {
                    'query_timestamp': timezone.now().isoformat(),
                    'result_count': len(orders_data),
                }
            }

            logger.info(f"Search returned {len(orders_data)} results for '{search_term}'")
            return result

        except Exception as e:
            logger.error(f"Error searching orders: {e}")
            return {
                'orders': [],
                'pagination': {
                    'current_page': 1,
                    'total_pages': 0,
                    'total_count': 0,
                    'page_size': page_size,
                    'has_next': False,
                    'has_previous': False,
                },
                'search': {
                    'term': search_term,
                    'date_from': date_from.isoformat() if date_from else None,
                    'date_to': date_to.isoformat() if date_to else None,
                },
                'error': str(e)
            }

    @classmethod
    def get_order_timeline(cls, kds_order_id: str) -> Dict[str, Any]:
        """
        Get detailed timeline for a specific order

        Returns:
            Dict containing timeline events and order details
        """
        try:
            logger.info(f"Getting timeline for KDS order {kds_order_id}")

            kds_order = KDSOrder.objects.get_optimized_queryset().get(id=kds_order_id)

            timeline_data = kds_order.get_timeline_data()
            order_summary = kds_order.get_history_summary()

            # Get detailed item information
            items_detail = []
            for item in kds_order.items.all():
                items_detail.append({
                    **item.get_history_summary(),
                    'order_item_details': {
                        'product_id': item.order_item.product.id if item.order_item.product else None,
                        'product_category': item.order_item.product.category.name if item.order_item.product and hasattr(item.order_item.product, 'category') else None,
                        'price_at_sale': str(item.order_item.price_at_sale) if hasattr(item.order_item, 'price_at_sale') else None,
                    }
                })

            result = {
                'order': order_summary,
                'timeline': timeline_data,
                'items': items_detail,
                'metadata': {
                    'query_timestamp': timezone.now().isoformat(),
                    'timeline_events_count': len(timeline_data),
                }
            }

            logger.info(f"Successfully retrieved timeline for order {kds_order_id}")
            return result

        except KDSOrder.DoesNotExist:
            logger.error(f"KDS order {kds_order_id} not found")
            return {
                'error': 'Order not found',
                'order': None,
                'timeline': [],
                'items': []
            }
        except Exception as e:
            logger.error(f"Error getting order timeline: {e}")
            return {
                'error': str(e),
                'order': None,
                'timeline': [],
                'items': []
            }

    @classmethod
    def get_recent_completed_summary(cls, zone_id: Optional[str] = None, hours: int = 24) -> Dict[str, Any]:
        """
        Get summary statistics for recently completed orders

        Returns:
            Dict containing summary statistics
        """
        try:
            logger.info(f"Getting recent completed summary for zone {zone_id}, last {hours} hours")

            cutoff_time = timezone.now() - timedelta(hours=hours)

            if zone_id:
                completed_orders = KDSOrder.objects.filter(
                    status=KDSOrderStatus.COMPLETED,
                    assigned_kitchen_zones__contains=[zone_id],
                    completed_at__gte=cutoff_time
                )
            else:
                completed_orders = KDSOrder.objects.filter(
                    status=KDSOrderStatus.COMPLETED,
                    completed_at__gte=cutoff_time
                )

            # Calculate statistics
            total_orders = completed_orders.count()

            if total_orders > 0:
                prep_times = [order.prep_time_minutes for order in completed_orders if order.prep_time_minutes > 0]
                total_times = [order.total_time_minutes for order in completed_orders if order.total_time_minutes > 0]

                avg_prep_time = sum(prep_times) / len(prep_times) if prep_times else 0
                avg_total_time = sum(total_times) / len(total_times) if total_times else 0

                priority_orders = completed_orders.filter(is_priority=True).count()
            else:
                avg_prep_time = 0
                avg_total_time = 0
                priority_orders = 0

            result = {
                'summary': {
                    'total_completed_orders': total_orders,
                    'priority_orders': priority_orders,
                    'average_prep_time_minutes': round(avg_prep_time, 1),
                    'average_total_time_minutes': round(avg_total_time, 1),
                },
                'filters': {
                    'zone_id': zone_id,
                    'hours': hours,
                    'cutoff_time': cutoff_time.isoformat(),
                },
                'metadata': {
                    'query_timestamp': timezone.now().isoformat(),
                }
            }

            logger.info(f"Retrieved summary: {total_orders} orders in last {hours} hours")
            return result

        except Exception as e:
            logger.error(f"Error getting recent completed summary: {e}")
            return {
                'summary': {
                    'total_completed_orders': 0,
                    'priority_orders': 0,
                    'average_prep_time_minutes': 0,
                    'average_total_time_minutes': 0,
                },
                'error': str(e)
            }

    @classmethod
    def parse_date_filters(cls, date_from_str: Optional[str], date_to_str: Optional[str]) -> Tuple[Optional[datetime], Optional[datetime]]:
        """
        Parse date filter strings into datetime objects

        Returns:
            Tuple of (date_from, date_to) datetime objects
        """
        try:
            date_from = None
            date_to = None

            if date_from_str:
                date_from = datetime.fromisoformat(date_from_str.replace('Z', '+00:00'))
                if timezone.is_naive(date_from):
                    date_from = timezone.make_aware(date_from)

            if date_to_str:
                date_to = datetime.fromisoformat(date_to_str.replace('Z', '+00:00'))
                if timezone.is_naive(date_to):
                    date_to = timezone.make_aware(date_to)

            # Default date range if none provided
            if not date_from:
                date_from = timezone.now() - timedelta(days=7)  # Last 7 days by default

            if not date_to:
                date_to = timezone.now()

            return date_from, date_to

        except (ValueError, TypeError) as e:
            logger.warning(f"Error parsing date filters: {e}")
            # Return default range
            return (
                timezone.now() - timedelta(days=7),
                timezone.now()
            )