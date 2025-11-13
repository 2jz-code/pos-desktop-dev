"""
API Integration Tests for Terminals App

Tests the complete request/response cycle for the RFC 8628 device authorization flow
with authentication, permissions, tenant isolation, and complex workflows.

Covers:
- Device authorization endpoint (AllowAny)
- Token polling endpoint (AllowAny)
- Admin verify, approve, deny endpoints (IsAuthenticated, Manager+)
- Pending pairings list
- TerminalRegistration CRUD
- Complete pairing workflow
- Tenant isolation for location validation
"""

import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from datetime import timedelta


# Helper function for creating CSRF-protected client
# (For AllowAny endpoints that don't need tenant context)
def create_csrf_client():
    """API client with CSRF tokens configured"""
    import secrets
    client = APIClient()

    # Set CSRF token (both csrf_token and csrftoken cookies + header)
    csrf_token = secrets.token_urlsafe(32)
    client.cookies['csrf_token'] = csrf_token
    client.cookies['csrftoken'] = csrf_token
    client.credentials(HTTP_X_CSRF_TOKEN=csrf_token)

    return client


@pytest.mark.django_db
class TestDeviceAuthorizationAPI:
    """Test device authorization endpoint (RFC 8628 step 1)"""

    def test_device_authorization_no_auth_required(self):
        """Test device authorization is AllowAny (public endpoint)"""
        client = create_csrf_client()

        response = client.post('/api/terminals/pairing/device-authorization/', {
            'client_id': 'terminal-client',
            'device_fingerprint': 'test-device-12345'
        }, format='json')

        # Debug output
        if response.status_code != status.HTTP_201_CREATED:
            print(f"\nDEBUG: Status={response.status_code}")
            print(f"DEBUG: Content={response.content.decode('utf-8')}")

        assert response.status_code == status.HTTP_201_CREATED
        assert 'device_code' in response.data
        assert 'user_code' in response.data
        assert 'verification_uri' in response.data
        assert 'expires_in' in response.data
        assert 'interval' in response.data

        # User code should be in XXXX-XXXX format
        assert '-' in response.data['user_code']
        assert len(response.data['user_code']) == 9  # ABCD-1234 format

    def test_device_authorization_creates_pending_pairing(self):
        """Test device authorization creates pending pairing code"""
        from terminals.models import TerminalPairingCode

        client = create_csrf_client()

        response = client.post('/api/terminals/pairing/device-authorization/', {
            'client_id': 'terminal-client',
            'device_fingerprint': 'test-device-67890'
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED

        # Verify pairing code created in database
        pairing = TerminalPairingCode.objects.get(device_code=response.data['device_code'])
        assert pairing.status == 'pending'
        assert pairing.device_fingerprint == 'test-device-67890'
        assert pairing.expires_at > timezone.now()

    def test_device_authorization_missing_fingerprint(self):
        """Test device authorization requires device_fingerprint"""
        client = create_csrf_client()

        response = client.post('/api/terminals/pairing/device-authorization/', {
            'client_id': 'terminal-client'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestTokenPollingAPI:
    """Test token polling endpoint (RFC 8628 step 3)"""

    def test_token_poll_pending_status(self):
        """Test polling for pending (not yet approved) pairing"""
        from terminals.services import TerminalPairingService

        client = create_csrf_client()

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-poll-device',
            ip_address='127.0.0.1'
        )

        response = client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['error'] == 'authorization_pending'

    def test_token_poll_approved_returns_terminal_info(self, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test polling after approval returns terminal information"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        client = create_csrf_client()

        set_current_tenant(tenant_a)

        # Create and approve pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-approved-device',
            ip_address='127.0.0.1'
        )

        TerminalPairingService.approve_pairing(
            user_code=pairing.user_code,
            admin_user=admin_user_tenant_a,
            location=store_location_tenant_a,
            nickname='Test Terminal'
        )

        response = client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'device_id' in response.data
        assert 'tenant_id' in response.data
        assert 'location_id' in response.data
        assert response.data['tenant_id'] == str(tenant_a.id)

    def test_token_poll_expired_code(self):
        """Test polling with expired pairing code"""
        from terminals.models import TerminalPairingCode
        from terminals.services import TerminalPairingService

        client = create_csrf_client()

        # Create pairing and manually expire it
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-expired-device',
            ip_address='127.0.0.1'
        )

        # Force expiration
        pairing.expires_at = timezone.now() - timedelta(seconds=1)
        pairing.save()

        response = client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['error'] == 'expired_token'

    def test_token_poll_denied_code(self, admin_user_tenant_a):
        """Test polling after admin denial"""
        from terminals.services import TerminalPairingService

        client = create_csrf_client()

        # Create and deny pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-denied-device',
            ip_address='127.0.0.1'
        )

        TerminalPairingService.deny_pairing(
            user_code=pairing.user_code,
            admin_user=admin_user_tenant_a
        )

        response = client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['error'] == 'access_denied'

    def test_token_poll_invalid_device_code(self):
        """Test polling with non-existent device code"""
        client = create_csrf_client()

        response = client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': 'invalid-device-code-12345',
            'client_id': 'terminal-client'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['error'] == 'invalid_request'


@pytest.mark.django_db
class TestAdminVerifyAPI:
    """Test admin verify endpoint (look up pairing by user code)"""

    def test_verify_requires_authentication(self, api_client_factory):
        """Test verify endpoint requires authentication"""
        client = api_client_factory(user=None)  # No auth

        response = client.get('/api/terminals/pairing/verify/?user_code=ABCD-1234')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_verify_valid_user_code(self, api_client_factory, tenant_a, admin_user_tenant_a):
        """Test admin can verify valid user code"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-verify-device',
            ip_address='127.0.0.1'
        )

        # Authenticate admin
        client = api_client_factory(admin_user_tenant_a)

        response = client.get(f'/api/terminals/pairing/verify/?user_code={pairing.user_code}')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['user_code'] == pairing.user_code
        assert response.data['device_fingerprint'] == 'test-verify-device'
        assert 'expires_in' in response.data

    def test_verify_invalid_user_code(self, api_client_factory, tenant_a, admin_user_tenant_a):
        """Test verify with non-existent user code returns 404"""
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        client = api_client_factory(admin_user_tenant_a)

        response = client.get('/api/terminals/pairing/verify/?user_code=INVALID-CODE')

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert 'error' in response.data

    def test_verify_expired_code_returns_404(self, api_client_factory, tenant_a, admin_user_tenant_a):
        """Test verify with expired code returns 404 and marks as expired"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pairing and expire it
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-expired-verify',
            ip_address='127.0.0.1'
        )
        pairing.expires_at = timezone.now() - timedelta(seconds=1)
        pairing.save()

        client = api_client_factory(admin_user_tenant_a)

        response = client.get(f'/api/terminals/pairing/verify/?user_code={pairing.user_code}')

        assert response.status_code == status.HTTP_404_NOT_FOUND

        # Verify status was updated to expired
        pairing.refresh_from_db()
        assert pairing.status == 'expired'


