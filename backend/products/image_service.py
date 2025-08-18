from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
import uuid
import os
import time
import logging
# Removed unused signal imports

logger = logging.getLogger(__name__)

class ImageService:
    @staticmethod
    def process_image(uploaded_image):
        """
        Compresses, converts to WebP, and returns an in-memory image file.
        """
        img = Image.open(uploaded_image)

        # Optional: Resize if the image is very large
        # img.thumbnail((1024, 1024)) # Max width/height of 1024px

        output_buffer = BytesIO()
        # Save as WebP with a quality setting (0-100)
        img.save(output_buffer, format="WEBP", quality=80)

        # Create a Django ContentFile
        original_filename = uploaded_image.name
        name_without_extension = os.path.splitext(original_filename)[0]

        # Use the original filename without extension, and append .webp
        # Note: This means if two images have the same original filename,
        # the later upload will overwrite the previous one.
        filename = f"{name_without_extension}.webp"

        return ContentFile(output_buffer.getvalue(), name=filename)

    @staticmethod
    def delete_image_file(image_field, original_filename=None):
        """
        Deletes the physical image file(s) associated with a Django ImageField.
        Works with both local storage and S3 storage.
        
        Args:
            image_field: The Django ImageField instance
            original_filename: Optional original filename to also delete
        """
        if not image_field:
            logger.warning("No image field provided for deletion")
            return
        files_to_delete = []
        
        # Add current image file
        if image_field and image_field.name:
            files_to_delete.append(image_field.name)
            logger.info(f"Added current image to deletion list: '{image_field.name}'")
        
        # Add original filename if provided and different from current
        if (original_filename and 
            original_filename != (image_field.name if image_field else None)):
            files_to_delete.append(original_filename)
            logger.info(f"Added original filename to deletion list: '{original_filename}'")
        
        logger.info(f"Total files to delete: {len(files_to_delete)}")
        
        # Delete all files
        for file_name in files_to_delete:
            logger.info(f"Attempting to delete file: '{file_name}'")
            
            # Detect storage type more reliably
            storage_type = "unknown"
            try:
                # Check if it's S3 storage by class name
                storage_class = image_field.storage.__class__.__name__
                logger.info(f"Storage class: {storage_class}")
                if 'S3' in storage_class or 'MediaStorage' in storage_class:
                    storage_type = "s3"
                elif hasattr(image_field.storage, 'location') and 'media' in str(image_field.storage.location):
                    storage_type = "local"
                else:
                    # Try to determine by attempting path access
                    try:
                        image_field.storage.path('test')
                        storage_type = "local"
                    except (NotImplementedError, AttributeError):
                        storage_type = "s3"
            except Exception as e:
                logger.warning(f"Could not detect storage type: {e}, assuming S3")
                storage_type = "s3"
            
            logger.info(f"Detected storage type: {storage_type} for file: {file_name}")
            
            try:
                if storage_type == "s3":
                    # S3 storage - use storage.delete()
                    if image_field.storage.exists(file_name):
                        image_field.storage.delete(file_name)
                        logger.info(f"Successfully deleted S3 file: {file_name}")
                    else:
                        logger.warning(f"S3 file does not exist: {file_name}")
                else:
                    # Local storage
                    file_path = os.path.join(image_field.storage.location, file_name)
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                        logger.info(f"Successfully deleted local file: {file_path}")
                    else:
                        logger.warning(f"Local file does not exist: {file_path}")
            except Exception as e:
                logger.error(f"Failed to delete file {file_name}: {e}")
                # Try direct storage.delete() as fallback
                try:
                    if hasattr(image_field.storage, 'delete'):
                        image_field.storage.delete(file_name)
                        logger.info(f"Deleted file using fallback method: {file_name}")
                except Exception as fallback_e:
                    logger.error(f"Fallback deletion also failed for {file_name}: {fallback_e}")

    @staticmethod
    def process_image_sync(image_path, original_filename=None):
        """
        Synchronous image processing for Celery tasks
        """
        try:
            img = Image.open(image_path)
            
            # Convert to RGB if necessary
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            
            # Resize if too large
            max_size = (1200, 1200)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Save as WebP
            output_buffer = BytesIO()
            img.save(output_buffer, format="WEBP", quality=80, optimize=True)
            output_buffer.seek(0)
            
            # Use provided original filename or fallback to temp file basename
            if original_filename:
                original_name = os.path.splitext(os.path.basename(original_filename))[0]
            else:
                original_name = os.path.splitext(os.path.basename(image_path))[0]
            
            filename = f"{original_name}.webp"
            return ContentFile(output_buffer.getvalue(), name=filename)
            
        except Exception as e:
            logger.error(f"Image processing failed: {e}")
            return None

    @staticmethod
    def process_image_async(product_id, uploaded_image):
        """
        Queue image processing as background task
        """
        from .tasks import process_product_image_async
        
        # Save uploaded image temporarily
        temp_path = f"/tmp/temp_image_{product_id}_{int(time.time())}"
        
        with open(temp_path, 'wb+') as destination:
            for chunk in uploaded_image.chunks():
                destination.write(chunk)
        
        # Queue background task with original filename
        original_filename = uploaded_image.name if uploaded_image else None
        process_product_image_async.delay(product_id, temp_path, original_filename)
        
        return True  # Return immediately
    
    @staticmethod
    def delete_product_images(product):
        """
        Delete all image files associated with a product.
        This includes both the current processed image and any original versions.
        """
        ImageService.delete_image_file(product.image, product.original_filename)