import logging

logger = logging.getLogger(__name__)


class WebOrderNotificationService:
    """
    Singleton service for handling web order notifications, including sound alerts and auto-printing.
    This service is designed to be called from a signal when a web order is completed.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def handle_web_order_completion(self, order):
        """
        Main handler for web order completion. This is the primary entry point.
        It checks global settings and then orchestrates notifications and printing.
        """
        from settings.config import app_settings

        config = app_settings.get_web_order_config()
        if not config.get("notifications_enabled"):
            return

        # Determine the target store location for the notification.
        target_location = self._determine_target_location(order)
        if not target_location:
            logger.warning(f"Could not determine target location for web order {order.id}. No notification sent.")
            return

        # Broadcast a real-time notification to all terminals at the target location.
        self._broadcast_notification(order, target_location)

        # Trigger auto-printing jobs if enabled in settings.
        self._trigger_auto_printing(order, target_location, config)

    def _determine_target_location(self, order):
        """Determine which StoreLocation should handle this web order."""
        from settings.config import app_settings

        # For now, all web orders are routed to the default store location.
        # Future logic could inspect the order (e.g., for a specific pickup location)
        # to route it to a different StoreLocation.
        return app_settings.get_default_store_location()

    def _broadcast_notification(self, order, target_location):
        """Broadcast web order notification to terminals at the target location."""
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("Channel layer not available. Cannot send web order notification.")
            return

        # The group name is based on the primary key of the StoreLocation.
        group_name = f"location_{target_location.id}_notifications"

        # Prepare a serializable payload with essential order details.
        # Ensure all values are simple types (str, int, bool).
        payload = {
            "type": "web_order_notification",
            "order_data": {
                "id": str(order.id),
                "order_number": order.order_number,
                "customer_name": (
                    order.customer.get_full_name()
                    if order.customer
                    else f"{order.guest_first_name} {order.guest_last_name}".strip()
                ),
                "total": str(order.grand_total),
                "item_count": order.items.count(),
                "created_at": order.created_at.isoformat(),
            },
        }

        logger.debug(f"Broadcasting to group: {group_name}")
        async_to_sync(channel_layer.group_send)(group_name, payload)

    def _trigger_auto_printing(self, order, target_location, config):
        """
        Sends auto-print jobs to terminals at the target location.
        The actual printing is handled by the frontend, which listens for these events.
        """
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        if not config.get("auto_print_receipt") and not config.get(
            "auto_print_kitchen"
        ):
            return

        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("Channel layer not available. Cannot send auto-print jobs.")
            return

        group_name = f"location_{target_location.id}_printing"
        logger.debug(f"Sending print jobs to group: {group_name}")

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "auto_print_job",
                "order_id": str(order.id),
                "print_receipt": config.get("auto_print_receipt", False),
                "print_kitchen": config.get("auto_print_kitchen", False),
            },
        )


# Create a single, globally accessible instance of the service.
web_order_notification_service = WebOrderNotificationService()
