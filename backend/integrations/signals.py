"""
Signal handlers for the integrations app.
Handles automatic geocoding when StoreLocation addresses are created or updated.
"""

from django.db.models.signals import pre_save
from django.dispatch import receiver
from settings.models import StoreLocation
from .services import GeocodingService
import logging

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=StoreLocation)
def auto_geocode_store_location(sender, instance, **kwargs):
    """
    Automatically geocode StoreLocation addresses when they are created or updated.
    Only makes the API call if:
    1. It's a new location (no pk yet), OR
    2. Any address field has changed from the previous saved values
    """
    # Check if this is a new instance (not yet saved to database)
    if instance.pk is None:
        should_geocode = True
        logger.info(f"New StoreLocation being created: {instance.name}")
    else:
        # It's an existing instance - check if address fields changed
        try:
            old_instance = StoreLocation.objects.get(pk=instance.pk)

            # Compare address fields
            address_changed = (
                old_instance.address_line1 != instance.address_line1 or
                old_instance.address_line2 != instance.address_line2 or
                old_instance.city != instance.city or
                old_instance.state != instance.state or
                old_instance.postal_code != instance.postal_code
            )

            should_geocode = address_changed

            if address_changed:
                logger.info(f"Address changed for StoreLocation: {instance.name}")

        except StoreLocation.DoesNotExist:
            # Edge case: pk is set but object doesn't exist in DB
            should_geocode = True

    # Only geocode if needed
    if should_geocode:
        # Build address components
        address_components = {
            'address_line1': instance.address_line1,
            'address_line2': instance.address_line2,
            'city': instance.city,
            'state': instance.state,
            'postal_code': instance.postal_code,
        }

        # Call geocoding service
        result = GeocodingService.geocode_address(address_components)

        if 'error' not in result:
            # Successfully geocoded - update coordinates
            instance.latitude = result['latitude']
            instance.longitude = result['longitude']
            logger.info(
                f"Auto-geocoded {instance.name}: "
                f"lat={result['latitude']}, lng={result['longitude']}"
            )
        else:
            # Geocoding failed - log error but don't block the save
            logger.warning(
                f"Failed to auto-geocode {instance.name}: {result['error']}"
            )
    else:
        logger.debug(f"Skipping geocoding for {instance.name} - address unchanged")
