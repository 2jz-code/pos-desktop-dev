"""
Business Hours Tests

Tests for business hours checking, special hours, overnight hours,
and weekly schedules with tenant isolation.
"""

import pytest
from datetime import datetime, date, time
import pytz

from tenant.managers import set_current_tenant
from business_hours.models import (
    BusinessHoursProfile, RegularHours, TimeSlot,
    SpecialHours, SpecialHoursTimeSlot
)
from business_hours.services import BusinessHoursService


@pytest.fixture
def business_hours_profile_tenant_a(tenant_a):
    """Create a business hours profile for tenant A"""
    set_current_tenant(tenant_a)

    # Create profile
    profile = BusinessHoursProfile.objects.create(
        tenant=tenant_a,
        name='Test Store',
        timezone='America/New_York',
        is_active=True,
        is_default=True
    )

    # Create regular hours for weekdays (Monday-Friday): 9 AM - 5 PM
    for day in range(5):
        regular_hours = RegularHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            day_of_week=day,
            is_closed=False
        )
        TimeSlot.objects.create(
            tenant=tenant_a,
            regular_hours=regular_hours,
            opening_time=time(9, 0),
            closing_time=time(17, 0),
            slot_type='regular'
        )

    # Create weekend hours (Saturday-Sunday) - closed
    for day in range(5, 7):
        RegularHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            day_of_week=day,
            is_closed=True
        )

    return profile


