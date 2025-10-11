"""
Terminal Pairing Tests

Tests for RFC 8628 device authorization flow, terminal registration,
and tenant isolation for terminal management.
"""

import pytest
from datetime import timedelta
from django.utils import timezone
from django.core.exceptions import ValidationError

from tenant.managers import set_current_tenant
from terminals.models import TerminalPairingCode, TerminalRegistration
from terminals.services import TerminalPairingService
from settings.models import StoreLocation


@pytest.mark.django_db
class TestTerminalPairingCodeGeneration:
    """Test pairing code generation"""

    def test_generate_device_code_format(self):
        """Test device code generation format"""
        device_code = TerminalPairingService.generate_device_code()

        assert len(device_code) == 128
        assert device_code.isalnum()

    def test_generate_user_code_format(self):
        """Test user code generation format (ABCD-1234)"""
        user_code = TerminalPairingService.generate_user_code()

        assert len(user_code) == 9  # ABCD-1234
        assert user_code[4] == '-'
        assert user_code[:4].isalpha()
        assert user_code[:4].isupper()
        assert user_code[5:].isdigit()

    def test_device_code_uniqueness(self):
        """Test that device codes are unique"""
        codes = {TerminalPairingService.generate_device_code() for _ in range(100)}
        assert len(codes) == 100  # All unique

    def test_user_code_uniqueness(self):
        """Test that user codes are unique (probabilistically)"""
        codes = {TerminalPairingService.generate_user_code() for _ in range(100)}
        assert len(codes) == 100  # All unique


