from typing import Dict, Any, List
import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


class KDSNotificationService:
    """Service for handling KDS WebSocket notifications"""

    def __init__(self):
        self.channel_layer = get_channel_layer()

    def notify_zone(self, zone_id: str, message_type: str, data: Dict[str, Any]):
        """Send notification to a specific zone"""
        if not self.channel_layer:
            logger.warning("No channel layer available for notifications")
            return

        try:
            # Sanitize zone name for WebSocket group (only ASCII alphanumerics, hyphens, underscores, periods)
            sanitized_zone_id = ''.join(c if c.isalnum() or c in '-_.' else '_' for c in zone_id)
            group_name = f'kds_zone_{sanitized_zone_id}'

            logger.debug(f"Sending {message_type} to zone {zone_id} (group: {group_name})")

            async_to_sync(self.channel_layer.group_send)(
                group_name,
                {
                    'type': 'kds_notification',
                    'message_type': message_type,
                    'data': data,
                    'zone_id': zone_id,
                }
            )

        except Exception as e:
            logger.error(f"Error sending notification to zone {zone_id}: {e}")

    def notify_all_zones(self, message_type: str, data: Dict[str, Any]):
        """Send notification to all configured zones"""
        try:
            from .zone_service import KDSZoneService

            zones = KDSZoneService.get_all_zones()
            logger.info(f"notify_all_zones: Sending {message_type} to {len(zones)} zones: {list(zones.keys())}")
            for zone_id in zones.keys():
                self.notify_zone(zone_id, message_type, data)

            logger.info(f"notify_all_zones: Completed sending {message_type} to {len(zones)} zones")

        except Exception as e:
            logger.error(f"Error sending notification to all zones: {e}")

    def notify_kitchen_zones(self, message_type: str, data: Dict[str, Any]):
        """Send notification to all kitchen zones"""
        try:
            from .zone_service import KDSZoneService

            kitchen_zones = KDSZoneService.get_kitchen_zones()
            for zone_id in kitchen_zones.keys():
                self.notify_zone(zone_id, message_type, data)

            logger.debug(f"Sent {message_type} to {len(kitchen_zones)} kitchen zones")

        except Exception as e:
            logger.error(f"Error sending notification to kitchen zones: {e}")

    def notify_qc_zones(self, message_type: str, data: Dict[str, Any]):
        """Send notification to all QC zones"""
        try:
            from .zone_service import KDSZoneService

            qc_zones = KDSZoneService.get_qc_zones()
            for zone_id in qc_zones.keys():
                self.notify_zone(zone_id, message_type, data)

            logger.debug(f"Sent {message_type} to {len(qc_zones)} QC zones")

        except Exception as e:
            logger.error(f"Error sending notification to QC zones: {e}")

    def refresh_zone_data(self, zone_id: str):
        """Trigger a data refresh for a specific zone"""
        self.notify_zone(zone_id, 'refresh_data', {
            'zone_id': zone_id,
            'timestamp': self._get_timestamp(),
        })

    def refresh_all_zones(self):
        """Trigger a data refresh for all zones"""
        logger.info("refresh_all_zones: Starting global zone refresh")
        self.notify_all_zones('refresh_data', {
            'timestamp': self._get_timestamp(),
        })

    def order_created_notification(self, kds_order):
        """Send order created notification to relevant zones"""
        data = {
            'order_id': str(kds_order.id),
            'order_number': kds_order.order.order_number,
            'customer_name': kds_order.order.customer_display_name or 'Guest',
            'timestamp': self._get_timestamp(),
        }

        # Notify all zones about new order
        self.notify_all_zones('order_created', data)

    def order_status_changed_notification(self, kds_order, old_status, new_status):
        """Send order status change notification"""
        data = {
            'order_id': str(kds_order.id),
            'order_number': kds_order.order.order_number,
            'old_status': old_status,
            'new_status': new_status,
            'timestamp': self._get_timestamp(),
        }

        # Notify all zones about status change
        self.notify_all_zones('order_status_changed', data)

    def order_completed_notification(self, kds_order):
        """Send order completion notification"""
        data = {
            'order_id': str(kds_order.id),
            'order_number': kds_order.order.order_number,
            'completed_at': kds_order.completed_at.isoformat() if kds_order.completed_at else None,
            'timestamp': self._get_timestamp(),
        }

        # Notify kitchen zones that order was completed by QC
        self.notify_kitchen_zones('order_completed', data)

    def item_status_changed_notification(self, kds_item, old_status, new_status):
        """Send item status change notification"""
        data = {
            'item_id': str(kds_item.id),
            'order_id': str(kds_item.kds_order.id),
            'order_number': kds_item.kds_order.order.order_number,
            'zone_id': kds_item.assigned_zone,
            'old_status': old_status,
            'new_status': new_status,
            'timestamp': self._get_timestamp(),
        }

        # Notify all zones about item changes
        self.notify_all_zones('item_status_changed', data)

    def item_priority_changed_notification(self, kds_item, is_priority):
        """Send item priority change notification"""
        data = {
            'item_id': str(kds_item.id),
            'order_id': str(kds_item.kds_order.id),
            'order_number': kds_item.kds_order.order.order_number,
            'zone_id': kds_item.assigned_zone,
            'is_priority': is_priority,
            'timestamp': self._get_timestamp(),
        }

        # Notify all zones about priority changes
        self.notify_all_zones('item_priority_changed', data)

    def item_note_changed_notification(self, kds_item, note):
        """Send item note change notification"""
        data = {
            'item_id': str(kds_item.id),
            'order_id': str(kds_item.kds_order.id),
            'order_number': kds_item.kds_order.order.order_number,
            'zone_id': kds_item.assigned_zone,
            'note': note,
            'timestamp': self._get_timestamp(),
        }

        # Notify all zones about note changes
        self.notify_all_zones('item_note_changed', data)

    def _get_timestamp(self):
        """Get current timestamp in ISO format"""
        from django.utils import timezone
        return timezone.now().isoformat()


# Global instance for easy access
notification_service = KDSNotificationService()