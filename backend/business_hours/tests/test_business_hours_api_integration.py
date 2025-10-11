"""
Business Hours API Integration Tests

Full request/response cycle tests for business_hours API endpoints with
authentication, permissions, tenant isolation, and middleware integration.

Test Coverage:
- Public endpoints (AllowAny): status, schedule, today, check
- Admin endpoints (IsAuthenticated): ViewSets for profiles, regular-hours, time-slots, special-hours, holidays
- Tenant isolation at API layer
- Permission classes (AllowAny vs IsAuthenticated)
- Query parameter filtering
- Error handling (404, 400, 500)
"""

import pytest
from datetime import datetime, date, time, timedelta
import pytz
from django.utils import timezone
from rest_framework import status

from tenant.managers import set_current_tenant
from business_hours.models import (
    BusinessHoursProfile, RegularHours, TimeSlot,
    SpecialHours, SpecialHoursTimeSlot, Holiday
)


@pytest.mark.django_db
@pytest.mark.integration
class TestPublicEndpointsAPIIntegration:
    """Test public business hours endpoints (AllowAny permission)"""

    def test_status_endpoint_public_access(self, api_client_factory, tenant_a):
        """Test that status endpoint allows public access"""
        set_current_tenant(tenant_a)

        # Create a default profile
        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            timezone='America/New_York',
            is_active=True,
            is_default=True
        )

        # Create regular hours for Monday
        regular_hours = RegularHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            day_of_week=0,  # Monday
            is_closed=False
        )
        TimeSlot.objects.create(
            tenant=tenant_a,
            regular_hours=regular_hours,
            opening_time=time(9, 0),
            closing_time=time(17, 0),
            slot_type='regular'
        )

        # Public access (no authentication, but with tenant in session)
        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.get('/api/business-hours/status/')

        assert response.status_code == status.HTTP_200_OK
        assert 'is_open' in response.data
        assert 'timezone' in response.data

    def test_schedule_endpoint_returns_weekly_schedule(self, api_client_factory, tenant_a):
        """Test schedule endpoint returns 7-day weekly schedule"""
        set_current_tenant(tenant_a)

        # Create profile with regular hours
        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            timezone='America/New_York',
            is_default=True
        )

        # Create hours for weekdays only
        for day in range(5):  # Monday-Friday
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

        # Weekends closed
        for day in range(5, 7):  # Saturday-Sunday
            RegularHours.objects.create(
                tenant=tenant_a,
                profile=profile,
                day_of_week=day,
                is_closed=True
            )

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.get('/api/business-hours/schedule/')

        assert response.status_code == status.HTTP_200_OK
        assert 'schedule' in response.data
        assert 'start_date' in response.data
        assert len(response.data['schedule']) == 7

    def test_schedule_endpoint_with_start_date_parameter(self, api_client_factory, tenant_a):
        """Test schedule endpoint with start_date query parameter"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            is_default=True
        )

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.get('/api/business-hours/schedule/?start_date=2024-01-15')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['start_date'] == '2024-01-15'

    def test_schedule_endpoint_invalid_date_format(self, api_client_factory, tenant_a):
        """Test schedule endpoint rejects invalid date format"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            is_default=True
        )

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.get('/api/business-hours/schedule/?start_date=invalid-date')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_today_endpoint_returns_today_hours(self, api_client_factory, tenant_a):
        """Test today endpoint returns hours for today's date"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            timezone='America/New_York',
            is_default=True
        )

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.get('/api/business-hours/today/')

        assert response.status_code == status.HTTP_200_OK
        assert 'date' in response.data
        assert 'hours' in response.data

    def test_today_endpoint_with_date_parameter(self, api_client_factory, tenant_a):
        """Test today endpoint with specific date parameter"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            is_default=True
        )

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.get('/api/business-hours/today/?date=2024-01-15')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['date'] == '2024-01-15'

    def test_check_endpoint_validates_datetime(self, api_client_factory, tenant_a):
        """Test check endpoint validates business hours at specific datetime"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            timezone='America/New_York',
            is_default=True
        )

        # Create regular hours for Monday
        regular_hours = RegularHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            day_of_week=0,  # Monday
            is_closed=False
        )
        TimeSlot.objects.create(
            tenant=tenant_a,
            regular_hours=regular_hours,
            opening_time=time(9, 0),
            closing_time=time(17, 0),
            slot_type='regular'
        )

        # Check Monday 2 PM (should be open)
        check_dt = datetime(2024, 1, 15, 14, 0)  # Monday 2 PM
        check_dt = pytz.timezone('America/New_York').localize(check_dt)

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.post('/api/business-hours/check/', {
            'datetime': check_dt.isoformat()
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'is_open' in response.data
        assert response.data['is_open'] is True

    def test_check_endpoint_missing_datetime_parameter(self, api_client_factory, tenant_a):
        """Test check endpoint requires datetime parameter"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Test Store',
            is_default=True
        )

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.post('/api/business-hours/check/', {}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'datetime' in response.data

    def test_status_endpoint_404_no_profile(self, api_client_factory, tenant_a):
        """Test status endpoint returns 404 when no profile exists"""
        set_current_tenant(tenant_a)

        client = api_client_factory(user=None, tenant=tenant_a)
        response = client.get('/api/business-hours/status/')

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert 'error' in response.data


@pytest.mark.django_db
@pytest.mark.integration
class TestAdminEndpointsAPIIntegration:
    """Test admin business hours endpoints (IsAuthenticated permission)"""

    def test_list_profiles_requires_authentication(self, api_client, tenant_a):
        """Test that listing profiles requires authentication"""
        set_current_tenant(tenant_a)

        response = api_client.get('/api/business-hours/admin/profiles/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_profiles_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test authenticated user can list business hours profiles"""
        set_current_tenant(tenant_a)

        # Create profiles
        profile1 = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Main Store',
            timezone='America/New_York',
            is_default=True
        )
        profile2 = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Branch Store',
            timezone='America/Los_Angeles',
            is_default=False
        )

        response = authenticated_client_tenant_a.get('/api/business-hours/admin/profiles/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        assert response.data[0]['name'] == 'Main Store'  # Default first
        assert response.data[1]['name'] == 'Branch Store'

    def test_create_profile_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test creating a business hours profile via API"""
        set_current_tenant(tenant_a)

        response = authenticated_client_tenant_a.post('/api/business-hours/admin/profiles/', {
            'name': 'New Store',
            'timezone': 'America/Chicago',
            'is_default': False
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'New Store'
        assert response.data['timezone'] == 'America/Chicago'

        # Verify profile created in database
        set_current_tenant(tenant_a)  # Re-set tenant context for ORM query
        profile = BusinessHoursProfile.objects.get(name='New Store')
        assert profile.tenant == tenant_a

    def test_create_profile_auto_creates_regular_hours(self, authenticated_client_tenant_a, tenant_a):
        """Test creating profile automatically creates RegularHours for 7 days"""
        set_current_tenant(tenant_a)

        response = authenticated_client_tenant_a.post('/api/business-hours/admin/profiles/', {
            'name': 'New Store',
            'timezone': 'America/New_York'
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED

        set_current_tenant(tenant_a)  # Re-set tenant context for ORM query
        profile = BusinessHoursProfile.objects.get(id=response.data['id'])
        regular_hours = RegularHours.objects.filter(profile=profile)

        # Should have 7 days (Monday-Sunday)
        assert regular_hours.count() == 7

    def test_update_profile_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test updating a business hours profile via API"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Old Name',
            timezone='America/New_York'
        )

        response = authenticated_client_tenant_a.patch(
            f'/api/business-hours/admin/profiles/{profile.id}/',
            {'name': 'Updated Name'},
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Name'

    def test_delete_profile_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test deleting a business hours profile via API"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='To Delete'
        )

        response = authenticated_client_tenant_a.delete(
            f'/api/business-hours/admin/profiles/{profile.id}/'
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify profile deleted
        assert not BusinessHoursProfile.objects.filter(id=profile.id).exists()

    def test_list_regular_hours_filtered_by_profile(self, authenticated_client_tenant_a, tenant_a):
        """Test listing regular hours filtered by profile_id"""
        set_current_tenant(tenant_a)

        profile1 = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store 1')
        profile2 = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store 2')

        # Create hours for profile1
        for day in range(3):
            RegularHours.objects.create(
                tenant=tenant_a,
                profile=profile1,
                day_of_week=day,
                is_closed=False
            )

        # Create hours for profile2
        for day in range(2):
            RegularHours.objects.create(
                tenant=tenant_a,
                profile=profile2,
                day_of_week=day,
                is_closed=False
            )

        response = authenticated_client_tenant_a.get(
            f'/api/business-hours/admin/regular-hours/?profile_id={profile1.id}'
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3

    def test_create_time_slot_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test creating a time slot via API"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store')
        regular_hours = RegularHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            day_of_week=0,
            is_closed=False
        )

        response = authenticated_client_tenant_a.post('/api/business-hours/admin/time-slots/', {
            'regular_hours': regular_hours.id,
            'opening_time': '09:00:00',
            'closing_time': '17:00:00',
            'slot_type': 'regular'
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['opening_time'] == '09:00:00'
        assert response.data['closing_time'] == '17:00:00'

        # Verify time slot created
        set_current_tenant(tenant_a)  # Re-set tenant context for ORM query
        time_slot = TimeSlot.objects.get(id=response.data['id'])
        assert time_slot.tenant == tenant_a

    def test_create_special_hours_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test creating special hours via API"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store')

        response = authenticated_client_tenant_a.post('/api/business-hours/admin/special-hours/', {
            'profile': profile.id,
            'date': '2024-12-25',
            'is_closed': True,
            'reason': 'Christmas Day'
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['date'] == '2024-12-25'
        assert response.data['reason'] == 'Christmas Day'
        assert response.data['is_closed'] is True

        # Verify special hours created
        set_current_tenant(tenant_a)  # Re-set tenant context for ORM query
        special_hours = SpecialHours.objects.get(id=response.data['id'])
        assert special_hours.tenant == tenant_a

    def test_list_special_hours_filtered_by_date_range(self, authenticated_client_tenant_a, tenant_a):
        """Test listing special hours filtered by date range"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store')

        # Create special hours for different dates
        SpecialHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            date=date(2024, 1, 1),
            is_closed=True,
            reason='New Year'
        )
        SpecialHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            date=date(2024, 7, 4),
            is_closed=True,
            reason='Independence Day'
        )
        SpecialHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            date=date(2024, 12, 25),
            is_closed=True,
            reason='Christmas'
        )

        # Query for Q1 special hours
        response = authenticated_client_tenant_a.get(
            '/api/business-hours/admin/special-hours/?start_date=2024-01-01&end_date=2024-03-31'
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['reason'] == 'New Year'

    def test_create_holiday_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test creating a holiday via API"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store')

        response = authenticated_client_tenant_a.post('/api/business-hours/admin/holidays/', {
            'profile': profile.id,
            'name': 'Independence Day',
            'month': 7,
            'day': 4,
            'is_closed': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Independence Day'
        assert response.data['month'] == 7
        assert response.data['day'] == 4

        # Verify holiday created
        set_current_tenant(tenant_a)  # Re-set tenant context for ORM query
        holiday = Holiday.objects.get(id=response.data['id'])
        assert holiday.tenant == tenant_a

    def test_admin_summary_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test admin summary endpoint returns comprehensive info"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Store',
            timezone='America/New_York',
            is_default=True
        )

        # Create upcoming special hours
        today = timezone.now().date()
        SpecialHours.objects.create(
            tenant=tenant_a,
            profile=profile,
            date=today + timedelta(days=5),
            is_closed=True,
            reason='Staff Training'
        )

        response = authenticated_client_tenant_a.get('/api/business-hours/admin/summary/')

        assert response.status_code == status.HTTP_200_OK
        assert 'profile' in response.data
        assert 'current_status' in response.data
        assert 'upcoming_special_hours' in response.data
        assert len(response.data['upcoming_special_hours']) == 1


@pytest.mark.django_db
@pytest.mark.integration
class TestTenantIsolationAPILayer:
    """Test tenant isolation at the API layer"""

    def test_profiles_list_filtered_by_tenant(self, api_client_factory, admin_user_tenant_a, admin_user_tenant_b, tenant_a, tenant_b):
        """Test profiles list is filtered by tenant"""
        # Create separate clients for each tenant to avoid shared state
        client_a = api_client_factory(admin_user_tenant_a)
        client_b = api_client_factory(admin_user_tenant_b)

        # Create profiles for both tenants
        set_current_tenant(tenant_a)
        profile_a = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store A')

        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(tenant=tenant_b, name='Store B')

        # Tenant A sees only their profile
        response = client_a.get('/api/business-hours/admin/profiles/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == 'Store A'

        # Tenant B sees only their profile
        response = client_b.get('/api/business-hours/admin/profiles/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == 'Store B'

    def test_cross_tenant_profile_access_denied(self, authenticated_client_tenant_a, tenant_a, tenant_b):
        """Test cross-tenant profile access returns 404"""
        # Create profile for tenant B
        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(tenant=tenant_b, name='Store B')

        # Tenant A tries to access tenant B's profile
        set_current_tenant(tenant_a)
        response = authenticated_client_tenant_a.get(
            f'/api/business-hours/admin/profiles/{profile_b.id}/'
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_cross_tenant_profile_update_denied(self, authenticated_client_tenant_a, tenant_a, tenant_b):
        """Test cross-tenant profile update is denied"""
        # Create profile for tenant B
        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(tenant=tenant_b, name='Store B')

        # Tenant A tries to update tenant B's profile
        set_current_tenant(tenant_a)
        response = authenticated_client_tenant_a.patch(
            f'/api/business-hours/admin/profiles/{profile_b.id}/',
            {'name': 'Hacked Name'},
            format='json'
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

        # Verify profile not updated
        set_current_tenant(tenant_b)
        profile_b.refresh_from_db()
        assert profile_b.name == 'Store B'

    def test_create_profile_assigns_current_tenant(self, authenticated_client_tenant_a, tenant_a):
        """Test creating profile assigns current tenant automatically"""
        set_current_tenant(tenant_a)

        response = authenticated_client_tenant_a.post('/api/business-hours/admin/profiles/', {
            'name': 'New Store',
            'timezone': 'America/New_York'
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED

        set_current_tenant(tenant_a)  # Re-set tenant context for ORM query
        profile = BusinessHoursProfile.objects.get(id=response.data['id'])
        assert profile.tenant == tenant_a

    def test_special_hours_isolated_by_tenant(self, api_client_factory, admin_user_tenant_a, admin_user_tenant_b, tenant_a, tenant_b):
        """Test special hours are isolated by tenant"""
        # Create separate clients for each tenant to avoid shared state
        client_a = api_client_factory(admin_user_tenant_a)
        client_b = api_client_factory(admin_user_tenant_b)

        # Create special hours for both tenants
        set_current_tenant(tenant_a)
        profile_a = BusinessHoursProfile.objects.create(tenant=tenant_a, name='Store A')
        special_a = SpecialHours.objects.create(
            tenant=tenant_a,
            profile=profile_a,
            date=date(2024, 12, 25),
            is_closed=True,
            reason='Christmas (Tenant A)'
        )

        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(tenant=tenant_b, name='Store B')
        special_b = SpecialHours.objects.create(
            tenant=tenant_b,
            profile=profile_b,
            date=date(2024, 12, 25),
            is_closed=True,
            reason='Christmas (Tenant B)'
        )

        # Tenant A sees only their special hours
        response = client_a.get('/api/business-hours/admin/special-hours/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['reason'] == 'Christmas (Tenant A)'

        # Tenant B sees only their special hours
        response = client_b.get('/api/business-hours/admin/special-hours/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['reason'] == 'Christmas (Tenant B)'


@pytest.mark.django_db
@pytest.mark.integration
class TestPermissionsAPILayer:
    """Test permission classes at API layer"""

    def test_public_endpoints_allow_unauthenticated_access(self, api_client, tenant_a):
        """Test public endpoints work without authentication"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Store',
            is_default=True
        )

        # All public endpoints should work without auth
        endpoints = [
            '/api/business-hours/status/',
            '/api/business-hours/schedule/',
            '/api/business-hours/today/',
        ]

        for endpoint in endpoints:
            response = api_client.get(endpoint)
            # Should not be 401 Unauthorized
            assert response.status_code != status.HTTP_401_UNAUTHORIZED

    def test_admin_endpoints_require_authentication(self, api_client, tenant_a):
        """Test admin endpoints require authentication"""
        set_current_tenant(tenant_a)

        # All admin endpoints should require auth
        admin_endpoints = [
            '/api/business-hours/admin/profiles/',
            '/api/business-hours/admin/regular-hours/',
            '/api/business-hours/admin/time-slots/',
            '/api/business-hours/admin/special-hours/',
            '/api/business-hours/admin/holidays/',
            '/api/business-hours/admin/summary/',
        ]

        for endpoint in admin_endpoints:
            response = api_client.get(endpoint)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_admin_summary_requires_authentication(self, api_client, tenant_a):
        """Test admin summary endpoint requires authentication"""
        set_current_tenant(tenant_a)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant_a,
            name='Store',
            is_default=True
        )

        response = api_client.get('/api/business-hours/admin/summary/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
@pytest.mark.integration
class TestComplexWorkflows:
    """Test complete workflows through API"""

    def test_complete_profile_setup_workflow(self, authenticated_client_tenant_a, tenant_a):
        """Test complete workflow: Create profile → Set hours → Add special hours"""
        set_current_tenant(tenant_a)

        # Step 1: Create profile
        response = authenticated_client_tenant_a.post('/api/business-hours/admin/profiles/', {
            'name': 'New Restaurant',
            'timezone': 'America/New_York',
            'is_default': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        profile_id = response.data['id']

        # Step 2: Get regular hours (auto-created)
        response = authenticated_client_tenant_a.get(
            f'/api/business-hours/admin/regular-hours/?profile_id={profile_id}'
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 7  # 7 days created

        monday_hours_id = response.data[0]['id']

        # Step 3: Add time slot for Monday
        response = authenticated_client_tenant_a.post('/api/business-hours/admin/time-slots/', {
            'regular_hours': monday_hours_id,
            'opening_time': '09:00:00',
            'closing_time': '17:00:00',
            'slot_type': 'regular'
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        # Step 4: Add special hours for holiday
        response = authenticated_client_tenant_a.post('/api/business-hours/admin/special-hours/', {
            'profile': profile_id,
            'date': '2024-12-25',
            'is_closed': True,
            'reason': 'Christmas'
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        # Step 5: Verify setup via public API
        response = authenticated_client_tenant_a.get('/api/business-hours/status/')
        assert response.status_code == status.HTTP_200_OK
        assert 'is_open' in response.data
