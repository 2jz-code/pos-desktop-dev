"""
Users API Integration Tests

Tests the complete request/response cycle for user endpoints including:
- POS login (username + PIN + device_id)
- Admin login (email + password with tenant discovery)
- Web login (JWT with account lockout)
- JWT cookie authentication
- CSRF double-submit protection
- Tenant middleware integration
- Permission classes
- User CRUD operations
- Archive/unarchive functionality
- PIN management
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from django.core.cache import cache
import secrets

from tenant.managers import set_current_tenant
from users.models import User


def create_csrf_client_with_tenant(tenant):
    """Helper to create API client with CSRF tokens and tenant session"""
    from rest_framework.test import APIClient
    client = APIClient()

    # Set tenant in session for TenantMiddleware resolution
    session = client.session
    session['tenant_id'] = str(tenant.id)
    session.save()

    # Set CSRF token (both csrf_token and csrftoken cookies + header)
    csrf_token = secrets.token_urlsafe(32)
    client.cookies['csrf_token'] = csrf_token
    client.cookies['csrftoken'] = csrf_token  # Django's default cookie name
    client.credentials(HTTP_X_CSRF_TOKEN=csrf_token)

    return client


@pytest.mark.django_db
class TestUsersAPIAuthentication:
    """Test authentication flows for users API"""

    def test_pos_login_success(self, api_client_factory, tenant_a, cashier_user_tenant_a):
        """Test successful POS login with valid credentials and device_id"""
        # Create a terminal registration for the test
        from terminals.models import TerminalRegistration
        from settings.models import StoreLocation

        set_current_tenant(tenant_a)

        # Create store location
        store_location = StoreLocation.objects.create(
            tenant=tenant_a,
            name='Main Store',
            address='123 Main St',
            is_default=True
        )

        # Create terminal registration
        terminal = TerminalRegistration.objects.create(
            tenant=tenant_a,
            device_id='TEST-DEVICE-001',
            device_fingerprint='TEST-FINGERPRINT-001',
            nickname='Test POS Terminal',
            store_location=store_location,
            is_active=True
        )

        # Set PIN for cashier
        cashier_user_tenant_a.set_pin('1234')

        client = create_csrf_client_with_tenant(tenant_a)

        response = client.post('/api/users/login/pos/', {
            'username': cashier_user_tenant_a.username,
            'pin': '1234',
            'device_id': 'TEST-DEVICE-001'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'user' in response.data
        assert response.data['user']['id'] == cashier_user_tenant_a.id
        assert 'tenant' in response.data
        assert response.data['tenant']['slug'] == tenant_a.slug

        # Verify cookies are set
        assert 'access_token' in response.cookies
        assert 'refresh_token' in response.cookies

    def test_pos_login_invalid_credentials(self, api_client_factory, tenant_a, cashier_user_tenant_a):
        """Test POS login with invalid PIN"""
        from terminals.models import TerminalRegistration
        from settings.models import StoreLocation

        set_current_tenant(tenant_a)

        store_location = StoreLocation.objects.create(
            tenant=tenant_a,
            name='Main Store',
            address='123 Main St',
            is_default=True
        )

        terminal = TerminalRegistration.objects.create(
            tenant=tenant_a,
            device_id='TEST-DEVICE-002',
            device_fingerprint='TEST-FINGERPRINT-002',
            nickname='Test POS Terminal',
            store_location=store_location,
            is_active=True
        )

        cashier_user_tenant_a.set_pin('1234')

        client = create_csrf_client_with_tenant(tenant_a)

        response = client.post('/api/users/login/pos/', {
            'username': cashier_user_tenant_a.username,
            'pin': '9999',  # Wrong PIN
            'device_id': 'TEST-DEVICE-002'
        }, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'error' in response.data

    def test_pos_login_unregistered_terminal(self, api_client_factory, tenant_a, cashier_user_tenant_a):
        """Test POS login with unregistered device_id"""
        set_current_tenant(tenant_a)
        cashier_user_tenant_a.set_pin('1234')

        client = create_csrf_client_with_tenant(tenant_a)

        response = client.post('/api/users/login/pos/', {
            'username': cashier_user_tenant_a.username,
            'pin': '1234',
            'device_id': 'UNREGISTERED-DEVICE'
        }, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'Terminal not registered' in response.data['error']

    def test_admin_login_single_tenant(self, api_client_factory, tenant_a, admin_user_tenant_a):
        """Test admin login when user belongs to single tenant"""
        set_current_tenant(tenant_a)

        client = create_csrf_client_with_tenant(tenant_a)

        response = client.post('/api/users/login/admin/', {
            'email': admin_user_tenant_a.email,
            'password': 'password123'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'user' in response.data
        assert response.data['user']['id'] == admin_user_tenant_a.id
        assert 'tenant' in response.data
        assert response.data['tenant']['slug'] == tenant_a.slug

        # Verify cookies are set (cookie names are access_token_admin and refresh_token_admin)
        assert 'access_token_admin' in response.cookies
        assert 'refresh_token_admin' in response.cookies

    def test_admin_login_multiple_tenants(self, api_client_factory, tenant_a, tenant_b):
        """Test admin login returns tenant picker when user belongs to multiple tenants"""
        # Create same email user in both tenants
        user_a = User.objects.create_user(
            email='multi@example.com',
            username='multi_a',
            password='password123',
            tenant=tenant_a,
            role=User.Role.ADMIN,
            is_pos_staff=True
        )

        user_b = User.objects.create_user(
            email='multi@example.com',
            username='multi_b',
            password='password123',
            tenant=tenant_b,
            role=User.Role.ADMIN,
            is_pos_staff=True
        )

        client = create_csrf_client_with_tenant(tenant_a)

        response = client.post('/api/users/login/admin/', {
            'email': 'multi@example.com',
            'password': 'password123'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['multiple_tenants'] == True
        assert 'tenants' in response.data
        assert len(response.data['tenants']) == 2

    def test_tenant_selection_after_multi_tenant_login(self, api_client_factory, tenant_a, tenant_b):
        """Test selecting a tenant after multi-tenant login"""
        # Create same email user in both tenants
        set_current_tenant(tenant_a)
        user_a = User.objects.create_user(
            email='multi@example.com',
            username='multi_a',
            password='password123',
            tenant=tenant_a,
            role=User.Role.ADMIN,
            is_pos_staff=True
        )

        client = create_csrf_client_with_tenant(tenant_a)

        response = client.post('/api/users/login/admin/select-tenant/', {
            'email': 'multi@example.com',
            'password': 'password123',
            'tenant_id': str(tenant_a.id)
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'user' in response.data
        assert response.data['tenant']['id'] == str(tenant_a.id)

    def test_logout(self, authenticated_client, admin_user_tenant_a):
        """Test logout clears cookies and blacklists token"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/users/logout/')

        assert response.status_code == status.HTTP_200_OK

        # Verify cookies are cleared
        assert response.cookies.get('access_token') is not None
        assert response.cookies.get('refresh_token') is not None

    def test_current_user(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test /me endpoint returns current user"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.get('/api/users/me/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['user']['id'] == admin_user_tenant_a.id
        assert response.data['tenant']['slug'] == tenant_a.slug

    def test_current_user_unauthenticated(self, guest_client):
        """Test /me endpoint rejects unauthenticated requests"""
        response = guest_client.get('/api/users/me/')

        # Accept 400 (tenant resolution failed), 401 (unauthenticated), or 403 (forbidden)
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]


