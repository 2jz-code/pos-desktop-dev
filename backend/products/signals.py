from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import logging
from django.utils import timezone  # Add this import
from django.conf import settings

from .models import Product, Category, ProductType
from .image_service import ImageService  # Import ImageService
import os  # Import os

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
def process_product_image(sender, instance, created, **kwargs):
    """
    After a product is saved, if it has a newly uploaded image,
    process it and replace it with the WebP version.
    """
    # Check if there's an image and if it hasn't been processed yet
    # Also check if the image has changed from its original filename to avoid reprocessing already processed images
    if instance.image and (
        created or instance.image.name != instance.original_filename
    ):

        # Store the path to the originally uploaded file if it exists
        original_image_path = None
        if not created and instance.image.path and os.path.exists(instance.image.path):
            original_image_path = instance.image.path

        try:
            # Process the image using our service
            processed_image_file = ImageService.process_image(instance.image)

            # Extract just the filename from the processed image name to avoid double prefixing
            # processed_image_file.name might be "products/7up2.webp" or just "7up2.webp"
            processed_filename = os.path.basename(processed_image_file.name)

            # Manually construct the correct file path to avoid Django's upload_to duplication
            # The upload_to is "products/" so we want "products/filename.webp"
            correct_relative_path = f"products/{processed_filename}"

            # Get the full file system path
            full_file_path = os.path.join(settings.MEDIA_ROOT, correct_relative_path)

            # Ensure the directory exists
            os.makedirs(os.path.dirname(full_file_path), exist_ok=True)

            # Write the processed file to the correct location
            with open(full_file_path, "wb") as destination:
                processed_image_file.seek(0)  # Reset file pointer
                destination.write(processed_image_file.read())

            # Close the processed file handle
            processed_image_file.close()

            # Close the original image file handle before attempting cleanup
            if hasattr(instance.image, "close"):
                instance.image.close()

            # Update the instance's image field to point to the new file
            instance.image.name = correct_relative_path
            instance.original_filename = correct_relative_path
            instance.save(update_fields=["image", "original_filename"])

            # Clean up the original uploaded file if it exists and is different from the new file
            if (
                original_image_path
                and os.path.exists(original_image_path)
                and original_image_path != full_file_path
            ):
                try:
                    # Add a small delay to ensure file handles are released (Windows issue)
                    import time

                    time.sleep(0.1)
                    os.remove(original_image_path)
                except PermissionError:
                    # Log the issue but don't crash the process
                    logger.warning(
                        f"Could not delete original image file {original_image_path} - file may be in use"
                    )
                except Exception as e:
                    logger.error(
                        f"Error cleaning up original image file {original_image_path}: {e}"
                    )

        except Exception as e:
            logger.error(f"Error processing image for product {instance.id}: {e}")
            # Don't raise the exception to prevent the product save from failing

    # Also broadcast the change for real-time updates
    action = "created" if created else "updated"
    broadcast_entity_change("products", instance.id, action)


@receiver(post_delete, sender=Product)
def handle_product_delete(sender, instance, **kwargs):
    """
    Handle product delete events: broadcast change and delete associated image file.
    """
    # Delete the image file when the product is deleted
    ImageService.delete_image_file(instance.image)
    broadcast_entity_change("products", instance.id, "deleted")


# Existing signal handlers (ensure these are still present)
@receiver(post_save, sender=Product)
def handle_product_change(sender, instance, created, **kwargs):
    """Handle product create/update events"""
    # This signal is now redundant for image processing, handled by process_product_image
    # but still useful for broadcasting other product changes if needed
    if not instance.image or instance.image.name == instance.original_filename:
        action = "created" if created else "updated"
        broadcast_entity_change("products", instance.id, action)


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
