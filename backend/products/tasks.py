from celery import shared_task
from django.core.files.base import ContentFile
from PIL import Image
from io import BytesIO
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def process_product_image_async(self, product_id, image_path):
    """
    Process product image in background
    """
    try:
        from .models import Product
        from .image_service import ImageService
        
        product = Product.objects.get(id=product_id)
        
        # Process the image
        processed_image = ImageService.process_image_sync(image_path)
        
        # Save to product without triggering signals
        if processed_image:
            # Set a flag to prevent signal recursion
            product._skip_image_processing = True
            
            product.image.save(
                f"processed_{product.id}.webp",
                processed_image,
                save=False  # Don't auto-save yet
            )
            
            # Update original_filename to prevent reprocessing
            product.original_filename = product.image.name
            
            # Save with the flag set
            product.save(update_fields=['image', 'original_filename'])
            
            logger.info(f"Successfully processed image for product {product_id}")
        
        # Clean up temp file
        try:
            import os
            if os.path.exists(image_path):
                os.remove(image_path)
                logger.debug(f"Cleaned up temp file: {image_path}")
        except Exception as e:
            logger.warning(f"Could not clean up temp file {image_path}: {e}")
            
    except Product.DoesNotExist:
        logger.error(f"Product {product_id} not found")
    except Exception as exc:
        logger.error(f"Failed to process image for product {product_id}: {exc}")
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
