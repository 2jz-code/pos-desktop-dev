"""
Signal handlers for the settings app.
Automatically updates the configuration cache when GlobalSettings are modified.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import GlobalSettings
from django.utils import timezone
from django.db import transaction


@receiver(post_save, sender=GlobalSettings)
def reload_app_settings(sender, instance, **kwargs):
    """
    Automatically reload the AppSettings cache when GlobalSettings are updated.
    This ensures that configuration changes are immediately available throughout
    the application without requiring a restart.

    Additionally, this triggers recalculation of all in-progress orders to ensure
    tax rate and surcharge changes are immediately applied.
    """
    # Import here to avoid circular imports and ensure the singleton is loaded
    from .config import app_settings

    app_settings.reload()
    print(f"Configuration cache updated: {app_settings}")

    # Recalculate all in-progress orders to apply new rates immediately
    try:
        from orders.services import OrderService
        from orders.models import Order

        recalculated_count = OrderService.recalculate_in_progress_orders()
        print(
            f"Applied configuration changes to {recalculated_count} in-progress orders"
        )

        # Use transaction.on_commit to ensure WebSocket notifications are sent
        # AFTER all database changes are fully committed to prevent race conditions
        transaction.on_commit(lambda: _notify_frontend_of_config_changes())

    except Exception as e:
        print(f"Warning: Failed to recalculate in-progress orders: {e}")


def _notify_frontend_of_config_changes():
    """
    Sends WebSocket notifications to all connected clients about configuration changes.
    This ensures the frontend immediately reflects the updated configuration and order totals.
    """
    import time

    # Small delay to ensure all database transactions are fully committed
    # and visible across all connections before fetching order data
    time.sleep(0.1)  # 100ms delay

    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from orders.models import Order

        channel_layer = get_channel_layer()
        if not channel_layer:
            print("Warning: No channel layer configured for WebSocket notifications")
            return

        # Send a general configuration update to a global group (if implemented)
        try:
            async_to_sync(channel_layer.group_send)(
                "configuration_updates",  # Global group for configuration changes
                {
                    "type": "configuration_update",
                    "message": {
                        "type": "global_config_change",
                        "data": {
                            "message": "System configuration has been updated.",
                            "requires_refresh": True,
                            "timestamp": (str(timezone.now())),
                        },
                    },
                },
            )
            print("Sent global configuration update notification")
        except Exception as e:
            print(
                f"Note: Global configuration notification failed (group may not exist): {e}"
            )

        # Get all in-progress orders that might have active WebSocket connections
        # Fetch fresh data from database to ensure we have the latest calculated totals
        in_progress_statuses = [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]
        in_progress_orders = Order.objects.filter(status__in=in_progress_statuses)

        notification_count = 0
        for order in in_progress_orders:
            group_name = f"order_{order.id}"
            try:
                # Send a configuration update message to the order's WebSocket group
                async_to_sync(channel_layer.group_send)(
                    group_name,
                    {
                        "type": "configuration_update",
                        "message": {
                            "type": "order_config_change",
                            "data": {
                                "message": "Tax rates or surcharges have been updated. Order totals have been recalculated.",
                                "order_id": str(order.id),
                                "requires_refresh": True,
                            },
                        },
                    },
                )
                notification_count += 1
            except Exception as e:
                print(
                    f"Warning: Failed to send WebSocket notification for order {order.id}: {e}"
                )

        print(f"Sent WebSocket notifications to {notification_count} order groups")

    except Exception as e:
        print(f"Warning: Failed to send WebSocket notifications: {e}")
