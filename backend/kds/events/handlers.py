from django.db.models.signals import post_save
from django.dispatch import receiver
import logging

from payments.signals import payment_completed
from ..services.order_service import KDSOrderService

logger = logging.getLogger(__name__)


@receiver(payment_completed)
def handle_payment_completed(sender, order, **kwargs):
    """Create KDS order when payment is completed"""
    try:
        logger.info(f"Payment completed for order {order.order_number}, creating KDS order")

        # For web/app orders, always create KDS items on payment
        # For POS orders, only create if none exist (manual send backup)
        if order.order_type in ['WEB', 'APP']:
            logger.info(f"Processing {order.order_type} order {order.order_number}")

            zone_assignments = KDSOrderService.get_zone_assignments_for_order(order)
            if zone_assignments:
                kds_order = KDSOrderService.create_from_order(order, zone_assignments)
                if kds_order:
                    logger.info(f"Successfully created KDS order for {order.order_number}")
                else:
                    logger.error(f"Failed to create KDS order for {order.order_number}")
            else:
                logger.warning(f"No zone assignments found for order {order.order_number}")

        elif order.order_type == 'POS':
            logger.info(f"Processing POS order {order.order_number} - checking if backup needed")

            # Check if KDS order already exists
            if hasattr(order, 'kds_order') and order.kds_order:
                logger.info(f"KDS order already exists for POS order {order.order_number}")
            else:
                logger.info(f"Creating backup KDS order for POS order {order.order_number}")
                zone_assignments = KDSOrderService.get_zone_assignments_for_order(order)
                if zone_assignments:
                    kds_order = KDSOrderService.create_from_order(order, zone_assignments)
                    if kds_order:
                        logger.info(f"Successfully created backup KDS order for {order.order_number}")
                    else:
                        logger.error(f"Failed to create backup KDS order for {order.order_number}")

    except Exception as e:
        logger.error(f"Error handling payment completion for order {order.id}: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")


# Additional signal handlers can be added here as needed
# For example, handling order modifications, cancellations, etc.