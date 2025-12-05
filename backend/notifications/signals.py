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

# Note: GlobalSettings and WebOrderSettings imports removed - not used in this file
# Web order settings are accessed via store_location.get_effective_web_order_settings()

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
    If no terminals are online (stale heartbeat), sends email fallback to owners/managers.
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
            # Send email fallback since no terminals are configured
            _send_email_fallback_for_order(order_id, order_number, store_location)
            return

        # Check which terminals are actually online (have recent heartbeat)
        # 'online' or 'syncing' means terminal is connected and can receive notifications
        online_terminals = [t for t in selected_terminals if t.display_status in ('online', 'syncing')]

        if not online_terminals:
            # Log status of each terminal for debugging
            terminal_statuses = [(t.device_id, t.display_status) for t in selected_terminals]
            logger.warning(
                f"No online terminals at location {store_location.name} for order {order_number}. "
                f"Terminal statuses: {terminal_statuses}. Sending email fallback."
            )
            _send_email_fallback_for_order(order_id, order_number, store_location)
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

        # Send WebSocket notifications to online terminals only
        for terminal in online_terminals:
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


def _send_email_fallback_for_order(order_id, order_number, store_location):
    """
    Send email alerts to owners and managers when no terminals are online.

    Args:
        order_id: UUID of the order
        order_number: Order number string
        store_location: StoreLocation instance
    """
    from orders.models import Order
    from users.models import User
    from .services import email_service

    try:
        # Get the order object
        order = Order.objects.select_related('tenant', 'store_location').prefetch_related(
            'items__product', 'items__selected_modifiers_snapshot'
        ).get(id=order_id)

        # Get all owners and managers for this tenant
        recipient_users = User.objects.filter(
            tenant=order.tenant,
            is_active=True,
            role__in=[User.Role.OWNER, User.Role.MANAGER],
        ).exclude(
            email__isnull=True
        ).exclude(
            email=""
        )

        recipient_emails = list(recipient_users.values_list("email", flat=True))

        if not recipient_emails:
            logger.warning(
                f"No owner/manager emails found for tenant {order.tenant.id}. "
                f"Cannot send email fallback for web order {order_number}."
            )
            return

        logger.info(
            f"Sending web order alert email to {len(recipient_emails)} recipients for order {order_number}"
        )

        email_service.send_web_order_alert(recipient_emails, order)

    except Order.DoesNotExist:
        logger.error(f"Order {order_id} not found for email fallback")
    except Exception as e:
        logger.error(f"Failed to send email fallback for order {order_number}: {e}")


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