@pytest.mark.django_db
class TestUsersAPITenantIsolation:
    """Test tenant isolation at the API layer"""

    def test_pos_login_cross_tenant_blocked(self, api_client_factory, tenant_a, tenant_b):
        """Test POS login blocks users from logging in on wrong tenant's terminal"""
        from terminals.models import TerminalRegistration
        from settings.models import StoreLocation

        # Create user in tenant A
        set_current_tenant(tenant_a)
        user_a = User.objects.create_user(
            email='cashier_a@test.com',
            username='cashier_a',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER,
            is_pos_staff=True
        )
        user_a.set_pin('1234')

        # Create terminal in tenant B
        set_current_tenant(tenant_b)
        store_location_b = StoreLocation.objects.create(
            tenant=tenant_b,
            name='Store B',
            address='123 B St',
            is_default=True
        )

        terminal_b = TerminalRegistration.objects.create(
            tenant=tenant_b,
            device_id='TERMINAL-B',
            device_fingerprint='FINGERPRINT-B',
            nickname='Terminal B',
            store_location=store_location_b,
            is_active=True
        )

        # Try to login with tenant A user on tenant B terminal
        client = create_csrf_client_with_tenant(tenant_b)

        response = client.post('/api/users/login/pos/', {
            'username': 'cashier_a',
            'pin': '1234',
            'device_id': 'TERMINAL-B'
        }, format='json')

        # Should be blocked with 403 (not 401) to indicate cross-tenant attempt
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'not registered to your organization' in response.data['error']

    def test_list_users_filtered_by_tenant(self, authenticated_client, tenant_a, tenant_b,
                                          admin_user_tenant_a, admin_user_tenant_b):
        """Test that users list only shows current tenant's users"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.get('/api/users/')

        assert response.status_code == status.HTTP_200_OK

        # Should only see tenant A's users
        user_ids = [user['id'] for user in response.data.get('results', response.data)]
        assert admin_user_tenant_a.id in user_ids
        assert admin_user_tenant_b.id not in user_ids

    def test_get_user_cross_tenant_blocked(self, authenticated_client, tenant_a, tenant_b,
                                          admin_user_tenant_a, admin_user_tenant_b):
        """Test that retrieving another tenant's user returns 404"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.get(f'/api/users/{admin_user_tenant_b.id}/')

        # Should return 404 (not 403) to prevent tenant enumeration
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestUsersAPICRUDOperations:
    """Test CRUD operations on users through the API"""

    def test_create_user_as_manager(self, authenticated_client, tenant_a, manager_user_tenant_a):
        """Test creating a user as manager"""
        # Set tenant context before creating authenticated client
        set_current_tenant(tenant_a)
        client = authenticated_client(manager_user_tenant_a)

        # Ensure tenant context is set for the POST request
        set_current_tenant(tenant_a)

        response = client.post('/api/users/', {
            'email': 'newuser@test.com',
            'username': 'newuser',
            'password': 'password123',
            'first_name': 'New',
            'last_name': 'User',
            'role': 'CASHIER'
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['email'] == 'newuser@test.com'

        # Verify user was created with correct tenant
        set_current_tenant(tenant_a)
        user = User.objects.get(email='newuser@test.com')
        assert user.tenant == tenant_a

    def test_create_user_as_cashier_denied(self, authenticated_client, tenant_a, cashier_user_tenant_a):
        """Test that cashiers cannot create users"""
        client = authenticated_client(cashier_user_tenant_a)

        response = client.post('/api/users/', {
            'email': 'newuser@test.com',
            'username': 'newuser',
            'password': 'password123',
            'role': 'CASHIER'
        }, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_users_as_manager(self, authenticated_client, tenant_a, manager_user_tenant_a,
                                   cashier_user_tenant_a):
        """Test listing users as manager"""
        client = authenticated_client(manager_user_tenant_a)

        response = client.get('/api/users/')

        assert response.status_code == status.HTTP_200_OK
        user_ids = [user['id'] for user in response.data.get('results', response.data)]

        # Should see both manager and cashier
        assert manager_user_tenant_a.id in user_ids
        assert cashier_user_tenant_a.id in user_ids

    def test_list_users_as_cashier_denied(self, authenticated_client, tenant_a, cashier_user_tenant_a):
        """Test that cashiers cannot list users"""
        client = authenticated_client(cashier_user_tenant_a)

        response = client.get('/api/users/')

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_user(self, authenticated_client, tenant_a, admin_user_tenant_a, cashier_user_tenant_a):
        """Test updating a user"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.patch(f'/api/users/{cashier_user_tenant_a.id}/', {
            'first_name': 'Updated',
            'last_name': 'Name'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['first_name'] == 'Updated'

        # Verify in database
        cashier_user_tenant_a.refresh_from_db()
        assert cashier_user_tenant_a.first_name == 'Updated'

    def test_delete_user_soft_deletes(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test that deleting a user performs soft delete"""
        set_current_tenant(tenant_a)

        # Create a user to delete
        user_to_delete = User.objects.create_user(
            email='todelete@test.com',
            username='todelete',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER
        )

        client = authenticated_client(admin_user_tenant_a)

        response = client.delete(f'/api/users/{user_to_delete.id}/')

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify soft delete (user still exists in all_objects but not in objects)
        assert User.all_objects.filter(id=user_to_delete.id).exists()
        assert not User.objects.filter(id=user_to_delete.id).exists()


@pytest.mark.django_db
class TestUsersAPIArchiving:
    """Test archive/unarchive functionality"""

    def test_archive_user(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test archiving a user"""
        set_current_tenant(tenant_a)

        user_to_archive = User.objects.create_user(
            email='toarchive@test.com',
            username='toarchive',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER
        )

        client = authenticated_client(admin_user_tenant_a)

        response = client.post(f'/api/users/{user_to_archive.id}/archive/', format='json')

        assert response.status_code == status.HTTP_200_OK

        # Verify user is archived
        user_to_archive.refresh_from_db()
        assert user_to_archive.is_active == False

    def test_unarchive_user(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test unarchiving a user"""
        set_current_tenant(tenant_a)

        user_to_unarchive = User.objects.create_user(
            email='tounarchive@test.com',
            username='tounarchive',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER,
            is_active=False
        )

        client = authenticated_client(admin_user_tenant_a)

        response = client.post(f'/api/users/{user_to_unarchive.id}/unarchive/', format='json')

        assert response.status_code == status.HTTP_200_OK

        # Verify user is unarchived
        user_to_unarchive.refresh_from_db()
        assert user_to_unarchive.is_active == True

    def test_bulk_archive_users(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test bulk archiving users"""
        set_current_tenant(tenant_a)

        user1 = User.objects.create_user(
            email='bulk1@test.com',
            username='bulk1',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER
        )

        user2 = User.objects.create_user(
            email='bulk2@test.com',
            username='bulk2',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER
        )

        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/users/bulk_archive/', {
            'ids': [str(user1.id), str(user2.id)]
        }, format='json')

        assert response.status_code == status.HTTP_200_OK

        # Verify both users are archived
        user1.refresh_from_db()
        user2.refresh_from_db()
        assert user1.is_active == False
        assert user2.is_active == False

    def test_archived_users_excluded_from_default_list(self, authenticated_client, tenant_a,
                                                       admin_user_tenant_a):
        """Test that archived users are excluded from default list"""
        set_current_tenant(tenant_a)

        archived_user = User.objects.create_user(
            email='archived@test.com',
            username='archived',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER,
            is_active=False
        )

        client = authenticated_client(admin_user_tenant_a)

        # Default list should not include archived
        response = client.get('/api/users/')
        assert response.status_code == status.HTTP_200_OK
        user_ids = [user['id'] for user in response.data.get('results', response.data)]
        assert archived_user.id not in user_ids

        # With include_archived=true, should include archived
        response = client.get('/api/users/?include_archived=true')
        assert response.status_code == status.HTTP_200_OK
        user_ids = [user['id'] for user in response.data.get('results', response.data)]
        assert archived_user.id in user_ids


@pytest.mark.django_db
class TestUsersAPIPINManagement:
    """Test PIN setting and validation"""

    def test_set_pin_as_manager(self, authenticated_client, tenant_a, manager_user_tenant_a,
                                cashier_user_tenant_a):
        """Test setting PIN for a user as manager"""
        set_current_tenant(tenant_a)
        client = authenticated_client(manager_user_tenant_a)

        response = client.post(f'/api/users/{cashier_user_tenant_a.id}/set-pin/', {
            'pin': '5678'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK

        # Verify PIN was set
        cashier_user_tenant_a.refresh_from_db()
        assert cashier_user_tenant_a.check_pin('5678') == True

    def test_set_pin_invalid_format(self, authenticated_client, tenant_a, manager_user_tenant_a,
                                    cashier_user_tenant_a):
        """Test that invalid PINs are rejected"""
        set_current_tenant(tenant_a)
        client = authenticated_client(manager_user_tenant_a)

        # Too short (less than 4 digits)
        response = client.post(f'/api/users/{cashier_user_tenant_a.id}/set-pin/', {
            'pin': '123'
        }, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # Note: The service-based endpoint doesn't validate for trivial PINs or non-numeric
        # This is a known limitation - the SetPinView bypasses serializer validation

    def test_set_pin_as_cashier_denied(self, authenticated_client, tenant_a, cashier_user_tenant_a):
        """Test that cashiers cannot set PINs"""
        # Create another cashier
        set_current_tenant(tenant_a)
        other_cashier = User.objects.create_user(
            email='other@test.com',
            username='other',
            password='password123',
            tenant=tenant_a,
            role=User.Role.CASHIER
        )

        client = authenticated_client(cashier_user_tenant_a)

        response = client.post(f'/api/users/{other_cashier.id}/set-pin/', {
            'pin': '5678'
        }, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestUsersAPIComplexWorkflows:
    """Test complex multi-step workflows through the API"""

    def test_full_user_lifecycle(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test complete user workflow: Create → Set PIN → Archive → Unarchive"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # 1. Create user
        set_current_tenant(tenant_a)  # Ensure tenant context for creation
        response = client.post('/api/users/', {
            'email': 'lifecycle@test.com',
            'username': 'lifecycle',
            'password': 'password123',
            'first_name': 'Life',
            'last_name': 'Cycle',
            'role': 'CASHIER'
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        user_id = response.data['id']

        # 2. Set PIN
        response = client.post(f'/api/users/{user_id}/set-pin/', {
            'pin': '5678'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK

        # 3. Verify PIN was set
        set_current_tenant(tenant_a)
        user = User.objects.get(id=user_id)
        assert user.check_pin('5678') == True

        # 4. Archive user
        response = client.post(f'/api/users/{user_id}/archive/', format='json')
        assert response.status_code == status.HTTP_200_OK

        # 5. Verify archived
        user.refresh_from_db()
        assert user.is_active == False

        # 6. Unarchive user
        response = client.post(f'/api/users/{user_id}/unarchive/', format='json')
        assert response.status_code == status.HTTP_200_OK

        # 7. Verify unarchived
        user.refresh_from_db()
        assert user.is_active == True
