from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
import uuid
import os


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
