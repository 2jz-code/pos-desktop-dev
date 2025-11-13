from datetime import datetime, date, time, timedelta
from typing import List, Dict, Optional, Tuple, Union
import pytz
from django.utils import timezone
from django.core.cache import cache
from .models import (
    BusinessHoursProfile,
    RegularHours,
    TimeSlot,
    SpecialHours,
    SpecialHoursTimeSlot,
    Holiday
)


class BusinessHoursService:
    """Service class for handling all business hours logic"""
    
    CACHE_TIMEOUT = 300  # 5 minutes
    
    def __init__(self, profile_id: Optional[int] = None):
        """
        Initialize service with a specific profile or default profile
        
        Args:
            profile_id: ID of the business hours profile to use. If None, uses default.
        """
        self.profile_id = profile_id
        self._profile = None
    
    @property
    def profile(self) -> BusinessHoursProfile:
        """Get the business hours profile (cached)"""
        if self._profile is None:
            from tenant.managers import get_current_tenant
            tenant = get_current_tenant()

            # Include tenant in cache key to prevent cross-tenant cache pollution
            cache_key = f"business_hours_profile_{tenant.id if tenant else 'none'}_{self.profile_id or 'default'}"
            self._profile = cache.get(cache_key)

            if self._profile is None:
                if self.profile_id:
                    # TenantManager automatically filters by current tenant
                    self._profile = BusinessHoursProfile.objects.select_related().get(
                        id=self.profile_id, is_active=True
                    )
                else:
                    # TenantManager automatically filters by current tenant
                    self._profile = BusinessHoursProfile.objects.select_related().get(
                        is_default=True, is_active=True
                    )
                cache.set(cache_key, self._profile, self.CACHE_TIMEOUT)

        return self._profile
    
    def is_open(self, dt: Optional[datetime] = None) -> bool:
        """
        Check if the business is open at a specific datetime
        
        Args:
            dt: Datetime to check. If None, uses current time.
            
        Returns:
            True if open, False if closed
        """
        if dt is None:
            dt = timezone.now()
        
        # Convert to business timezone
        business_tz = pytz.timezone(self.profile.timezone)
        if dt.tzinfo is None:
            dt = timezone.make_aware(dt, business_tz)
        else:
            dt = dt.astimezone(business_tz)
        
        check_date = dt.date()
        check_time = dt.time()
        
        # First check for special hours on this date
        special_hours = self._get_special_hours_for_date(check_date)
        if special_hours:
            return self._is_time_in_slots(check_time, special_hours['slots'])
        
        # Check for holidays
        if self._is_holiday(check_date):
            return False  # Assuming holidays are closed by default
        
        # Check regular hours for current day
        regular_hours = self._get_regular_hours_for_date(check_date)
        if regular_hours and not regular_hours['is_closed']:
            if self._is_time_in_slots(check_time, regular_hours['slots']):
                return True
        
        # Check if previous day's overnight hours extend into this day
        previous_date = check_date - timedelta(days=1)
        prev_special_hours = self._get_special_hours_for_date(previous_date)
        
        if prev_special_hours and not prev_special_hours['is_closed']:
            if self._is_time_in_overnight_slots(check_time, prev_special_hours['slots']):
                return True
        
        prev_regular_hours = self._get_regular_hours_for_date(previous_date)
        if prev_regular_hours and not prev_regular_hours['is_closed']:
            if self._is_time_in_overnight_slots(check_time, prev_regular_hours['slots']):
                return True
        
        return False
    
    def get_next_opening_time(self, from_dt: Optional[datetime] = None) -> Optional[datetime]:
        """
        Get the next time the business will be open
        
        Args:
            from_dt: Start searching from this datetime. If None, uses current time.
            
        Returns:
            Next opening datetime or None if no opening found in next 30 days
        """
        if from_dt is None:
            from_dt = timezone.now()
        
        business_tz = pytz.timezone(self.profile.timezone)
        if from_dt.tzinfo is None:
            from_dt = timezone.make_aware(from_dt, business_tz)
        else:
            from_dt = from_dt.astimezone(business_tz)
        
        # Search for next 30 days
        for i in range(30):
            check_date = (from_dt + timedelta(days=i)).date()
            
            # Get hours for this date
            hours_info = self._get_hours_for_date(check_date)
            if not hours_info or hours_info['is_closed']:
                continue
            
            # Find next opening time on this date
            for slot in hours_info['slots']:
                opening_dt = datetime.combine(check_date, slot['opening_time'])
                opening_dt = business_tz.localize(opening_dt)
                
                # If this is today, make sure opening time is in the future
                if i == 0 and opening_dt <= from_dt:
                    continue
                
                return opening_dt
        
        return None
    
    def get_next_closing_time(self, from_dt: Optional[datetime] = None) -> Optional[datetime]:
        """
        Get the next time the business will close
        
        Args:
            from_dt: Start searching from this datetime. If None, uses current time.
            
        Returns:
            Next closing datetime or None if currently closed or no closing found
        """
        if from_dt is None:
            from_dt = timezone.now()
        
        if not self.is_open(from_dt):
            return None
        
        business_tz = pytz.timezone(self.profile.timezone)
        if from_dt.tzinfo is None:
            from_dt = timezone.make_aware(from_dt, business_tz)
        else:
            from_dt = from_dt.astimezone(business_tz)
        
        check_date = from_dt.date()
        check_time = from_dt.time()
        
        # Get hours for today
        hours_info = self._get_hours_for_date(check_date)
        if not hours_info or hours_info['is_closed']:
            return None
        
        # Find the current slot and return its closing time
        for slot in hours_info['slots']:
            if self._is_time_in_slot(check_time, slot):
                closing_dt = datetime.combine(check_date, slot['closing_time'])
                
                # Handle overnight slots
                if slot['closing_time'] <= slot['opening_time']:
                    closing_dt += timedelta(days=1)
                
                return business_tz.localize(closing_dt)
        
        return None
    
    def get_hours_for_date(self, target_date: date) -> Dict:
        """
        Get business hours for a specific date
        
        Args:
            target_date: Date to get hours for
            
        Returns:
            Dict with keys: is_closed, slots, reason (if special hours)
        """
        return self._get_hours_for_date(target_date)
    
    def get_weekly_schedule(self, start_date: Optional[date] = None) -> Dict[str, Dict]:
        """
        Get weekly schedule starting from a specific date
        
        Args:
            start_date: Start date for the week. If None, uses current date.
            
        Returns:
            Dict mapping date strings to hours info
        """
        if start_date is None:
            start_date = timezone.now().date()
        
        # Start from Monday of the week containing start_date
        days_since_monday = start_date.weekday()
        week_start = start_date - timedelta(days=days_since_monday)
        
        schedule = {}
        for i in range(7):
            date_obj = week_start + timedelta(days=i)
            date_str = date_obj.strftime('%Y-%m-%d')
            schedule[date_str] = self._get_hours_for_date(date_obj)
        
        return schedule
    
    def get_status_summary(self, dt: Optional[datetime] = None) -> Dict:
        """
        Get comprehensive status summary
        
        Args:
            dt: Datetime to check status for. If None, uses current time.
            
        Returns:
            Dict with current status, next change time, and today's hours
        """
        if dt is None:
            dt = timezone.now()
        
        is_open = self.is_open(dt)
        
        summary = {
            'is_open': is_open,
            'current_time': dt.isoformat(),
            'timezone': self.profile.timezone,
        }
        
        if is_open:
            summary['next_closing'] = self.get_next_closing_time(dt)
        else:
            summary['next_opening'] = self.get_next_opening_time(dt)
        
        # Add today's hours
        business_tz = pytz.timezone(self.profile.timezone)
        local_dt = dt.astimezone(business_tz)
        today_hours = self._get_hours_for_date(local_dt.date())
        summary['today_hours'] = today_hours
        
        return summary
    
    def _get_hours_for_date(self, target_date: date) -> Dict:
        """Internal method to get hours for a specific date with caching"""
        from tenant.managers import get_current_tenant
        tenant = get_current_tenant()

        # Include tenant in cache key to prevent cross-tenant cache pollution
        cache_key = f"business_hours_{tenant.id if tenant else 'none'}_{self.profile.id}_{target_date}"
        hours_info = cache.get(cache_key)
        
        if hours_info is None:
            # Check for special hours first
            special_hours = self._get_special_hours_for_date(target_date)
            if special_hours:
                hours_info = special_hours
            else:
                # Check for holiday
                if self._is_holiday(target_date):
                    hours_info = {
                        'is_closed': True,
                        'slots': [],
                        'reason': 'Holiday'
                    }
                else:
                    # Get regular hours
                    hours_info = self._get_regular_hours_for_date(target_date)
            
            cache.set(cache_key, hours_info, self.CACHE_TIMEOUT)
        
        return hours_info
    
    def _get_special_hours_for_date(self, target_date: date) -> Optional[Dict]:
        """Get special hours for a specific date"""
        try:
            special_hours = SpecialHours.objects.get(
                profile=self.profile,
                date=target_date
            )
            
            if special_hours.is_closed:
                return {
                    'is_closed': True,
                    'slots': [],
                    'reason': special_hours.reason or 'Special Hours'
                }
            
            slots = []
            for slot in special_hours.special_time_slots.all():
                slots.append({
                    'opening_time': slot.opening_time,
                    'closing_time': slot.closing_time,
                    'type': 'special'
                })
            
            return {
                'is_closed': False,
                'slots': slots,
                'reason': special_hours.reason or 'Special Hours'
            }
            
        except SpecialHours.DoesNotExist:
            return None
    
    def _get_regular_hours_for_date(self, target_date: date) -> Dict:
        """Get regular hours for a specific date"""
        day_of_week = target_date.weekday()  # Monday = 0, Sunday = 6
        
        try:
            regular_hours = RegularHours.objects.get(
                profile=self.profile,
                day_of_week=day_of_week
            )
            
            if regular_hours.is_closed:
                return {
                    'is_closed': True,
                    'slots': []
                }
            
            slots = []
            for slot in regular_hours.time_slots.all():
                slots.append({
                    'opening_time': slot.opening_time,
                    'closing_time': slot.closing_time,
                    'type': slot.slot_type
                })
            
            return {
                'is_closed': False,
                'slots': slots
            }
            
        except RegularHours.DoesNotExist:
            # Default to closed if no hours defined
            return {
                'is_closed': True,
                'slots': []
            }
    
    def _is_holiday(self, target_date: date) -> bool:
        """Check if a date is a holiday"""
        return Holiday.objects.filter(
            profile=self.profile,
            month=target_date.month,
            day=target_date.day,
            is_closed=True
        ).exists()
    
    def _is_time_in_slots(self, check_time: time, slots: List[Dict]) -> bool:
        """Check if a time falls within any of the provided time slots"""
        for slot in slots:
            if self._is_time_in_slot(check_time, slot):
                return True
        return False
    
    def _is_time_in_slot(self, check_time: time, slot: Dict) -> bool:
        """Check if a time falls within a specific time slot"""
        opening = slot['opening_time']
        closing = slot['closing_time']
        
        # Handle overnight hours (e.g., 10 PM to 6 AM)
        if opening > closing:
            return check_time >= opening or check_time <= closing
        else:
            return opening <= check_time <= closing
    
    def _is_time_in_overnight_slots(self, check_time: time, slots: List[Dict]) -> bool:
        """Check if a time falls within any overnight slots from the previous day"""
        for slot in slots:
            opening = slot['opening_time']
            closing = slot['closing_time']
            
            # Only check slots that span overnight (opening > closing)
            if opening > closing:
                # Check if current time is in the "next day" portion (before closing)
                if check_time <= closing:
                    return True
        return False
    
    @classmethod
    def clear_cache(cls, profile_id: Optional[int] = None):
        """Clear cached business hours data"""
        if profile_id:
            # Clear specific profile cache
            cache.delete(f"business_hours_profile_{profile_id}")
            # Clear date-specific caches (would need pattern deletion in production)
        else:
            # Clear all business hours caches (simplified approach)
            cache.delete("business_hours_profile_default")
    
    @classmethod
    def get_default_service(cls) -> 'BusinessHoursService':
        """Get service instance for the default profile"""
        return cls()