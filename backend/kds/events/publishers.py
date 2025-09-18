from typing import Any
import logging
from ..services.notification_service import notification_service

logger = logging.getLogger(__name__)


class KDSEventPublisher:
    """Centralized event publishing for KDS events"""

    @staticmethod
    def order_created(kds_order):
        """Publish order created event"""
        try:
            logger.info(f"Publishing order_created event for {kds_order.order.order_number}")

            # Ensure the database transaction is committed before broadcasting
            from django.db import transaction
            if transaction.get_connection().in_atomic_block:
                logger.info("Still in atomic block, deferring notification")
                transaction.on_commit(lambda: KDSEventPublisher._send_order_created_notification(kds_order))
            else:
                logger.info("Not in atomic block, sending notification immediately")
                KDSEventPublisher._send_order_created_notification(kds_order)

        except Exception as e:
            logger.error(f"Error publishing order_created event: {e}")

    @staticmethod
    def _send_order_created_notification(kds_order):
        """Actually send the notification after transaction commit"""
        try:
            logger.info(f"Sending order_created notification for {kds_order.order.order_number}")
            notification_service.order_created_notification(kds_order)
            notification_service.refresh_all_zones()
        except Exception as e:
            logger.error(f"Error sending order_created notification: {e}")

    @staticmethod
    def order_status_changed(kds_order, old_status: str, new_status: str):
        """Publish order status change event"""
        try:
            logger.info(f"Publishing order_status_changed event for {kds_order.order.order_number}: {old_status} -> {new_status}")
            notification_service.order_status_changed_notification(kds_order, old_status, new_status)

            # Special handling for completion
            if new_status == 'completed':
                notification_service.order_completed_notification(kds_order)

            # Refresh all zones to update their data
            notification_service.refresh_all_zones()

        except Exception as e:
            logger.error(f"Error publishing order_status_changed event: {e}")

    @staticmethod
    def item_status_changed(kds_item, old_status: str, new_status: str):
        """Publish item status change event"""
        try:
            logger.info(f"Publishing item_status_changed event for item {kds_item.id}: {old_status} -> {new_status}")
            notification_service.item_status_changed_notification(kds_item, old_status, new_status)

            # Refresh all zones to update their data
            notification_service.refresh_all_zones()

        except Exception as e:
            logger.error(f"Error publishing item_status_changed event: {e}")

    @staticmethod
    def item_priority_changed(kds_item, is_priority: bool):
        """Publish item priority change event"""
        try:
            logger.info(f"Publishing item_priority_changed event for item {kds_item.id}: {is_priority}")
            notification_service.item_priority_changed_notification(kds_item, is_priority)

            # Refresh all zones to update their data
            notification_service.refresh_all_zones()

        except Exception as e:
            logger.error(f"Error publishing item_priority_changed event: {e}")

    @staticmethod
    def item_note_changed(kds_item, note: str):
        """Publish item note change event"""
        try:
            logger.info(f"Publishing item_note_changed event for item {kds_item.id}")
            notification_service.item_note_changed_notification(kds_item, note)

            # Refresh all zones to update their data
            notification_service.refresh_all_zones()

        except Exception as e:
            logger.error(f"Error publishing item_note_changed event: {e}")

    @staticmethod
    def zone_data_refresh_requested(zone_id: str):
        """Publish zone data refresh request"""
        try:
            logger.debug(f"Publishing zone_data_refresh_requested event for zone {zone_id}")
            notification_service.refresh_zone_data(zone_id)
        except Exception as e:
            logger.error(f"Error publishing zone_data_refresh_requested event: {e}")

    @staticmethod
    def global_data_refresh_requested():
        """Publish global data refresh request"""
        try:
            logger.debug("Publishing global_data_refresh_requested event")
            notification_service.refresh_all_zones()
        except Exception as e:
            logger.error(f"Error publishing global_data_refresh_requested event: {e}")