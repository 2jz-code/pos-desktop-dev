from django.test import TestCase
from django.utils import timezone
from datetime import datetime, date, time
import pytz

from .models import BusinessHoursProfile, RegularHours, TimeSlot, SpecialHours, SpecialHoursTimeSlot
from .services import BusinessHoursService


class BusinessHoursServiceTest(TestCase):
    """Test cases for BusinessHoursService"""
    
    def setUp(self):
        """Set up test data"""
        # Create a test profile
        self.profile = BusinessHoursProfile.objects.create(
            name='Test Store',
            timezone='America/New_York',
            is_active=True,
            is_default=True
        )
        
        # Create regular hours for weekdays (Monday-Friday)
        for day in range(5):  # Monday to Friday
            regular_hours = RegularHours.objects.create(
                profile=self.profile,
                day_of_week=day,
                is_closed=False
            )
            # Add regular business hours: 9 AM - 5 PM
            TimeSlot.objects.create(
                regular_hours=regular_hours,
                opening_time=time(9, 0),
                closing_time=time(17, 0),
                slot_type='regular'
            )
        
        # Create weekend hours (Saturday-Sunday) - closed
        for day in range(5, 7):  # Saturday, Sunday
            RegularHours.objects.create(
                profile=self.profile,
                day_of_week=day,
                is_closed=True
            )
        
        self.service = BusinessHoursService()
    
    def test_is_open_during_business_hours(self):
        """Test that service correctly identifies open hours"""
        # Test a weekday during business hours
        weekday_open = datetime(2024, 1, 15, 14, 0)  # Monday 2 PM
        weekday_open = pytz.timezone('America/New_York').localize(weekday_open)
        
        self.assertTrue(self.service.is_open(weekday_open))
    
    def test_is_closed_outside_business_hours(self):
        """Test that service correctly identifies closed hours"""
        # Test a weekday outside business hours
        weekday_closed = datetime(2024, 1, 15, 20, 0)  # Monday 8 PM
        weekday_closed = pytz.timezone('America/New_York').localize(weekday_closed)
        
        self.assertFalse(self.service.is_open(weekday_closed))
    
    def test_is_closed_on_weekend(self):
        """Test that service correctly identifies weekend as closed"""
        # Test weekend
        weekend_closed = datetime(2024, 1, 13, 14, 0)  # Saturday 2 PM
        weekend_closed = pytz.timezone('America/New_York').localize(weekend_closed)
        
        self.assertFalse(self.service.is_open(weekend_closed))
    
    def test_special_hours_override(self):
        """Test that special hours override regular hours"""
        special_date = date(2024, 1, 15)  # Monday
        
        # Create special hours for this Monday - closed
        SpecialHours.objects.create(
            profile=self.profile,
            date=special_date,
            is_closed=True,
            reason='Staff Training'
        )
        
        # Test that it's closed despite being a regular business day
        test_dt = datetime(2024, 1, 15, 14, 0)  # Monday 2 PM
        test_dt = pytz.timezone('America/New_York').localize(test_dt)
        
        self.assertFalse(self.service.is_open(test_dt))
    
    def test_special_hours_with_custom_times(self):
        """Test special hours with custom time slots"""
        special_date = date(2024, 1, 15)  # Monday
        
        # Create special hours with different times
        special_hours = SpecialHours.objects.create(
            profile=self.profile,
            date=special_date,
            is_closed=False,
            reason='Extended Hours'
        )
        
        # Add special time slot: 8 AM - 10 PM
        SpecialHoursTimeSlot.objects.create(
            special_hours=special_hours,
            opening_time=time(8, 0),
            closing_time=time(22, 0)
        )
        
        # Test early morning (should be open with special hours)
        early_dt = datetime(2024, 1, 15, 8, 30)  # Monday 8:30 AM
        early_dt = pytz.timezone('America/New_York').localize(early_dt)
        
        self.assertTrue(self.service.is_open(early_dt))
    
    def test_get_next_opening_time(self):
        """Test getting next opening time"""
        # Test from a closed time (weekend)
        weekend_dt = datetime(2024, 1, 13, 14, 0)  # Saturday 2 PM
        weekend_dt = pytz.timezone('America/New_York').localize(weekend_dt)
        
        next_opening = self.service.get_next_opening_time(weekend_dt)
        
        # Should be Monday 9 AM
        expected = datetime(2024, 1, 15, 9, 0)  # Monday 9 AM
        expected = pytz.timezone('America/New_York').localize(expected)
        
        self.assertEqual(next_opening, expected)
    
    def test_get_weekly_schedule(self):
        """Test getting weekly schedule"""
        test_date = date(2024, 1, 15)  # Monday
        schedule = self.service.get_weekly_schedule(test_date)
        
        # Should have 7 days
        self.assertEqual(len(schedule), 7)
        
        # Monday should be open
        monday_hours = schedule['2024-01-15']
        self.assertFalse(monday_hours['is_closed'])
        self.assertEqual(len(monday_hours['slots']), 1)
        
        # Saturday should be closed
        saturday_hours = schedule['2024-01-20']
        self.assertTrue(saturday_hours['is_closed'])
    
    def test_get_status_summary(self):
        """Test getting status summary"""
        # Test during business hours
        weekday_dt = datetime(2024, 1, 15, 14, 0)  # Monday 2 PM
        weekday_dt = pytz.timezone('America/New_York').localize(weekday_dt)
        
        summary = self.service.get_status_summary(weekday_dt)
        
        self.assertTrue(summary['is_open'])
        self.assertIn('next_closing', summary)
        self.assertIn('today_hours', summary)
        self.assertEqual(summary['timezone'], 'America/New_York')
    
    def test_overnight_hours(self):
        """Test overnight hours handling"""
        # Create a profile with overnight hours
        night_profile = BusinessHoursProfile.objects.create(
            name='Night Store',
            timezone='America/New_York',
            is_active=True,
            is_default=False
        )
        
        # Friday night hours: 10 PM - 6 AM Saturday
        friday_hours = RegularHours.objects.create(
            profile=night_profile,
            day_of_week=4,  # Friday
            is_closed=False
        )
        
        TimeSlot.objects.create(
            regular_hours=friday_hours,
            opening_time=time(22, 0),  # 10 PM
            closing_time=time(6, 0),   # 6 AM next day
            slot_type='regular'
        )
        
        night_service = BusinessHoursService(night_profile.id)
        
        # Test Friday 11 PM (should be open)
        friday_night = datetime(2024, 1, 19, 23, 0)  # Friday 11 PM
        friday_night = pytz.timezone('America/New_York').localize(friday_night)
        
        self.assertTrue(night_service.is_open(friday_night))
        
        # Test Saturday 3 AM (should be open - still Friday's hours)
        saturday_early = datetime(2024, 1, 20, 3, 0)  # Saturday 3 AM
        saturday_early = pytz.timezone('America/New_York').localize(saturday_early)
        
        self.assertTrue(night_service.is_open(saturday_early))