@pytest.mark.django_db
class TestAdminApproveAPI:
    """Test admin approve endpoint (RFC 8628 step 2)"""

    def test_approve_requires_authentication(self, api_client_factory):
        """Test approve endpoint requires authentication"""
        client = api_client_factory(user=None)  # No auth

        response = client.post('/api/terminals/pairing/approve/', {
            'user_code': 'ABCD-1234',
            'location_id': 1,
            'nickname': 'Test Terminal'
        }, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_approve_requires_manager_or_higher(self, api_client_factory, tenant_a, cashier_user_tenant_a, store_location_tenant_a):
        """Test approve endpoint requires Manager/Admin/Owner role"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-cashier-approve',
            ip_address='127.0.0.1'
        )

        # Authenticate as cashier
        client = api_client_factory(cashier_user_tenant_a)

        response = client.post('/api/terminals/pairing/approve/', {
            'user_code': pairing.user_code,
            'location_id': store_location_tenant_a.id,
            'nickname': 'Test Terminal'
        }, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'Insufficient permissions' in response.data['error']

    def test_approve_success_creates_terminal_registration(self, api_client_factory, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test successful approval workflow creates terminal registration after token poll"""
        from terminals.services import TerminalPairingService
        from terminals.models import TerminalRegistration
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-approve-success',
            ip_address='127.0.0.1'
        )

        # Authenticate as admin
        client = api_client_factory(admin_user_tenant_a)

        response = client.post('/api/terminals/pairing/approve/', {
            'user_code': pairing.user_code,
            'location_id': store_location_tenant_a.id,
            'nickname': 'Front Counter'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'Terminal approved' in response.data['message']
        assert response.data['location'] == store_location_tenant_a.name

        # Verify pairing is approved (TerminalRegistration created during token poll, not here)
        pairing.refresh_from_db()
        assert pairing.status == 'approved'
        assert pairing.tenant == tenant_a
        assert pairing.location == store_location_tenant_a

        # Terminal polls for token (this creates the TerminalRegistration)
        csrf_client = create_csrf_client()
        poll_response = csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert poll_response.status_code == status.HTTP_200_OK

        # Re-set tenant context (middleware resets it after each request)
        set_current_tenant(tenant_a)

        # NOW verify terminal registration was created
        assert TerminalRegistration.objects.filter(
            device_fingerprint='test-approve-success',
            tenant=tenant_a,
            store_location=store_location_tenant_a
        ).exists()

    def test_approve_validates_location_belongs_to_tenant(self, api_client_factory, tenant_a, tenant_b, admin_user_tenant_a, store_location_tenant_b):
        """Test approve validates location belongs to admin's tenant"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-cross-tenant',
            ip_address='127.0.0.1'
        )

        # Authenticate as tenant A admin
        client = api_client_factory(admin_user_tenant_a)

        # Try to approve with tenant B location
        response = client.post('/api/terminals/pairing/approve/', {
            'user_code': pairing.user_code,
            'location_id': store_location_tenant_b.id,
            'nickname': 'Test Terminal'
        }, format='json')

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert 'Location not found' in response.data['error']

    def test_approve_invalid_user_code(self, api_client_factory, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test approve with invalid user code returns 400"""
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        client = api_client_factory(admin_user_tenant_a)

        response = client.post('/api/terminals/pairing/approve/', {
            'user_code': 'INVALID-CODE',
            'location_id': store_location_tenant_a.id,
            'nickname': 'Test Terminal'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestAdminDenyAPI:
    """Test admin deny endpoint"""

    def test_deny_requires_authentication(self, api_client_factory):
        """Test deny endpoint requires authentication"""
        client = api_client_factory(user=None)  # No auth

        response = client.post('/api/terminals/pairing/deny/', {
            'user_code': 'ABCD-1234'
        }, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_deny_requires_manager_or_higher(self, api_client_factory, tenant_a, cashier_user_tenant_a):
        """Test deny endpoint requires Manager/Admin/Owner role"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-cashier-deny',
            ip_address='127.0.0.1'
        )

        # Authenticate as cashier
        client = api_client_factory(cashier_user_tenant_a)

        response = client.post('/api/terminals/pairing/deny/', {
            'user_code': pairing.user_code
        }, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'Insufficient permissions' in response.data['error']

    def test_deny_success_marks_pairing_denied(self, api_client_factory, tenant_a, admin_user_tenant_a):
        """Test successful denial marks pairing as denied"""
        from terminals.services import TerminalPairingService
        from terminals.models import TerminalPairingCode
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint='test-deny-success',
            ip_address='127.0.0.1'
        )

        # Authenticate as admin
        client = api_client_factory(admin_user_tenant_a)

        response = client.post('/api/terminals/pairing/deny/', {
            'user_code': pairing.user_code
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'denied' in response.data['message']

        # Verify status updated
        pairing.refresh_from_db()
        assert pairing.status == 'denied'

    def test_deny_invalid_user_code(self, api_client_factory, tenant_a, admin_user_tenant_a):
        """Test deny with invalid user code returns 400"""
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        client = api_client_factory(admin_user_tenant_a)

        response = client.post('/api/terminals/pairing/deny/', {
            'user_code': 'INVALID-CODE'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestPendingPairingsAPI:
    """Test pending pairings list endpoint"""

    def test_pending_pairings_requires_authentication(self, api_client_factory):
        """Test pending pairings endpoint requires authentication"""
        client = api_client_factory(user=None)  # No auth

        response = client.get('/api/terminals/pairing/pending-pairings/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pending_pairings_lists_only_pending(self, api_client_factory, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test pending pairings only returns pending (not approved/denied/expired)"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create multiple pairings with different statuses
        pending = TerminalPairingService.initiate_pairing('pending-device', '127.0.0.1')

        approved_pairing = TerminalPairingService.initiate_pairing('approved-device', '127.0.0.1')
        TerminalPairingService.approve_pairing(approved_pairing.user_code, admin_user_tenant_a, store_location_tenant_a, 'Approved')

        denied_pairing = TerminalPairingService.initiate_pairing('denied-device', '127.0.0.1')
        TerminalPairingService.deny_pairing(denied_pairing.user_code, admin_user_tenant_a)

        # Authenticate
        client = api_client_factory(admin_user_tenant_a)

        response = client.get('/api/terminals/pairing/pending-pairings/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data

        # Should only have 1 pending pairing
        user_codes = [p['user_code'] for p in response.data['results']]
        assert pending.user_code in user_codes
        assert approved_pairing.user_code not in user_codes
        assert denied_pairing.user_code not in user_codes

    def test_pending_pairings_excludes_expired(self, api_client_factory, tenant_a, admin_user_tenant_a):
        """Test pending pairings excludes expired codes"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create pending pairing
        pairing = TerminalPairingService.initiate_pairing('test-exclude-expired', '127.0.0.1')

        # Force expiration
        pairing.expires_at = timezone.now() - timedelta(seconds=1)
        pairing.save()

        # Authenticate
        client = api_client_factory(admin_user_tenant_a)

        response = client.get('/api/terminals/pairing/pending-pairings/')

        assert response.status_code == status.HTTP_200_OK

        # Expired pairing should not be in results
        user_codes = [p['user_code'] for p in response.data['results']]
        assert pairing.user_code not in user_codes


@pytest.mark.django_db
class TestTerminalRegistrationAPI:
    """Test TerminalRegistration ViewSet (manage terminal registrations)"""

    def test_list_terminal_registrations_requires_authentication(self, api_client_factory):
        """Test list terminal registrations requires authentication"""
        client = api_client_factory(user=None)  # No auth

        response = client.get('/api/terminals/registrations/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_terminal_registrations_filtered_by_tenant(self, api_client_factory, tenant_a, tenant_b, admin_user_tenant_a, admin_user_tenant_b, store_location_tenant_a, store_location_tenant_b):
        """Test terminal registrations list is tenant-filtered"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant
        import time

        csrf_client = create_csrf_client()

        # Create terminals for both tenants
        set_current_tenant(tenant_a)
        pairing_a = TerminalPairingService.initiate_pairing('tenant-a-device', '127.0.0.1')
        TerminalPairingService.approve_pairing(pairing_a.user_code, admin_user_tenant_a, store_location_tenant_a, 'Tenant A Terminal')
        # Poll to create TerminalRegistration
        csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing_a.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        # Small delay to ensure different device_id (timestamp-based)
        time.sleep(1)

        set_current_tenant(tenant_b)
        pairing_b = TerminalPairingService.initiate_pairing('tenant-b-device', '127.0.0.1')
        TerminalPairingService.approve_pairing(pairing_b.user_code, admin_user_tenant_b, store_location_tenant_b, 'Tenant B Terminal')
        # Poll to create TerminalRegistration
        csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing_b.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        # Authenticate as tenant A admin
        set_current_tenant(tenant_a)
        client = api_client_factory(admin_user_tenant_a)

        response = client.get('/api/terminals/registrations/')

        assert response.status_code == status.HTTP_200_OK

        # Should only see tenant A terminal
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['device_fingerprint'] == 'tenant-a-device'

    def test_get_terminal_registration_by_device_id(self, api_client_factory, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test get terminal registration using device_id as lookup field"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create terminal
        pairing = TerminalPairingService.initiate_pairing('test-lookup-device', '127.0.0.1')
        TerminalPairingService.approve_pairing(pairing.user_code, admin_user_tenant_a, store_location_tenant_a, 'Lookup Terminal')

        # Poll to create TerminalRegistration
        csrf_client = create_csrf_client()
        poll_response = csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert poll_response.status_code == status.HTTP_200_OK
        device_id = poll_response.data['device_id']

        # Authenticate
        client = api_client_factory(admin_user_tenant_a)

        # Lookup by device_id (not pk)
        response = client.get(f'/api/terminals/registrations/{device_id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['device_id'] == device_id
        assert response.data['device_fingerprint'] == 'test-lookup-device'

    def test_update_terminal_registration_nickname(self, api_client_factory, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test partial update of terminal registration (nickname)"""
        from terminals.services import TerminalPairingService
        from terminals.models import TerminalRegistration
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Create terminal
        pairing = TerminalPairingService.initiate_pairing('test-update-device', '127.0.0.1')
        TerminalPairingService.approve_pairing(pairing.user_code, admin_user_tenant_a, store_location_tenant_a, 'Original Nickname')

        # Poll to create TerminalRegistration
        csrf_client = create_csrf_client()
        poll_response = csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert poll_response.status_code == status.HTTP_200_OK
        device_id = poll_response.data['device_id']

        # Authenticate
        client = api_client_factory(admin_user_tenant_a)

        # Update nickname
        response = client.patch(f'/api/terminals/registrations/{device_id}/', {
            'nickname': 'Updated Nickname'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['nickname'] == 'Updated Nickname'

        # Re-set tenant context before querying
        set_current_tenant(tenant_a)

        # Verify in database
        terminal = TerminalRegistration.objects.get(device_id=device_id)
        assert terminal.nickname == 'Updated Nickname'

    def test_terminal_registration_cross_tenant_access_denied(self, api_client_factory, tenant_a, tenant_b, admin_user_tenant_a, admin_user_tenant_b, store_location_tenant_b):
        """Test cannot access terminal registration from another tenant"""
        from terminals.services import TerminalPairingService
        from tenant.managers import set_current_tenant

        # Create terminal for tenant B
        set_current_tenant(tenant_b)
        pairing_b = TerminalPairingService.initiate_pairing('tenant-b-cross-test', '127.0.0.1')
        TerminalPairingService.approve_pairing(pairing_b.user_code, admin_user_tenant_b, store_location_tenant_b, 'Tenant B Terminal')

        # Poll to create TerminalRegistration
        csrf_client = create_csrf_client()
        poll_response = csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': pairing_b.device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert poll_response.status_code == status.HTTP_200_OK
        device_id_b = poll_response.data['device_id']

        # Authenticate as tenant A admin
        set_current_tenant(tenant_a)
        client = api_client_factory(admin_user_tenant_a)

        # Try to access tenant B terminal
        response = client.get(f'/api/terminals/registrations/{device_id_b}/')

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestCompletePairingWorkflow:
    """Test complete pairing workflow from start to finish"""

    def test_complete_pairing_workflow(self, api_client_factory, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test complete RFC 8628 flow: device auth → admin approve → token poll"""
        from terminals.models import TerminalRegistration
        from tenant.managers import set_current_tenant

        set_current_tenant(tenant_a)

        # Step 1: Device requests authorization (AllowAny - no auth needed)
        csrf_client = create_csrf_client()

        auth_response = csrf_client.post('/api/terminals/pairing/device-authorization/', {
            'client_id': 'terminal-client',
            'device_fingerprint': 'workflow-test-device'
        }, format='json')

        assert auth_response.status_code == status.HTTP_201_CREATED
        device_code = auth_response.data['device_code']
        user_code = auth_response.data['user_code']

        # Step 2: Terminal polls for token (should be pending)
        poll_response_1 = csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert poll_response_1.status_code == status.HTTP_400_BAD_REQUEST
        assert poll_response_1.data['error'] == 'authorization_pending'

        # Step 3: Admin approves pairing
        admin_client = api_client_factory(admin_user_tenant_a)

        approve_response = admin_client.post('/api/terminals/pairing/approve/', {
            'user_code': user_code,
            'location_id': store_location_tenant_a.id,
            'nickname': 'Workflow Test Terminal'
        }, format='json')

        assert approve_response.status_code == status.HTTP_200_OK

        # Step 4: Terminal polls again (should be approved now)
        poll_response_2 = csrf_client.post('/api/terminals/pairing/token/', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': device_code,
            'client_id': 'terminal-client'
        }, format='json')

        assert poll_response_2.status_code == status.HTTP_200_OK
        assert 'device_id' in poll_response_2.data
        assert 'tenant_id' in poll_response_2.data
        assert poll_response_2.data['tenant_id'] == str(tenant_a.id)

        # Re-set tenant context before querying
        set_current_tenant(tenant_a)

        # Step 5: Verify terminal registration created
        terminal = TerminalRegistration.objects.get(device_fingerprint='workflow-test-device')
        assert terminal.tenant == tenant_a
        assert terminal.store_location == store_location_tenant_a
        assert terminal.nickname == 'Workflow Test Terminal'
        assert terminal.device_id == poll_response_2.data['device_id']
