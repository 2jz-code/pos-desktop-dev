from django.dispatch import receiver
from payments.signals import payment_completed
from .services import EmailService
from django.conf import settings
import logging
from django.db.models.signals import post_save
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from datetime import datetime

# Import the custom signal from orders app
from orders.signals import web_order_ready_for_notification

from settings.models import GlobalSettings, WebOrderSettings

logger = logging.getLogger(__name__)
channel_layer = get_channel_layer()


@receiver(payment_completed)
def handle_payment_completed(sender, order, **kwargs):
    """
    Receiver function to send an order confirmation email when a payment is completed.
    """
    email_service = EmailService()
    customer_email = (
        order.customer.email
        if order.customer and order.customer.email
        else order.guest_email
    )

    if customer_email:
        try:
            email_service.send_email(
                recipient_list=[customer_email],
                subject=f"Order Confirmation - Order #{order.order_number}",
                template_name="emails/order_confirmation.html",
                context={
                    "order": order,
                    "customer_name": (
                        order.customer.first_name
                        if order.customer
                        else "Valued Customer"
                    ),
                },
            )
            print(
                f"Order confirmation email sent to {customer_email} for Order #{order.order_number}"
            )
        except Exception as e:
            print(f"Failed to send order confirmation email to {customer_email}: {e}")
    else:
        print(
            f"No email address found for Order #{order.order_number}. Skipping confirmation email."
        )


@receiver(web_order_ready_for_notification)
def handle_web_order_notification(sender, **kwargs):
    """
    Signal handler for web order notifications.
    Triggers when the orders app broadcasts web_order_ready_for_notification.
    This keeps the notifications app decoupled from order business logic.
    """
    order_data = kwargs.get("order_data")
    order_id = kwargs.get("order_id")
    order_number = kwargs.get("order_number")

    if not order_data:
        logger.error(
            "No order_data received in web_order_ready_for_notification signal"
        )
        return

    logger.info(f"Processing web order notification for order {order_number}")

    try:
        # Check if web order notifications are enabled
        web_order_settings = WebOrderSettings.load()
        if not web_order_settings.enable_notifications:
            logger.info("Web order notifications are disabled, skipping notification")
            return

        # Get terminals that should receive notifications
        selected_terminals = web_order_settings.web_receipt_terminals.all()

        if not selected_terminals.exists():
            logger.info("No terminals selected for web order notifications")
            return

        # Create notification payload
        notification_payload = {
            "type": "web_order_notification",
            "order": order_data,
            "timestamp": datetime.now().isoformat(),
            "settings": {
                "play_notification_sound": web_order_settings.play_notification_sound,
                "auto_print_receipt": web_order_settings.auto_print_receipt,
                "auto_print_kitchen": web_order_settings.auto_print_kitchen,
            },
        }

        # Send WebSocket notifications to selected terminals
        for terminal in selected_terminals:
            terminal_group = f"terminal_{terminal.device_id}"

            try:
                async_to_sync(channel_layer.group_send)(
                    terminal_group,
                    {"type": "web_order_notification", "data": notification_payload},
                )
                logger.info(f"Notification sent to terminal {terminal.device_id}")
            except Exception as e:
                logger.error(
                    f"Failed to send notification to terminal {terminal.device_id}: {e}"
                )

        logger.info(f"Web order notifications processed for order {order_number}")

    except Exception as e:
        logger.error(
            f"Error processing web order notification for order {order_number}: {e}"
        )
        # Don't raise the exception to avoid disrupting the order completion process


# Additional signal handlers can be added here for future features:
# - Inventory alerts
# - System messages
# - Kitchen status updates
