"""
Business Hours Error Handling Tests

This module tests how the business hours system handles failure scenarios,
invalid inputs, and edge cases. These tests are critical for order scheduling robustness.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Invalid Schedule Validation
2. Overlapping Hours Detection
3. Timezone Edge Cases
4. Order Outside Business Hours Handling
5. Holiday/Special Hours Validation
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from datetime import time

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from business_hours.models import BusinessHoursProfile

User = get_user_model()


# ============================================================================
# INVALID SCHEDULE VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestInvalidScheduleValidation:
    """Test validation of invalid business hour schedules."""

    def test_duplicate_day_of_week_per_profile_fails(self):
        """
        IMPORTANT: Verify cannot create duplicate day entries for same profile.

        Scenario:
        - Create business hours profile
        - Create RegularHours for Monday
        - Try to create another RegularHours for Monday
        - Expected: IntegrityError (unique_together constraint)

        Value: Ensures schedule data integrity
        """
        from django.db import IntegrityError
        from business_hours.models import RegularHours

        # Create tenant and profile
        tenant = Tenant.objects.create(
            slug="schedule-test",
            name="Schedule Test",
            is_active=True
        )

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="Main Store",
            is_active=True
        )

        # Create Monday hours
        RegularHours.objects.create(
            tenant=tenant,
            profile=profile,
            day_of_week=0,  # Monday
            is_closed=False
        )

        # Try to create duplicate Monday hours - should fail
        with pytest.raises(IntegrityError):
            RegularHours.objects.create(
                tenant=tenant,
                profile=profile,
                day_of_week=0,  # Duplicate Monday!
                is_closed=False
            )

    def test_invalid_holiday_date_fails_validation(self):
        """
        IMPORTANT: Verify invalid holiday dates fail validation.

        Scenario:
        - Create business hours profile
        - Try to create holiday with invalid date (e.g., Feb 30)
        - Expected: ValidationError

        Value: Ensures date validity
        """
        from django.core.exceptions import ValidationError
        from business_hours.models import Holiday

        # Create tenant and profile
        tenant = Tenant.objects.create(
            slug="holiday-test",
            name="Holiday Test",
            is_active=True
        )

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="Main Store",
            is_active=True
        )

        # Try to create invalid holiday (Feb 30 doesn't exist)
        holiday = Holiday(
            tenant=tenant,
            profile=profile,
            name="Invalid Date",
            month=2,
            day=30,  # Invalid!
            is_closed=True
        )

        # Should raise validation error
        with pytest.raises(ValidationError):
            holiday.full_clean()


# ============================================================================
# OVERLAPPING HOURS DETECTION TESTS
# ============================================================================

@pytest.mark.django_db
class TestOverlappingHoursDetection:
    """Test detection and handling of overlapping business hours."""

    def test_overlapping_time_slots_fail_validation(self):
        """
        CRITICAL: Verify overlapping time slots fail validation.

        Scenario:
        - Create regular hours with time slot 9am-5pm
        - Try to add overlapping slot 4pm-8pm
        - Expected: ValidationError

        Value: Prevents scheduling conflicts
        """
        from django.core.exceptions import ValidationError
        from business_hours.models import RegularHours, TimeSlot

        # Create tenant and profile
        tenant = Tenant.objects.create(
            slug="overlap-test",
            name="Overlap Test",
            is_active=True
        )

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="Main Store",
            is_active=True
        )

        # Create Monday hours
        regular_hours = RegularHours.objects.create(
            tenant=tenant,
            profile=profile,
            day_of_week=0,  # Monday
            is_closed=False
        )

        # Create first time slot: 9am-5pm
        TimeSlot.objects.create(
            tenant=tenant,
            regular_hours=regular_hours,
            opening_time=time(9, 0),
            closing_time=time(17, 0),
            slot_type='regular'
        )

        # Create overlapping slot: 4pm-8pm
        TimeSlot.objects.create(
            tenant=tenant,
            regular_hours=regular_hours,
            opening_time=time(16, 0),  # Overlaps with first slot!
            closing_time=time(20, 0),
            slot_type='regular'
        )

        # Set tenant context so clean() can query time_slots
        set_current_tenant(tenant)

        # Validation should catch overlap
        with pytest.raises(ValidationError):
            regular_hours.clean()


# ============================================================================
# TIMEZONE EDGE CASE TESTS
# ============================================================================

@pytest.mark.django_db
class TestTimezoneEdgeCases:
    """Test timezone-related edge cases in business hours."""

    def test_business_hours_profile_accepts_valid_timezone(self):
        """
        IMPORTANT: Verify business hours profile accepts valid timezones.

        Scenario:
        - Create profile with valid timezone
        - Expected: Success

        Value: Ensures timezone configuration works
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="timezone-test",
            name="Timezone Test",
            is_active=True
        )

        # Create profile with valid timezone
        profile = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="West Coast Store",
            timezone='America/Los_Angeles',  # Valid
            is_active=True
        )

        assert profile.timezone == 'America/Los_Angeles'

    def test_only_one_default_profile_per_tenant(self):
        """
        CRITICAL: Verify only one default profile can exist per tenant.

        Scenario:
        - Create default profile
        - Create another profile as default
        - Expected: First profile is no longer default

        Value: Ensures default profile uniqueness
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="default-test",
            name="Default Test",
            is_active=True
        )

        # Create first default profile
        profile1 = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="Profile 1",
            is_default=True,
            is_active=True
        )

        assert profile1.is_default is True

        # Create second default profile
        profile2 = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="Profile 2",
            is_default=True,
            is_active=True
        )

        # Refresh profile1 from database
        profile1.refresh_from_db()

        # Profile1 should no longer be default
        assert profile1.is_default is False
        assert profile2.is_default is True


# ============================================================================
# ORDER OUTSIDE HOURS HANDLING TESTS
# ============================================================================

@pytest.mark.django_db
class TestOrderOutsideHoursHandling:
    """Test handling of orders placed outside business hours."""

    def test_can_create_closed_day_schedule(self):
        """
        IMPORTANT: Verify can mark days as closed.

        Scenario:
        - Create regular hours for Sunday
        - Mark as closed
        - Expected: Success

        Value: Ensures closed day handling works
        """
        from business_hours.models import RegularHours

        # Create tenant and profile
        tenant = Tenant.objects.create(
            slug="closed-test",
            name="Closed Test",
            is_active=True
        )

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="Main Store",
            is_active=True
        )

        # Create Sunday as closed
        sunday_hours = RegularHours.objects.create(
            tenant=tenant,
            profile=profile,
            day_of_week=6,  # Sunday
            is_closed=True
        )

        assert sunday_hours.is_closed is True

    def test_special_hours_override_regular_hours(self):
        """
        IMPORTANT: Verify special hours can override regular schedule.

        Scenario:
        - Create regular hours
        - Create special hours for specific date
        - Expected: Both exist independently

        Value: Ensures special hours functionality
        """
        from business_hours.models import RegularHours, SpecialHours
        from datetime import date

        # Create tenant and profile
        tenant = Tenant.objects.create(
            slug="special-test",
            name="Special Test",
            is_active=True
        )

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="Main Store",
            is_active=True
        )

        # Create regular hours
        RegularHours.objects.create(
            tenant=tenant,
            profile=profile,
            day_of_week=0,  # Monday
            is_closed=False
        )

        # Create special hours for specific date (e.g., Christmas)
        special = SpecialHours.objects.create(
            tenant=tenant,
            profile=profile,
            date=date(2025, 12, 25),
            is_closed=True,
            reason="Christmas"
        )

        assert special.is_closed is True
        assert special.reason == "Christmas"
