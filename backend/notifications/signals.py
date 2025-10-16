from django.dispatch import receiver
from payments.signals import payment_completed
from .services import EmailService
from django.conf import settings
import logging
from django.db.models.signals import post_save
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from datetime import datetime
from decimal import Decimal
from uuid import UUID

# Import the custom signal from orders app
from orders.signals import web_order_ready_for_notification

from settings.models import GlobalSettings, WebOrderSettings

logger = logging.getLogger(__name__)
channel_layer = get_channel_layer()


def convert_payload_to_str(data):
    """
    Recursively converts UUID and Decimal objects in a data structure to strings.
    This prepares the payload for default JSON serialization by the channels library.
    """
    if isinstance(data, dict):
        return {k: convert_payload_to_str(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_payload_to_str(elem) for elem in data]
    elif isinstance(data, UUID):
        return str(data)
    elif isinstance(data, Decimal):
        return str(data)
    return data


@receiver(payment_completed)
def handle_payment_completed(sender, order, **kwargs):
    """
    Receiver function to send an order confirmation email when a payment is completed.
    Uses the new Maizzle templates for beautiful, responsive emails.
    """
    # Skip email notifications for test orders
    if order.order_number and order.order_number.startswith('TEST-'):
        logger.info(f"Skipping email notification for test order {order.order_number}")
        return
        
    # Check if confirmation email has already been sent
    if order.confirmation_sent:
        logger.info(
            f"Order confirmation email already sent for Order #{order.order_number}, skipping"
        )
        return

    email_service = EmailService()

    try:
        # Use the new method that automatically handles guest vs registered users
        # and uses the appropriate Maizzle template
        success = email_service.send_order_confirmation_email(order)

        if success:
            # Mark confirmation as sent to prevent duplicates
            order.confirmation_sent = True
            order.save(update_fields=["confirmation_sent"])
            logger.info(
                f"Order confirmation email sent for Order #{order.order_number}"
            )
        else:
            logger.warning(
                f"Failed to send order confirmation email for Order #{order.order_number}"
            )

    except Exception as e:
        logger.error(
            f"Unexpected error sending order confirmation email for Order #{order.order_number}: {e}"
        )


@receiver(web_order_ready_for_notification)
def handle_web_order_notification(sender, **kwargs):
    """
    Signal handler for web order notifications.
    Triggers when the orders app broadcasts web_order_ready_for_notification.
    This keeps the notifications app decoupled from order business logic.

    Uses location-specific web order settings with fallback to tenant defaults.
    """
    order_data = kwargs.get("order_data")
    order_id = kwargs.get("order_id")
    order_number = kwargs.get("order_number")
    store_location = kwargs.get("store_location")

    if not order_data:
        logger.error(
            "No order_data received in web_order_ready_for_notification signal"
        )
        return

    if not store_location:
        logger.error(
            f"No store_location received in web_order_ready_for_notification signal for order {order_number}"
        )
        return

    logger.info(f"Processing web order notification for order {order_number} at location {store_location.name}")

    try:
        # Get effective web order settings for this location
        # (location overrides take precedence over tenant defaults)
        effective_settings = store_location.get_effective_web_order_settings()

        # Check if web order notifications are enabled
        if not effective_settings['enable_notifications']:
            logger.info(f"Web order notifications are disabled for location {store_location.name}, skipping notification")
            return

        # Get terminals that should receive notifications for this location
        selected_terminals = effective_settings['terminals']

        if not selected_terminals.exists():
            logger.info(f"No terminals selected for web order notifications at location {store_location.name}")
            return

        # Create notification payload with location-specific settings
        notification_payload = {
            "type": "web_order_notification",
            "order": order_data,
            "timestamp": datetime.now().isoformat(),
            "settings": {
                "play_notification_sound": effective_settings['play_notification_sound'],
                "auto_print_receipt": effective_settings['auto_print_receipt'],
                "auto_print_kitchen": effective_settings['auto_print_kitchen'],
            },
        }

        # Ensure the entire payload is serializable before sending to channels
        serializable_payload = convert_payload_to_str(notification_payload)

        # Send WebSocket notifications to selected terminals at this location
        for terminal in selected_terminals:
            # Use tenant-scoped channel group
            terminal_group = f"tenant_{terminal.tenant.id}_terminal_{terminal.device_id}"

            try:
                async_to_sync(channel_layer.group_send)(
                    terminal_group,
                    {"type": "web_order_notification", "data": serializable_payload},
                )
                logger.info(f"Notification sent to terminal {terminal.device_id} at location {store_location.name} (tenant: {terminal.tenant.slug})")
            except Exception as e:
                logger.error(
                    f"Failed to send notification to terminal {terminal.device_id}: {e}"
                )

        logger.info(f"Web order notifications processed for order {order_number} at location {store_location.name}")

    except Exception as e:
        logger.error(
            f"Error processing web order notification for order {order_number}: {e}"
        )
        # Don't raise the exception to avoid disrupting the order completion process


@receiver(post_save, sender="orders.Order")
def handle_order_status_completion(sender, instance, created, **kwargs):
    """
    Signal handler for when an order status changes to COMPLETED.
    This provides a backup trigger for order confirmation emails,
    ensuring all completed orders get confirmations regardless of payment method.
    """
    # Only process orders that are just marked as completed (not new orders)
    if not created and instance.status == "COMPLETED":
        # Skip email notifications for test orders
        if instance.order_number and instance.order_number.startswith('TEST-'):
            logger.info(f"Skipping email notification for test order {instance.order_number}")
            return
            
        # Check if confirmation email has already been sent
        if instance.confirmation_sent:
            logger.info(
                f"Order confirmation email already sent for Order #{instance.order_number}, skipping"
            )
            return

        email_service = EmailService()

        try:
            success = email_service.send_order_confirmation_email(instance)

            if success:
                # Mark confirmation as sent to prevent duplicates
                instance.confirmation_sent = True
                instance.save(update_fields=["confirmation_sent"])
                logger.info(
                    f"Order completion confirmation email sent for Order #{instance.order_number}"
                )
            else:
                logger.warning(
                    f"Failed to send order completion confirmation email for Order #{instance.order_number}"
                )

        except Exception as e:
            logger.error(
                f"Error sending order completion confirmation email for Order #{instance.order_number}: {e}"
            )


# Additional signal handlers can be added here for future features:
# - Inventory alerts
# - System messages
# - Kitchen status updates
