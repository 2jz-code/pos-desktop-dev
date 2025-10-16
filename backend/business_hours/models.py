from django.db import models
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
import pytz
from tenant.managers import TenantManager


class BusinessHoursProfile(models.Model):
    """
    Main profile for business hours configuration.
    Phase 5: Now linked to StoreLocation for multi-location support.
    """

    TIMEZONE_CHOICES = [
        ('America/New_York', 'Eastern Time'),
        ('America/Chicago', 'Central Time'),
        ('America/Denver', 'Mountain Time'),
        ('America/Los_Angeles', 'Pacific Time'),
        ('America/Phoenix', 'Arizona Time'),
        ('Pacific/Honolulu', 'Hawaii Time'),
        ('America/Anchorage', 'Alaska Time'),
    ]

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='business_hours_profiles',
        null=True,
        blank=True
    )
    store_location = models.OneToOneField(
        'settings.StoreLocation',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='business_hours',
        help_text='Store location this business hours profile belongs to. Leave blank for legacy global profiles.'
    )
    name = models.CharField(
        max_length=100,
        default='Main Store',
        help_text='Name to identify this business hours profile'
    )
    timezone = models.CharField(
        max_length=50,
        choices=TIMEZONE_CHOICES,
        default='America/New_York',
        help_text='Timezone for the business location'
    )
    is_active = models.BooleanField(
        default=True,
        help_text='Whether this profile is currently active'
    )
    is_default = models.BooleanField(
        default=False,
        help_text='Default profile used when no specific profile is specified (legacy - for profiles not linked to locations)'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = 'Business Hours Profile'
        verbose_name_plural = 'Business Hours Profiles'
        ordering = ['-is_default', 'name']

    def __str__(self):
        if self.store_location:
            return f"{self.store_location.name} - Business Hours"
        return f"{self.name} {'(Default)' if self.is_default else ''}"

    def save(self, *args, **kwargs):
        # Ensure only one default profile exists per tenant (for legacy profiles without location)
        if self.is_default and not self.store_location:
            # Use all_objects to bypass tenant filtering (we're explicitly filtering by tenant)
            BusinessHoursProfile.all_objects.filter(
                tenant=self.tenant,
                store_location__isnull=True
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class RegularHours(models.Model):
    """Regular weekly schedule for a specific day"""

    DAYS_OF_WEEK = [
        (0, 'Monday'),
        (1, 'Tuesday'),
        (2, 'Wednesday'),
        (3, 'Thursday'),
        (4, 'Friday'),
        (5, 'Saturday'),
        (6, 'Sunday'),
    ]

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='regular_hours',
        null=True,
        blank=True
    )
    profile = models.ForeignKey(
        BusinessHoursProfile,
        on_delete=models.CASCADE,
        related_name='regular_hours'
    )
    day_of_week = models.IntegerField(
        choices=DAYS_OF_WEEK,
        help_text='Day of the week (0=Monday, 6=Sunday)'
    )
    is_closed = models.BooleanField(
        default=False,
        help_text='Is the business closed this day?'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = 'Regular Hours'
        verbose_name_plural = 'Regular Hours'
        unique_together = ['profile', 'day_of_week']
        ordering = ['day_of_week']
    
    def __str__(self):
        day_name = dict(self.DAYS_OF_WEEK)[self.day_of_week]
        if self.is_closed:
            return f"{day_name}: Closed"
        return f"{day_name}"
    
    def clean(self):
        # Validate time slots don't overlap
        if not self.is_closed:
            time_slots = list(self.time_slots.all())
            for i, slot1 in enumerate(time_slots):
                for slot2 in time_slots[i+1:]:
                    if self._slots_overlap(slot1, slot2):
                        raise ValidationError(
                            f"Time slots overlap: {slot1} and {slot2}"
                        )
    
    @staticmethod
    def _slots_overlap(slot1, slot2):
        """Check if two time slots overlap"""
        # Handle overnight slots
        if slot1.opening_time > slot1.closing_time:
            # slot1 goes overnight
            if slot2.opening_time > slot2.closing_time:
                # Both go overnight, they definitely overlap
                return True
            # Check if slot2 overlaps with either part of slot1
            return (slot2.closing_time > slot1.opening_time or 
                    slot2.opening_time < slot1.closing_time)
        elif slot2.opening_time > slot2.closing_time:
            # slot2 goes overnight, slot1 doesn't
            return (slot1.closing_time > slot2.opening_time or 
                    slot1.opening_time < slot2.closing_time)
        else:
            # Neither goes overnight, standard overlap check
            return (slot1.opening_time < slot2.closing_time and 
                    slot2.opening_time < slot1.closing_time)


class TimeSlot(models.Model):
    """Individual time slot within a day"""

    SLOT_TYPES = [
        ('regular', 'Regular Hours'),
        ('lunch', 'Lunch Hours'),
        ('happy_hour', 'Happy Hour'),
        ('special', 'Special Hours'),
    ]

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='time_slots',
        null=True,
        blank=True
    )
    regular_hours = models.ForeignKey(
        RegularHours,
        on_delete=models.CASCADE,
        related_name='time_slots'
    )
    opening_time = models.TimeField(
        help_text='Opening time for this slot'
    )
    closing_time = models.TimeField(
        help_text='Closing time for this slot'
    )
    slot_type = models.CharField(
        max_length=20,
        choices=SLOT_TYPES,
        default='regular',
        help_text='Type of time slot'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = 'Time Slot'
        verbose_name_plural = 'Time Slots'
        ordering = ['opening_time']
    
    def __str__(self):
        return f"{self.opening_time.strftime('%I:%M %p')} - {self.closing_time.strftime('%I:%M %p')} ({self.get_slot_type_display()})"
    
    def clean(self):
        # Note: Overlap validation is handled at the RegularHours level
        pass


class SpecialHours(models.Model):
    """Override hours for specific dates"""

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='special_hours',
        null=True,
        blank=True
    )
    profile = models.ForeignKey(
        BusinessHoursProfile,
        on_delete=models.CASCADE,
        related_name='special_hours'
    )
    date = models.DateField(
        help_text='Date for special hours'
    )
    is_closed = models.BooleanField(
        default=False,
        help_text='Is the business closed on this date?'
    )
    reason = models.CharField(
        max_length=200,
        blank=True,
        help_text='Reason for special hours (e.g., "Christmas", "Staff Training")'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = 'Special Hours'
        verbose_name_plural = 'Special Hours'
        unique_together = ['profile', 'date']
        ordering = ['date']
    
    def __str__(self):
        if self.is_closed:
            return f"{self.date}: Closed ({self.reason})" if self.reason else f"{self.date}: Closed"
        return f"{self.date}: Special Hours ({self.reason})" if self.reason else f"{self.date}: Special Hours"
    
    def clean(self):
        # Validate time slots don't overlap
        if not self.is_closed:
            time_slots = list(self.special_time_slots.all())
            for i, slot1 in enumerate(time_slots):
                for slot2 in time_slots[i+1:]:
                    if self._slots_overlap(slot1, slot2):
                        raise ValidationError(
                            f"Time slots overlap: {slot1} and {slot2}"
                        )
    
    @staticmethod
    def _slots_overlap(slot1, slot2):
        """Check if two time slots overlap (same logic as RegularHours)"""
        if slot1.opening_time > slot1.closing_time:
            if slot2.opening_time > slot2.closing_time:
                return True
            return (slot2.closing_time > slot1.opening_time or 
                    slot2.opening_time < slot1.closing_time)
        elif slot2.opening_time > slot2.closing_time:
            return (slot1.closing_time > slot2.opening_time or 
                    slot1.opening_time < slot2.closing_time)
        else:
            return (slot1.opening_time < slot2.closing_time and 
                    slot2.opening_time < slot1.closing_time)


class SpecialHoursTimeSlot(models.Model):
    """Time slots for special hours"""

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='special_hours_time_slots',
        null=True,
        blank=True
    )
    special_hours = models.ForeignKey(
        SpecialHours,
        on_delete=models.CASCADE,
        related_name='special_time_slots'
    )
    opening_time = models.TimeField(
        help_text='Opening time for this slot'
    )
    closing_time = models.TimeField(
        help_text='Closing time for this slot'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = 'Special Hours Time Slot'
        verbose_name_plural = 'Special Hours Time Slots'
        ordering = ['opening_time']
    
    def __str__(self):
        return f"{self.opening_time.strftime('%I:%M %p')} - {self.closing_time.strftime('%I:%M %p')}"


class Holiday(models.Model):
    """Recurring holidays"""

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='holidays',
        null=True,
        blank=True
    )
    profile = models.ForeignKey(
        BusinessHoursProfile,
        on_delete=models.CASCADE,
        related_name='holidays'
    )
    name = models.CharField(
        max_length=100,
        help_text='Name of the holiday'
    )
    month = models.IntegerField(
        choices=[(i, i) for i in range(1, 13)],
        help_text='Month (1-12)'
    )
    day = models.IntegerField(
        choices=[(i, i) for i in range(1, 32)],
        help_text='Day of month (1-31)'
    )
    is_closed = models.BooleanField(
        default=True,
        help_text='Is the business closed on this holiday?'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = 'Holiday'
        verbose_name_plural = 'Holidays'
        unique_together = ['profile', 'month', 'day']
        ordering = ['month', 'day']
    
    def __str__(self):
        return f"{self.name} ({self.month}/{self.day})"
    
    def clean(self):
        # Validate day is valid for the month
        import calendar
        # Use a leap year to allow Feb 29
        max_day = calendar.monthrange(2020, self.month)[1]
        if self.day > max_day:
            raise ValidationError(
                f"Day {self.day} is invalid for month {self.month}"
            )
