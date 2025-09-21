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


# NOTE: Signal handlers have been moved to kds/events/handlers.py
# Broadcasting functionality has been moved to kds/services/notification_service.py
# This file contains legacy signal handling code that is no longer active
# The KDS app now uses the event-driven architecture in kds/events/