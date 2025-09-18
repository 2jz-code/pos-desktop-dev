from django.db.models.signals import post_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json
import logging

from orders.models import Order
from payments.signals import payment_completed
from .models import KDSOrder, KDSOrderItem
from .services.order_service import KDSOrderService
from .events.publishers import KDSEventPublisher

logger = logging.getLogger(__name__)

# Channel layer for WebSocket broadcasting
channel_layer = get_channel_layer()


@receiver(payment_completed)
def create_kds_order_on_payment(sender, order, **kwargs):
    """
    Create KDS order when payment is completed
    - For web/app orders: creates KDS order after payment (required)
    - For POS orders: backup/fallback if manual send wasn't used
    """
    try:
        logger.info(f"Payment completed signal received for order {order.order_number}, type: {order.order_type}")

        # Check if KDS order already exists
        if hasattr(order, 'kds_order') and order.kds_order:
            logger.info(f"KDS order already exists for {order.order_number}")
            return

        # For web/app orders, always create KDS order on payment
        # For POS orders, only create if none exist (manual send backup)
        if order.order_type in ['WEB', 'APP']:
            logger.info(f"Web/App order - creating KDS order for {order.order_number}")
            zone_assignments = KDSOrderService.get_zone_assignments_for_order(order)

            if zone_assignments:
                kds_order = KDSOrderService.create_from_order(order, zone_assignments)
                if kds_order:
                    logger.info(f"Created KDS order {kds_order.id} for {order.order_number}")
                else:
                    logger.error(f"Failed to create KDS order for {order.order_number}")

        elif order.order_type == 'POS':
            logger.info(f"POS order - checking if backup needed for {order.order_number}")
            # POS backup: only create if no KDS order exists (manual send wasn't used)
            if not hasattr(order, 'kds_order') or not order.kds_order:
                logger.info(f"No existing KDS order - creating as backup for {order.order_number}")
                zone_assignments = KDSOrderService.get_zone_assignments_for_order(order)
                if zone_assignments:
                    kds_order = KDSOrderService.create_from_order(order, zone_assignments)
                    if kds_order:
                        logger.info(f"Created backup KDS order {kds_order.id} for {order.order_number}")
            else:
                logger.info(f"KDS order already exists for POS order {order.order_number}")

    except Exception as e:
        logger.error(f"Error in create_kds_order_on_payment for order {order.order_number}: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")


@receiver(post_save, sender=KDSOrder)
def broadcast_kds_order_update(sender, instance, created, **kwargs):
    """
    Broadcast KDS order updates to all zones
    """
    try:
        logger.info(f"KDS order {instance.id} {'created' if created else 'updated'}, status: {instance.status}")

        if channel_layer:
            if created:
                # Broadcast to all zones when a new order is created
                logger.info(f"Broadcasting new order {instance.order.order_number} to all zones")
                _broadcast_to_all_zones('order_created', {
                    'order_id': str(instance.id),
                    'order_number': instance.order.order_number,
                    'status': instance.status
                })
            else:
                # Order status updated - broadcast to all zones
                logger.info(f"Broadcasting order status update for {instance.order.order_number}: {instance.status}")
                _broadcast_to_all_zones('order_status_changed', {
                    'order_id': str(instance.id),
                    'order_number': instance.order.order_number,
                    'status': instance.status
                })

    except Exception as e:
        logger.error(f"Error broadcasting KDS order update: {e}")


@receiver(post_save, sender=KDSOrderItem)
def broadcast_kds_item_update(sender, instance, created, **kwargs):
    """
    Broadcast KDS item updates to relevant zones
    """
    try:
        logger.info(f"KDS item {instance.id} {'created' if created else 'updated'}, status: {instance.status}, zone: {instance.assigned_zone}")

        if channel_layer:
            if created:
                # New item created - broadcast to all zones
                logger.info(f"Broadcasting new item {instance.id} to all zones")
                _broadcast_to_all_zones('item_created', {
                    'item_id': str(instance.id),
                    'status': instance.status,
                    'order_id': str(instance.kds_order.id),
                    'order_number': instance.kds_order.order.order_number,
                    'zone': instance.assigned_zone
                })
            else:
                # Item status updated - broadcast to all zones for coordination
                logger.info(f"Broadcasting item status update for {instance.id}: {instance.status}")
                _broadcast_to_all_zones('item_status_changed', {
                    'item_id': str(instance.id),
                    'status': instance.status,
                    'order_id': str(instance.kds_order.id),
                    'order_number': instance.kds_order.order.order_number,
                    'zone': instance.assigned_zone
                })

    except Exception as e:
        logger.error(f"Error broadcasting KDS item update: {e}")


def _broadcast_to_zone(zone_id: str, message_type: str, data: dict):
    """Broadcast message to a specific zone"""
    try:
        sanitized_zone_id = ''.join(c if c.isalnum() or c in '-_.' else '_' for c in zone_id)
        group_name = f'kds_zone_{sanitized_zone_id}'

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'kds_notification',
                'message_type': message_type,
                'data': data
            }
        )
        logger.debug(f"Broadcasted {message_type} to zone {zone_id}")

    except Exception as e:
        logger.error(f"Error broadcasting to zone {zone_id}: {e}")


def _broadcast_to_qc_zones(message_type: str, data: dict):
    """Broadcast message to all QC zones"""
    try:
        from .services.zone_service import KDSZoneService
        qc_zones = KDSZoneService.get_qc_zones()

        for zone_id in qc_zones.keys():
            _broadcast_to_zone(zone_id, message_type, data)

    except Exception as e:
        logger.error(f"Error broadcasting to QC zones: {e}")


def _broadcast_to_all_zones(message_type: str, data: dict):
    """Broadcast message to all zones"""
    try:
        from .services.zone_service import KDSZoneService
        all_zones = KDSZoneService.get_all_zones()

        for zone_id in all_zones.keys():
            _broadcast_to_zone(zone_id, message_type, data)

    except Exception as e:
        logger.error(f"Error broadcasting to all zones: {e}")