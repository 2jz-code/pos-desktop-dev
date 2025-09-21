from typing import Dict, List, Any
from django.utils import timezone
from django.db.models import Avg, Count, Q
from datetime import datetime, timedelta
import logging

from ..models import KDSOrder, KDSOrderStatus
from .zone_service import KDSZoneService

logger = logging.getLogger(__name__)


class KDSOverviewService:
    """Service for kitchen overview and cross-zone metrics"""

    @classmethod
    def get_kitchen_overview(cls) -> Dict[str, Any]:
        """
        Get comprehensive kitchen overview with all zones and metrics

        Returns:
            Dict containing zones data and global metrics
        """
        try:
            logger.info("Getting kitchen overview data")

            # Get all active zones
            zones_dict = KDSZoneService.get_all_zones()
            zones_data = []

            total_active_orders = 0
            total_prep_times = []

            for zone_id, zone in zones_dict.items():
                zone_data = cls._get_zone_overview(zone_id)
                zones_data.append(zone_data)

                # Aggregate for global metrics
                total_active_orders += zone_data['metrics']['active_orders']
                if zone_data['metrics']['avg_prep_time'] > 0:
                    total_prep_times.append(zone_data['metrics']['avg_prep_time'])

            # Calculate global metrics
            global_metrics = cls._calculate_global_metrics(zones_data, total_active_orders, total_prep_times)

            return {
                'zones': zones_data,
                'global_metrics': global_metrics,
                'timestamp': timezone.now().isoformat(),
                'success': True
            }

        except Exception as e:
            logger.error(f"Error getting kitchen overview: {e}")
            return {
                'zones': [],
                'global_metrics': {},
                'error': str(e),
                'timestamp': timezone.now().isoformat(),
                'success': False
            }

    @classmethod
    def _get_zone_overview(cls, zone_id: str) -> Dict[str, Any]:
        """Get overview data for a specific zone"""
        try:
            # Get zone info
            zone = KDSZoneService.get_zone(zone_id)
            zone_type = zone.zone_type if zone else 'kitchen'

            # Get active orders for this zone
            if zone_type == 'qc':
                # QC sees all orders ready for QC
                active_orders = list(KDSOrder.objects.filter(
                    status=KDSOrderStatus.READY
                ).prefetch_related('items__order_item__product')[:50])
            else:
                # Kitchen zones see orders with items assigned to them
                active_orders = list(KDSOrder.objects.filter(
                    status__in=[KDSOrderStatus.PENDING, KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY],
                    assigned_kitchen_zones__contains=[zone_id]
                ).prefetch_related('items__order_item__product')[:50])

            # Convert to simplified display format for overview
            orders_display = []
            for order in active_orders:
                order_summary = {
                    'id': str(order.id),
                    'order_number': order.order.order_number,
                    'status': order.status,
                    'is_priority': order.is_priority,
                    'created_at': order.created_at.isoformat() if order.created_at else None,
                    'started_at': order.started_at.isoformat() if order.started_at else None,
                    'ready_at': order.ready_at.isoformat() if order.ready_at else None,
                    'item_count': order.items.count(),
                    'customer_name': order.get_customer_display_info().get('name', 'Guest'),
                    'assigned_zones': order.assigned_kitchen_zones
                }

                # Add zone-specific item counts
                if zone_type == 'qc':
                    # For QC, count items by zone
                    zone_items = {}
                    for item in order.items.all():
                        zone_key = item.assigned_zone
                        if zone_key not in zone_items:
                            zone_items[zone_key] = 0
                        zone_items[zone_key] += 1
                    order_summary['zone_items'] = zone_items
                else:
                    # For kitchen zones, count items for this zone only
                    zone_item_count = order.items.filter(assigned_zone=zone_id).count()
                    order_summary['zone_item_count'] = zone_item_count

                orders_display.append(order_summary)

            # Calculate zone metrics
            zone_metrics = cls._calculate_zone_metrics(zone_id, zone_type)

            return {
                'zone_id': zone_id,
                'zone_type': zone_type,
                'zone_name': zone_id,  # Use zone_id as name for now
                'is_active': True,  # All configured zones are active
                'orders': orders_display,
                'metrics': zone_metrics
            }

        except Exception as e:
            logger.error(f"Error getting zone overview for {zone_id}: {e}")
            return {
                'zone_id': zone_id,
                'zone_type': 'kitchen',
                'zone_name': zone_id,
                'is_active': False,
                'orders': [],
                'metrics': cls._get_empty_metrics(),
                'error': str(e)
            }

    @classmethod
    def _calculate_zone_metrics(cls, zone_id: str, zone_type: str) -> Dict[str, Any]:
        """Calculate metrics for a specific zone"""
        try:
            now = timezone.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            hour_ago = now - timedelta(hours=1)

            if zone_type == 'qc':
                # QC metrics - all orders
                base_queryset = KDSOrder.objects.all()
                active_orders = KDSOrder.objects.filter(status=KDSOrderStatus.READY).count()
            else:
                # Kitchen zone metrics - only orders assigned to this zone
                base_queryset = KDSOrder.objects.filter(assigned_kitchen_zones__contains=[zone_id])
                active_orders = base_queryset.filter(
                    status__in=[KDSOrderStatus.PENDING, KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY]
                ).count()

            # Completed orders today
            completed_today = base_queryset.filter(
                status=KDSOrderStatus.COMPLETED,
                completed_at__gte=today_start
            ).count()

            # Orders completed in last hour
            completed_last_hour = base_queryset.filter(
                status=KDSOrderStatus.COMPLETED,
                completed_at__gte=hour_ago
            ).count()

            # Calculate average prep time manually (since it's a property)
            completed_orders_today = base_queryset.filter(
                status=KDSOrderStatus.COMPLETED,
                completed_at__gte=today_start
            )

            prep_times = []
            total_times = []
            for order in completed_orders_today:
                if order.prep_time_minutes > 0:
                    prep_times.append(order.prep_time_minutes)
                if order.total_time_minutes > 0:
                    total_times.append(order.total_time_minutes)

            avg_prep_time = sum(prep_times) / len(prep_times) if prep_times else 0
            avg_total_time = sum(total_times) / len(total_times) if total_times else 0

            # Orders per hour (based on last hour)
            orders_per_hour = completed_last_hour  # This is already the count for 1 hour

            return {
                'active_orders': active_orders,
                'completed_today': completed_today,
                'completed_last_hour': completed_last_hour,
                'avg_prep_time': round(avg_prep_time, 1),
                'avg_total_time': round(avg_total_time, 1),
                'orders_per_hour': orders_per_hour,
                'last_updated': now.isoformat()
            }

        except Exception as e:
            logger.error(f"Error calculating metrics for zone {zone_id}: {e}")
            return cls._get_empty_metrics()

    @classmethod
    def _calculate_global_metrics(cls, zones_data: List[Dict], total_active_orders: int, total_prep_times: List[float]) -> Dict[str, Any]:
        """Calculate global kitchen metrics"""
        try:
            # Overall averages
            avg_prep_time_all_zones = sum(total_prep_times) / len(total_prep_times) if total_prep_times else 0

            # Find busiest zone (most active orders)
            busiest_zone = None
            max_active = 0
            for zone in zones_data:
                if zone['metrics']['active_orders'] > max_active:
                    max_active = zone['metrics']['active_orders']
                    busiest_zone = zone['zone_id']

            # Total orders per hour across all zones
            total_orders_per_hour = sum(zone['metrics']['orders_per_hour'] for zone in zones_data)

            # Total completed today across all zones
            total_completed_today = sum(zone['metrics']['completed_today'] for zone in zones_data)

            return {
                'total_active_orders': total_active_orders,
                'avg_prep_time_all_zones': round(avg_prep_time_all_zones, 1),
                'total_orders_per_hour': total_orders_per_hour,
                'total_completed_today': total_completed_today,
                'busiest_zone': busiest_zone,
                'total_zones': len(zones_data),
                'active_zones': len([z for z in zones_data if z['is_active']])
            }

        except Exception as e:
            logger.error(f"Error calculating global metrics: {e}")
            return {
                'total_active_orders': 0,
                'avg_prep_time_all_zones': 0,
                'total_orders_per_hour': 0,
                'total_completed_today': 0,
                'busiest_zone': None,
                'total_zones': 0,
                'active_zones': 0
            }

    @classmethod
    def _get_empty_metrics(cls) -> Dict[str, Any]:
        """Return empty metrics structure"""
        return {
            'active_orders': 0,
            'completed_today': 0,
            'completed_last_hour': 0,
            'avg_prep_time': 0,
            'avg_total_time': 0,
            'orders_per_hour': 0,
            'last_updated': timezone.now().isoformat()
        }