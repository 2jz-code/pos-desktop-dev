from .models import Product, Category, Tax
from django.db import transaction


class ProductService:
    @staticmethod
    @transaction.atomic
    def create_product(**kwargs):
        """
        Creates a new product.

        Args:
            **kwargs: The data for the product.
        """
        category_id = kwargs.pop("category_id", None)
        tax_ids = kwargs.pop("tax_ids", [])
        # Keep the image_file in kwargs so the model gets it and the signal can process it
        # image_file = kwargs.pop("image", None)  # Don't remove the image from kwargs

        # Extract inventory-related data
        initial_stock = kwargs.pop("initial_stock", 0)
        location_id = kwargs.pop("location_id", None)

        if category_id:
            kwargs["category"] = Category.objects.get(id=category_id)

        product = Product.objects.create(**kwargs)

        # Remove manual image processing - let the signal handle it
        # if image_file:
        #     processed_image = ImageService.process_image(image_file)
        #     product.image.save(processed_image.name, processed_image, save=True)
        #     product.save()  # Save product again to update image field

        if tax_ids:
            product.taxes.set(Tax.objects.filter(id__in=tax_ids))

        # Create initial stock record if tracking inventory
        if kwargs.get("track_inventory", False):
            from inventory.models import InventoryStock, Location
            from settings.models import GlobalSettings

            # Use provided location or default location
            if location_id:
                location = Location.objects.get(id=location_id)
            else:
                # Get default location from settings
                settings = GlobalSettings.objects.first()
                if settings and settings.default_inventory_location:
                    location = settings.default_inventory_location
                else:
                    # Create a default location if none exists
                    location, created = Location.objects.get_or_create(
                        name="Main Storage",
                        defaults={"description": "Default inventory location"},
                    )
                    if created and settings:
                        settings.default_inventory_location = location
                        settings.save()

            # Create the stock record
            InventoryStock.objects.create(
                product=product, location=location, quantity=float(initial_stock)
            )

        return product
