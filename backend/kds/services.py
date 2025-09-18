"""
Legacy KDSService - redirects to new refactored services
This file maintains backward compatibility while transitioning to new architecture
"""

import logging
from typing import Dict, List, Optional

from .models import KDSOrder, KDSOrderItem, KDSSession
from .services.order_service import KDSOrderService
from .services.zone_service import KDSZoneService

logger = logging.getLogger(__name__)


class KDSService:
    """
    Legacy service layer - redirects to new refactored services
    """

    @staticmethod
    def create_kds_items_for_order(order, zone_assignments):
        """Redirect to new KDSOrderService"""
        logger.warning("Using legacy KDSService.create_kds_items_for_order - use KDSOrderService.create_from_order instead")
        return KDSOrderService.create_from_order(order, zone_assignments)

    @staticmethod
    def get_zone_type(zone_id):
        """Redirect to new KDSZoneService"""
        return KDSZoneService.get_zone_type(zone_id)

    @staticmethod
    def is_qc_zone(zone_id):
        """Redirect to new KDSZoneService"""
        return KDSZoneService.is_qc_zone(zone_id)

    @staticmethod
    def get_kitchen_zone_data(zone_id):
        """Get data for kitchen zones using new architecture"""
        zone = KDSZoneService.get_zone(zone_id)
        if zone and zone.zone_type == 'kitchen':
            return zone.get_orders()
        return []

    @staticmethod
    def get_qc_zone_data(zone_id):
        """Get data for QC zones using new architecture"""
        zone = KDSZoneService.get_zone(zone_id)
        if zone and zone.zone_type == 'qc':
            return zone.get_orders()
        return []

    @staticmethod
    def manual_send_to_kitchen(order):
        """Manually send order to kitchen using new architecture"""
        try:
            zone_assignments = KDSOrderService.get_zone_assignments_for_order(order)
            if zone_assignments:
                kds_order = KDSOrderService.create_from_order(order, zone_assignments)
                if kds_order:
                    return {
                        'success': True,
                        'message': f'Order {order.order_number} sent to kitchen',
                        'kds_order': kds_order
                    }
            return {
                'success': False,
                'message': 'No zone assignments found for order items'
            }
        except Exception as e:
            logger.error(f"Error manually sending order to kitchen: {e}")
            return {
                'success': False,
                'message': f'Error sending to kitchen: {str(e)}'
            }

    # Additional legacy methods for backward compatibility
    @staticmethod
    def get_active_sessions():
        """Get all active KDS sessions"""
        return KDSSession.objects.filter(is_active=True)

    @staticmethod
    def cleanup_old_sessions(hours=24):
        """Clean up old inactive sessions"""
        from django.utils import timezone
        cutoff_time = timezone.now() - timezone.timedelta(hours=hours)
        return KDSSession.objects.filter(last_activity__lt=cutoff_time).delete()