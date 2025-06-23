from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import logging

from .models import Product, Category, ProductType

logger = logging.getLogger(__name__)


def broadcast_entity_change(entity_type, entity_id, action="changed"):
    """
    Broadcast entity changes via WebSocket to all connected clients
    This enables real-time sync across multiple terminals
    """
    try:
        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("No channel layer configured for WebSocket notifications")
            return

        # For MVP, we broadcast to all clients. In multi-tenant, this would be tenant-specific
        message = {
            "type": "sync_notification",
            "event_data": {
                "type": "entity_changed",
                "entity": entity_type,
                "id": entity_id,
                "action": action,
                "timestamp": str(timezone.now()) if "timezone" in globals() else None,
            },
        }

        # Broadcast to a general sync group (all terminals)
        # In multi-tenant architecture, this would be tenant-specific groups
        async_to_sync(channel_layer.group_send)(
            "sync_notifications", message  # General sync group for MVP
        )

        logger.info(f"📡 Broadcasted {action} for {entity_type}:{entity_id}")

    except Exception as e:
        logger.error(f"Failed to broadcast entity change: {e}")


# === PRODUCT SIGNALS ===


@receiver(post_save, sender=Product)
def handle_product_change(sender, instance, created, **kwargs):
    """Handle product create/update events"""
    action = "created" if created else "updated"
    broadcast_entity_change("products", instance.id, action)


@receiver(post_delete, sender=Product)
def handle_product_delete(sender, instance, **kwargs):
    """Handle product delete events"""
    broadcast_entity_change("products", instance.id, "deleted")


# === CATEGORY SIGNALS ===


@receiver(post_save, sender=Category)
def handle_category_change(sender, instance, created, **kwargs):
    """Handle category create/update events"""
    action = "created" if created else "updated"
    broadcast_entity_change("categories", instance.id, action)


@receiver(post_delete, sender=Category)
def handle_category_delete(sender, instance, **kwargs):
    """Handle category delete events"""
    broadcast_entity_change("categories", instance.id, "deleted")


# === PRODUCT TYPE SIGNALS ===


@receiver(post_save, sender=ProductType)
def handle_product_type_change(sender, instance, created, **kwargs):
    """Handle product type create/update events"""
    action = "created" if created else "updated"
    broadcast_entity_change("product_types", instance.id, action)


@receiver(post_delete, sender=ProductType)
def handle_product_type_delete(sender, instance, **kwargs):
    """Handle product type delete events"""
    broadcast_entity_change("product_types", instance.id, "deleted")
