from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.core.cache import cache
from .models import (
    BusinessHoursProfile,
    RegularHours,
    TimeSlot,
    SpecialHours,
    SpecialHoursTimeSlot,
    Holiday
)
from .services import BusinessHoursService
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=BusinessHoursProfile)
@receiver(post_delete, sender=BusinessHoursProfile)
def clear_profile_cache(sender, instance, **kwargs):
    """Clear cache when profile is updated or deleted"""
    cache.delete(f"business_hours_profile_{instance.id}")
    if instance.is_default:
        cache.delete("business_hours_profile_default")


@receiver(post_save, sender=RegularHours)
@receiver(post_delete, sender=RegularHours)
def clear_regular_hours_cache(sender, instance, **kwargs):
    """Clear cache when regular hours are updated or deleted"""
    BusinessHoursService.clear_cache(instance.profile.id)


@receiver(post_save, sender=TimeSlot)
@receiver(post_delete, sender=TimeSlot)
def clear_time_slot_cache(sender, instance, **kwargs):
    """Clear cache when time slots are updated or deleted"""
    BusinessHoursService.clear_cache(instance.regular_hours.profile.id)


@receiver(post_save, sender=SpecialHours)
@receiver(post_delete, sender=SpecialHours)
def clear_special_hours_cache(sender, instance, **kwargs):
    """Clear cache when special hours are updated or deleted"""
    BusinessHoursService.clear_cache(instance.profile.id)
    # Also clear the specific date cache
    cache.delete(f"business_hours_{instance.profile.id}_{instance.date}")


@receiver(post_save, sender=SpecialHoursTimeSlot)
@receiver(post_delete, sender=SpecialHoursTimeSlot)
def clear_special_time_slot_cache(sender, instance, **kwargs):
    """Clear cache when special time slots are updated or deleted"""
    BusinessHoursService.clear_cache(instance.special_hours.profile.id)
    cache.delete(f"business_hours_{instance.special_hours.profile.id}_{instance.special_hours.date}")


@receiver(post_save, sender=Holiday)
@receiver(post_delete, sender=Holiday)
def clear_holiday_cache(sender, instance, **kwargs):
    """Clear cache when holidays are updated or deleted"""
    BusinessHoursService.clear_cache(instance.profile.id)


# === TIMEZONE SYNC SIGNALS ===
# Keep BusinessHoursProfile.timezone and StoreLocation.timezone in sync


@receiver(post_save, sender='settings.StoreLocation')
def sync_timezone_to_business_hours(sender, instance, **kwargs):
    """
    When StoreLocation timezone changes, update the linked BusinessHoursProfile.

    This ensures business hours operations use the correct timezone.
    """
    # Skip if no business hours profile linked yet
    if not hasattr(instance, 'business_hours') or not instance.business_hours:
        return

    profile = instance.business_hours

    # Only update if timezone actually changed (avoid infinite loops)
    if profile.timezone != instance.timezone:
        logger.info(
            f"Syncing timezone from StoreLocation '{instance.name}' "
            f"({instance.timezone}) to BusinessHoursProfile"
        )

        # Use update to bypass signals and avoid infinite loop
        BusinessHoursProfile.objects.filter(pk=profile.pk).update(
            timezone=instance.timezone
        )

        # Clear cache since timezone affects all time calculations
        BusinessHoursService.clear_cache(profile.id)


@receiver(post_save, sender=BusinessHoursProfile)
def sync_timezone_to_store_location(sender, instance, **kwargs):
    """
    When BusinessHoursProfile timezone changes, update the linked StoreLocation.

    This handles cases where timezone is edited directly in business hours management.
    """
    # Skip if no store location linked
    if not instance.store_location:
        return

    location = instance.store_location

    # Only update if timezone actually changed (avoid infinite loops)
    if location.timezone != instance.timezone:
        logger.info(
            f"Syncing timezone from BusinessHoursProfile to "
            f"StoreLocation '{location.name}' ({instance.timezone})"
        )

        # Import here to avoid circular imports
        from settings.models import StoreLocation

        # Use update to bypass signals and avoid infinite loop
        StoreLocation.objects.filter(pk=location.pk).update(
            timezone=instance.timezone
        )