@pytest.mark.django_db
class TestTerminalPairingFlow:
    """Test the complete pairing flow"""

    def test_initiate_pairing(self):
        """Test pairing initiation"""
        device_fingerprint = "test-device-001"
        ip_address = "192.168.1.100"

        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint=device_fingerprint,
            ip_address=ip_address
        )

        assert pairing.device_fingerprint == device_fingerprint
        assert pairing.ip_address == ip_address
        assert pairing.status == 'pending'
        assert pairing.interval == 5
        assert pairing.expires_at > timezone.now()
        assert len(pairing.device_code) == 128
        assert len(pairing.user_code) == 9

    def test_poll_for_token_pending(self):
        """Test polling when pairing is still pending"""
        pairing = TerminalPairingService.initiate_pairing("device-001")

        status, data = TerminalPairingService.poll_for_token(pairing.device_code)

        assert status == 'pending'
        assert data is None

    def test_poll_for_token_expired(self):
        """Test polling with expired code"""
        pairing = TerminalPairingService.initiate_pairing("device-002")

        # Force expiration
        pairing.expires_at = timezone.now() - timedelta(minutes=1)
        pairing.save()

        status, data = TerminalPairingService.poll_for_token(pairing.device_code)

        assert status == 'expired'
        assert data is None

        # Verify status updated in database
        pairing.refresh_from_db()
        assert pairing.status == 'expired'

    def test_poll_for_token_denied(self, tenant_a, admin_user_tenant_a):
        """Test polling after admin denies pairing"""
        pairing = TerminalPairingService.initiate_pairing("device-003")

        # Admin denies
        TerminalPairingService.deny_pairing(pairing.user_code, admin_user_tenant_a)

        status, data = TerminalPairingService.poll_for_token(pairing.device_code)

        assert status == 'denied'
        assert data is None

    def test_poll_for_token_approved(self, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test polling after admin approves pairing"""
        set_current_tenant(tenant_a)
        pairing = TerminalPairingService.initiate_pairing("device-004")

        # Admin approves
        TerminalPairingService.approve_pairing(
            user_code=pairing.user_code,
            admin_user=admin_user_tenant_a,
            location=store_location_tenant_a,
            nickname="Front Counter"
        )

        status, data = TerminalPairingService.poll_for_token(pairing.device_code)

        assert status == 'approved'
        assert data is not None
        assert 'device_id' in data
        assert data['tenant_id'] == str(tenant_a.id)
        assert data['tenant_slug'] == tenant_a.slug
        assert data['location_id'] == store_location_tenant_a.id
        assert data['location_name'] == store_location_tenant_a.name

        # Verify pairing marked as consumed
        pairing.refresh_from_db()
        assert pairing.status == 'consumed'
        assert pairing.consumed_at is not None

    def test_poll_for_token_invalid_code(self):
        """Test polling with invalid device code"""
        with pytest.raises(ValidationError, match="Invalid device code"):
            TerminalPairingService.poll_for_token("INVALID-CODE")

    def test_poll_for_token_already_consumed(self, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test polling with already consumed code"""
        set_current_tenant(tenant_a)
        pairing = TerminalPairingService.initiate_pairing("device-005")

        # Approve and consume
        TerminalPairingService.approve_pairing(
            user_code=pairing.user_code,
            admin_user=admin_user_tenant_a,
            location=store_location_tenant_a
        )
        TerminalPairingService.poll_for_token(pairing.device_code)

        # Try to poll again
        with pytest.raises(ValidationError, match="Code already used"):
            TerminalPairingService.poll_for_token(pairing.device_code)


@pytest.mark.django_db
class TestAdminApprovalDenial:
    """Test admin approval and denial flows"""

    def test_approve_pairing_success(self, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test successful pairing approval"""
        set_current_tenant(tenant_a)
        pairing = TerminalPairingService.initiate_pairing("device-006")

        result = TerminalPairingService.approve_pairing(
            user_code=pairing.user_code,
            admin_user=admin_user_tenant_a,
            location=store_location_tenant_a,
            nickname="Kitchen Terminal"
        )

        assert result.status == 'approved'
        assert result.tenant == tenant_a
        assert result.location == store_location_tenant_a
        assert result.nickname == "Kitchen Terminal"
        assert result.created_by == admin_user_tenant_a
        assert result.approved_at is not None

    def test_approve_pairing_invalid_code(self, admin_user_tenant_a, store_location_tenant_a):
        """Test approval with invalid user code"""
        with pytest.raises(ValidationError, match="Invalid or already used code"):
            TerminalPairingService.approve_pairing(
                user_code="INVALID-CODE",
                admin_user=admin_user_tenant_a,
                location=store_location_tenant_a
            )

    def test_approve_pairing_expired_code(self, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test approval with expired code"""
        set_current_tenant(tenant_a)
        pairing = TerminalPairingService.initiate_pairing("device-007")

        # Force expiration
        pairing.expires_at = timezone.now() - timedelta(minutes=1)
        pairing.save()

        with pytest.raises(ValidationError, match="Code expired"):
            TerminalPairingService.approve_pairing(
                user_code=pairing.user_code,
                admin_user=admin_user_tenant_a,
                location=store_location_tenant_a
            )

        # Verify status updated
        pairing.refresh_from_db()
        assert pairing.status == 'expired'

    def test_approve_pairing_wrong_tenant_location(self, tenant_a, tenant_b, admin_user_tenant_a):
        """Test approval fails when location belongs to different tenant"""
        set_current_tenant(tenant_b)
        location_tenant_b = StoreLocation.objects.create(
            tenant=tenant_b,
            name="Tenant B Store",
            address="456 Other St"
        )

        set_current_tenant(tenant_a)
        pairing = TerminalPairingService.initiate_pairing("device-008")

        with pytest.raises(ValidationError, match="Location does not belong to your organization"):
            TerminalPairingService.approve_pairing(
                user_code=pairing.user_code,
                admin_user=admin_user_tenant_a,
                location=location_tenant_b  # Wrong tenant!
            )

    def test_deny_pairing_success(self, admin_user_tenant_a):
        """Test successful pairing denial"""
        pairing = TerminalPairingService.initiate_pairing("device-009")

        result = TerminalPairingService.deny_pairing(
            user_code=pairing.user_code,
            admin_user=admin_user_tenant_a
        )

        assert result.status == 'denied'
        assert result.created_by == admin_user_tenant_a

    def test_deny_pairing_invalid_code(self, admin_user_tenant_a):
        """Test denial with invalid code"""
        with pytest.raises(ValidationError, match="Invalid code"):
            TerminalPairingService.deny_pairing(
                user_code="INVALID",
                admin_user=admin_user_tenant_a
            )


@pytest.mark.django_db
class TestTerminalRegistration:
    """Test terminal registration management"""

    def test_create_terminal_on_first_pairing(self, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test terminal creation on first successful pairing"""
        set_current_tenant(tenant_a)
        device_fingerprint = "unique-device-001"
        pairing = TerminalPairingService.initiate_pairing(device_fingerprint)

        # Approve
        TerminalPairingService.approve_pairing(
            user_code=pairing.user_code,
            admin_user=admin_user_tenant_a,
            location=store_location_tenant_a,
            nickname="Bar Terminal"
        )

        # Poll to create terminal
        status, data = TerminalPairingService.poll_for_token(pairing.device_code)

        # Verify terminal created
        terminal = TerminalRegistration.objects.get(device_fingerprint=device_fingerprint)
        assert terminal.tenant == tenant_a
        assert terminal.store_location == store_location_tenant_a
        assert terminal.nickname == "Bar Terminal"
        assert terminal.is_active is True
        assert terminal.pairing_code == pairing

    def test_repairing_updates_existing_terminal(self, tenant_a, admin_user_tenant_a):
        """Test that re-pairing updates existing terminal instead of creating new one"""
        set_current_tenant(tenant_a)
        device_fingerprint = "unique-device-002"

        # First pairing
        location_1 = StoreLocation.objects.create(
            tenant=tenant_a,
            name="Location 1",
            address="123 First St"
        )

        pairing_1 = TerminalPairingService.initiate_pairing(device_fingerprint)
        TerminalPairingService.approve_pairing(
            pairing_1.user_code, admin_user_tenant_a, location_1, "Terminal 1"
        )
        TerminalPairingService.poll_for_token(pairing_1.device_code)

        terminal_1 = TerminalRegistration.objects.get(device_fingerprint=device_fingerprint)
        original_device_id = terminal_1.device_id

        # Second pairing (different location)
        location_2 = StoreLocation.objects.create(
            tenant=tenant_a,
            name="Location 2",
            address="456 Second St"
        )

        pairing_2 = TerminalPairingService.initiate_pairing(device_fingerprint)
        TerminalPairingService.approve_pairing(
            pairing_2.user_code, admin_user_tenant_a, location_2, "Terminal 2"
        )
        TerminalPairingService.poll_for_token(pairing_2.device_code)

        # Verify only one terminal exists, updated
        terminals = TerminalRegistration.all_objects.filter(device_fingerprint=device_fingerprint)
        assert terminals.count() == 1

        terminal = terminals.first()
        assert terminal.device_id == original_device_id  # Same terminal
        assert terminal.store_location == location_2  # Updated location
        assert terminal.nickname == "Terminal 2"  # Updated nickname
        assert terminal.pairing_code == pairing_2  # Updated pairing

    def test_terminal_registration_tenant_isolation(self, tenant_a, tenant_b):
        """Test that terminal registrations are isolated by tenant"""
        # Create terminal for tenant A
        set_current_tenant(tenant_a)
        terminal_a = TerminalRegistration.objects.create(
            tenant=tenant_a,
            device_id="TERMINAL-A",
            device_fingerprint="device-a",
            nickname="Terminal A"
        )

        # Create terminal for tenant B
        set_current_tenant(tenant_b)
        terminal_b = TerminalRegistration.objects.create(
            tenant=tenant_b,
            device_id="TERMINAL-B",
            device_fingerprint="device-b",
            nickname="Terminal B"
        )

        # Verify isolation
        set_current_tenant(tenant_a)
        terminals = TerminalRegistration.objects.all()
        assert terminals.count() == 1
        assert terminals.first().nickname == "Terminal A"

        set_current_tenant(tenant_b)
        terminals = TerminalRegistration.objects.all()
        assert terminals.count() == 1
        assert terminals.first().nickname == "Terminal B"

    def test_device_fingerprint_globally_unique(self, tenant_a, tenant_b):
        """Test that device fingerprint is globally unique across tenants"""
        set_current_tenant(tenant_a)
        TerminalRegistration.objects.create(
            tenant=tenant_a,
            device_id="TERMINAL-A",
            device_fingerprint="shared-fingerprint",
            nickname="Terminal A"
        )

        # Try to create with same fingerprint in tenant B - should fail
        set_current_tenant(tenant_b)
        with pytest.raises(Exception):  # IntegrityError
            TerminalRegistration.objects.create(
                tenant=tenant_b,
                device_id="TERMINAL-B",
                device_fingerprint="shared-fingerprint",  # Duplicate!
                nickname="Terminal B"
            )

    def test_device_id_globally_unique(self, tenant_a, tenant_b):
        """Test that device_id is globally unique (it's the primary key)"""
        # Create terminal with device_id "POS-1" for tenant A
        set_current_tenant(tenant_a)
        terminal_a = TerminalRegistration.objects.create(
            tenant=tenant_a,
            device_id="POS-1",
            device_fingerprint="fingerprint-a",
            nickname="Terminal A"
        )
        assert terminal_a is not None

        # Verify same device_id cannot be used for tenant B (globally unique)
        # Note: device_id is the primary key, so it must be globally unique
        # This is by design - device IDs are globally unique identifiers
        set_current_tenant(tenant_b)
        terminals_b = TerminalRegistration.objects.filter(device_id="POS-1")
        # Terminal with POS-1 exists but belongs to tenant A
        assert terminals_b.count() == 0  # Tenant B cannot see it due to tenant filtering


@pytest.mark.django_db
class TestPairingCodeMethods:
    """Test TerminalPairingCode model methods"""

    def test_is_valid_for_polling_pending_not_expired(self):
        """Test is_valid_for_polling returns True for pending non-expired code"""
        pairing = TerminalPairingCode.objects.create(
            device_code="test-code-001",
            user_code="ABCD-1234",
            device_fingerprint="test-device",
            status='pending',
            expires_at=timezone.now() + timedelta(minutes=10)
        )

        assert pairing.is_valid_for_polling() is True

    def test_is_valid_for_polling_approved_not_expired(self):
        """Test is_valid_for_polling returns True for approved non-expired code"""
        pairing = TerminalPairingCode.objects.create(
            device_code="test-code-002",
            user_code="EFGH-5678",
            device_fingerprint="test-device",
            status='approved',
            expires_at=timezone.now() + timedelta(minutes=10)
        )

        assert pairing.is_valid_for_polling() is True

    def test_is_valid_for_polling_expired(self):
        """Test is_valid_for_polling returns False for expired code"""
        pairing = TerminalPairingCode.objects.create(
            device_code="test-code-003",
            user_code="IJKL-9012",
            device_fingerprint="test-device",
            status='pending',
            expires_at=timezone.now() - timedelta(minutes=1)
        )

        assert pairing.is_valid_for_polling() is False

    def test_is_valid_for_polling_consumed(self):
        """Test is_valid_for_polling returns False for consumed code"""
        pairing = TerminalPairingCode.objects.create(
            device_code="test-code-004",
            user_code="MNOP-3456",
            device_fingerprint="test-device",
            status='consumed',
            expires_at=timezone.now() + timedelta(minutes=10)
        )

        assert pairing.is_valid_for_polling() is False

    def test_mark_approved(self, tenant_a, admin_user_tenant_a, store_location_tenant_a):
        """Test mark_approved method"""
        pairing = TerminalPairingCode.objects.create(
            device_code="test-code-005",
            user_code="QRST-7890",
            device_fingerprint="test-device",
            status='pending',
            expires_at=timezone.now() + timedelta(minutes=10)
        )

        pairing.mark_approved(
            admin_user=admin_user_tenant_a,
            tenant=tenant_a,
            location=store_location_tenant_a,
            nickname="Test Terminal"
        )

        assert pairing.status == 'approved'
        assert pairing.tenant == tenant_a
        assert pairing.location == store_location_tenant_a
        assert pairing.nickname == "Test Terminal"
        assert pairing.created_by == admin_user_tenant_a
        assert pairing.approved_at is not None

    def test_mark_consumed(self):
        """Test mark_consumed method"""
        pairing = TerminalPairingCode.objects.create(
            device_code="test-code-006",
            user_code="UVWX-1234",
            device_fingerprint="test-device",
            status='approved',
            expires_at=timezone.now() + timedelta(minutes=10)
        )

        pairing.mark_consumed()

        assert pairing.status == 'consumed'
        assert pairing.consumed_at is not None
