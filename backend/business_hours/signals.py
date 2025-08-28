from django.db.models.signals import post_save, post_delete
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