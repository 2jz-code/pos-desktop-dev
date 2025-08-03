from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
import uuid
import os
import time
import logging

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
    def delete_image_file(image_field):
        """
        Deletes the physical image file associated with a Django ImageField.
        """
        if image_field and image_field.name:
            if os.path.isfile(image_field.path):
                os.remove(image_field.path)
                print(f"Deleted old image file: {image_field.path}")

    @staticmethod
    def process_image_sync(image_path):
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
            
            filename = f"processed_image.webp"
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
        
        # Queue background task
        process_product_image_async.delay(product_id, temp_path)
        
        return True  # Return immediately