@pytest.mark.django_db
class TestBusinessHoursService:
    """Test BusinessHoursService functionality"""

    def test_is_open_during_business_hours(self, tenant_a, business_hours_profile_tenant_a):
        """Test that service correctly identifies open hours"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)

        # Test a weekday during business hours (Monday 2 PM)
        weekday_open = datetime(2024, 1, 15, 14, 0)
        weekday_open = pytz.timezone('America/New_York').localize(weekday_open)

        assert service.is_open(weekday_open) is True

    def test_is_closed_outside_business_hours(self, tenant_a, business_hours_profile_tenant_a):
        """Test that service correctly identifies closed hours"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)

        # Test a weekday outside business hours (Monday 8 PM)
        weekday_closed = datetime(2024, 1, 15, 20, 0)
        weekday_closed = pytz.timezone('America/New_York').localize(weekday_closed)

        assert service.is_open(weekday_closed) is False

    def test_is_closed_on_weekend(self, tenant_a, business_hours_profile_tenant_a):
        """Test that service correctly identifies weekend as closed"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)

        # Test weekend (Saturday 2 PM)
        weekend_closed = datetime(2024, 1, 13, 14, 0)
        weekend_closed = pytz.timezone('America/New_York').localize(weekend_closed)

        assert service.is_open(weekend_closed) is False

    def test_special_hours_override(self, tenant_a, business_hours_profile_tenant_a):
        """Test that special hours override regular hours"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)
        special_date = date(2024, 1, 15)  # Monday

        # Create special hours for this Monday - closed
        SpecialHours.objects.create(
            tenant=tenant_a,
            profile=business_hours_profile_tenant_a,
            date=special_date,
            is_closed=True,
            reason='Staff Training'
        )

        # Test that it's closed despite being a regular business day
        test_dt = datetime(2024, 1, 15, 14, 0)  # Monday 2 PM
        test_dt = pytz.timezone('America/New_York').localize(test_dt)

        assert service.is_open(test_dt) is False

    def test_special_hours_with_custom_times(self, tenant_a, business_hours_profile_tenant_a):
        """Test special hours with custom time slots"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)
        special_date = date(2024, 1, 15)  # Monday

        # Create special hours with different times
        special_hours = SpecialHours.objects.create(
            tenant=tenant_a,
            profile=business_hours_profile_tenant_a,
            date=special_date,
            is_closed=False,
            reason='Extended Hours'
        )

        # Add special time slot: 8 AM - 10 PM
        SpecialHoursTimeSlot.objects.create(
            tenant=tenant_a,
            special_hours=special_hours,
            opening_time=time(8, 0),
            closing_time=time(22, 0)
        )

        # Test early morning (should be open with special hours)
        early_dt = datetime(2024, 1, 15, 8, 30)  # Monday 8:30 AM
        early_dt = pytz.timezone('America/New_York').localize(early_dt)

        assert service.is_open(early_dt) is True

    def test_get_next_opening_time(self, tenant_a, business_hours_profile_tenant_a):
        """Test getting next opening time"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)

        # Test from a closed time (Saturday 2 PM)
        weekend_dt = datetime(2024, 1, 13, 14, 0)
        weekend_dt = pytz.timezone('America/New_York').localize(weekend_dt)

        next_opening = service.get_next_opening_time(weekend_dt)

        # Should be Monday 9 AM
        expected = datetime(2024, 1, 15, 9, 0)
        expected = pytz.timezone('America/New_York').localize(expected)

        assert next_opening == expected

    def test_get_weekly_schedule(self, tenant_a, business_hours_profile_tenant_a):
        """Test getting weekly schedule"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)
        test_date = date(2024, 1, 15)  # Monday
        schedule = service.get_weekly_schedule(test_date)

        # Should have 7 days
        assert len(schedule) == 7

        # Monday should be open
        monday_hours = schedule['2024-01-15']
        assert monday_hours['is_closed'] is False
        assert len(monday_hours['slots']) == 1

        # Saturday should be closed
        saturday_hours = schedule['2024-01-20']
        assert saturday_hours['is_closed'] is True

    def test_get_status_summary(self, tenant_a, business_hours_profile_tenant_a):
        """Test getting status summary"""
        set_current_tenant(tenant_a)

        service = BusinessHoursService(business_hours_profile_tenant_a.id)

        # Test during business hours (Monday 2 PM)
        weekday_dt = datetime(2024, 1, 15, 14, 0)
        weekday_dt = pytz.timezone('America/New_York').localize(weekday_dt)

        summary = service.get_status_summary(weekday_dt)

        assert summary['is_open'] is True
        assert 'next_closing' in summary
        assert 'today_hours' in summary
        assert summary['timezone'] == 'America/New_York'

    def test_overnight_hours(self, tenant_a):
        """Test overnight hours handling"""
        set_current_tenant(tenant_a)

        # Create a profile with overnight hours
        night_profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Night Store',
            timezone='America/New_York',
            is_active=True,
            is_default=False
        )

        # Friday night hours: 10 PM - 6 AM Saturday
        friday_hours = RegularHours.objects.create(
            tenant=tenant_a,
            profile=night_profile,
            day_of_week=4,  # Friday
            is_closed=False
        )

        TimeSlot.objects.create(
            tenant=tenant_a,
            regular_hours=friday_hours,
            opening_time=time(22, 0),  # 10 PM
            closing_time=time(6, 0),   # 6 AM next day
            slot_type='regular'
        )

        night_service = BusinessHoursService(night_profile.id)

        # Test Friday 11 PM (should be open)
        friday_night = datetime(2024, 1, 19, 23, 0)
        friday_night = pytz.timezone('America/New_York').localize(friday_night)

        assert night_service.is_open(friday_night) is True

        # Test Saturday 3 AM (should be open - still Friday's hours)
        saturday_early = datetime(2024, 1, 20, 3, 0)
        saturday_early = pytz.timezone('America/New_York').localize(saturday_early)

        assert night_service.is_open(saturday_early) is True


@pytest.mark.django_db
class TestBusinessHoursTenantIsolation:
    """Test tenant isolation for business hours"""

    def test_business_hours_profile_isolated_by_tenant(self, tenant_a, tenant_b):
        """Test that business hours profiles are isolated by tenant"""
        # Create profile for tenant A
        set_current_tenant(tenant_a)
        profile_a = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Store A',
            timezone='America/New_York',
            is_default=True
        )

        # Create profile for tenant B
        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(
            tenant=tenant_b,
            name='Store B',
            timezone='America/Los_Angeles',
            is_default=True
        )

        # Verify isolation
        set_current_tenant(tenant_a)
        profiles = BusinessHoursProfile.objects.all()
        assert profiles.count() == 1
        assert profiles.first().name == 'Store A'
        assert profiles.first().timezone == 'America/New_York'

        set_current_tenant(tenant_b)
        profiles = BusinessHoursProfile.objects.all()
        assert profiles.count() == 1
        assert profiles.first().name == 'Store B'
        assert profiles.first().timezone == 'America/Los_Angeles'

    def test_regular_hours_isolated_by_tenant(self, tenant_a, tenant_b):
        """Test that regular hours are isolated by tenant"""
        # Create for tenant A
        set_current_tenant(tenant_a)
        profile_a = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Store A'
        )
        hours_a = RegularHours.objects.create(
            tenant=tenant_a,
            profile=profile_a,
            day_of_week=0,  # Monday
            is_closed=False
        )

        # Create for tenant B
        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(
            tenant=tenant_b,
            name='Store B'
        )
        hours_b = RegularHours.objects.create(
            tenant=tenant_b,
            profile=profile_b,
            day_of_week=0,  # Monday
            is_closed=True
        )

        # Verify isolation
        set_current_tenant(tenant_a)
        hours = RegularHours.objects.all()
        assert hours.count() == 1
        assert hours.first().is_closed is False

        set_current_tenant(tenant_b)
        hours = RegularHours.objects.all()
        assert hours.count() == 1
        assert hours.first().is_closed is True

    def test_default_profile_per_tenant(self, tenant_a, tenant_b):
        """Test that each tenant can have its own default profile"""
        # Create default profile for tenant A
        set_current_tenant(tenant_a)
        profile_a1 = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Store A1',
            is_default=True
        )

        # Create second profile for tenant A
        profile_a2 = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Store A2',
            is_default=True  # This should make A1 non-default
        )

        # Create default profile for tenant B
        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(
            tenant=tenant_b,
            name='Store B',
            is_default=True
        )

        # Verify tenant A has new default
        set_current_tenant(tenant_a)
        profile_a1.refresh_from_db()
        assert profile_a1.is_default is False
        assert profile_a2.is_default is True

        # Verify tenant B default is unchanged
        set_current_tenant(tenant_b)
        assert profile_b.is_default is True
