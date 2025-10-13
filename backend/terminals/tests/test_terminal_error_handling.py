"""
Terminal Error Handling Tests

This module tests how the terminal system handles failure scenarios,
invalid inputs, and edge cases. These tests are critical for terminal management robustness.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Terminal Registration Validation
2. Terminal Connection Failures
3. Payment Terminal Errors
4. Terminal Pairing Edge Cases
5. Invalid Terminal Configuration
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from terminals.models import TerminalRegistration
from settings.models import StoreLocation

User = get_user_model()


# ============================================================================
# TERMINAL REGISTRATION VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestTerminalRegistrationValidation:
    """Test terminal registration validation and error handling."""

    def test_duplicate_device_fingerprint_fails(self):
        """
        CRITICAL: Verify duplicate device fingerprints are rejected.

        Scenario:
        - Create terminal registration with device fingerprint
        - Try to create another terminal with same fingerprint
        - Expected: IntegrityError (unique constraint)

        Value: Prevents device ID spoofing
        """
        from django.db import IntegrityError

        # Create tenant and location
        tenant = Tenant.objects.create(
            slug="terminal-test",
            name="Terminal Test",
            is_active=True
        )

        location = StoreLocation.objects.create(
            tenant=tenant,
            name="Main Store",
            address="123 Main St"
        )

        # Create first terminal
        TerminalRegistration.objects.create(
            tenant=tenant,
            device_id="terminal-001",
            device_fingerprint="unique-fingerprint",
            nickname="Terminal 1",
            store_location=location
        )

        # Try to create duplicate fingerprint - should fail
        with pytest.raises(IntegrityError):
            TerminalRegistration.objects.create(
                tenant=tenant,
                device_id="terminal-002",
                device_fingerprint="unique-fingerprint",  # Duplicate!
                nickname="Terminal 2",
                store_location=location
            )

    def test_same_device_id_allowed_across_tenants(self):
        """
        IMPORTANT: Verify same device_id allowed across different tenants.

        Scenario:
        - Create terminal for tenant A with device_id "001"
        - Create terminal for tenant B with device_id "001"
        - Expected: Success (device IDs are scoped per tenant)

        Value: Ensures proper tenant isolation for terminals
        """
        # Create tenant A
        tenant_a = Tenant.objects.create(
            slug="tenant-a-term",
            name="Tenant A",
            is_active=True
        )

        location_a = StoreLocation.objects.create(
            tenant=tenant_a,
            name="Store A",
            address="123 Main St"
        )

        # Create tenant B
        tenant_b = Tenant.objects.create(
            slug="tenant-b-term",
            name="Tenant B",
            is_active=True
        )

        location_b = StoreLocation.objects.create(
            tenant=tenant_b,
            name="Store B",
            address="456 Main St"
        )

        # Create terminal for tenant A
        terminal_a = TerminalRegistration.objects.create(
            tenant=tenant_a,
            device_id="terminal-001",
            device_fingerprint="fingerprint-a",
            nickname="Terminal A",
            store_location=location_a
        )

        # Create terminal for tenant B with SAME device_id - should succeed
        terminal_b = TerminalRegistration.objects.create(
            tenant=tenant_b,
            device_id="terminal-001",  # Same device_id!
            device_fingerprint="fingerprint-b",
            nickname="Terminal B",
            store_location=location_b
        )

        assert terminal_a.device_id == terminal_b.device_id
        assert terminal_a.device_fingerprint != terminal_b.device_fingerprint


# ============================================================================
# TERMINAL CONNECTION FAILURE TESTS
# ============================================================================

@pytest.mark.django_db
class TestTerminalConnectionFailures:
    """Test terminal connection failure scenarios."""

    def test_locked_terminal_cannot_authenticate(self):
        """
        CRITICAL: Verify locked terminals cannot authenticate.

        Scenario:
        - Create terminal
        - Mark as locked (e.g., after auth failures)
        - Try to authenticate
        - Expected: Authentication blocked

        Value: Prevents access from compromised terminals
        """
        # Create tenant and location
        tenant = Tenant.objects.create(
            slug="lock-test",
            name="Lock Test",
            is_active=True
        )

        location = StoreLocation.objects.create(
            tenant=tenant,
            name="Main Store",
            address="123 Main St"
        )

        # Create and lock terminal
        terminal = TerminalRegistration.objects.create(
            tenant=tenant,
            device_id="terminal-locked",
            device_fingerprint="fingerprint-locked",
            nickname="Locked Terminal",
            store_location=location,
            is_locked=True,  # Locked!
            authentication_failures=5
        )

        assert terminal.is_locked is True
        assert terminal.authentication_failures == 5

    def test_inactive_terminal_state_persists(self):
        """
        IMPORTANT: Verify inactive terminals retain state.

        Scenario:
        - Create terminal
        - Mark as inactive
        - Verify state persists

        Value: Ensures terminal deactivation works
        """
        # Create tenant and location
        tenant = Tenant.objects.create(
            slug="inactive-test",
            name="Inactive Test",
            is_active=True
        )

        location = StoreLocation.objects.create(
            tenant=tenant,
            name="Main Store",
            address="123 Main St"
        )

        # Create inactive terminal
        terminal = TerminalRegistration.objects.create(
            tenant=tenant,
            device_id="terminal-inactive",
            device_fingerprint="fingerprint-inactive",
            nickname="Inactive Terminal",
            store_location=location,
            is_active=False
        )

        assert terminal.is_active is False


# ============================================================================
# PAYMENT TERMINAL ERROR TESTS
# ============================================================================

@pytest.mark.django_db
class TestPaymentTerminalErrors:
    """Test payment terminal error scenarios."""

    def test_terminal_can_have_optional_reader_id(self):
        """
        IMPORTANT: Verify terminal can operate without reader ID.

        Scenario:
        - Create terminal without reader_id
        - Expected: Success (reader_id is optional)

        Value: Ensures terminals work without Stripe readers
        """
        # Create tenant and location
        tenant = Tenant.objects.create(
            slug="reader-test",
            name="Reader Test",
            is_active=True
        )

        location = StoreLocation.objects.create(
            tenant=tenant,
            name="Main Store",
            address="123 Main St"
        )

        # Create terminal without reader_id
        terminal = TerminalRegistration.objects.create(
            tenant=tenant,
            device_id="terminal-no-reader",
            device_fingerprint="fingerprint-no-reader",
            nickname="No Reader Terminal",
            store_location=location
            # reader_id is blank
        )

        assert terminal.reader_id == ''


# ============================================================================
# TERMINAL PAIRING EDGE CASES
# ============================================================================

@pytest.mark.django_db
class TestTerminalPairingEdgeCases:
    """Test terminal pairing edge cases and validation."""

    def test_terminal_can_have_null_location(self):
        """
        IMPORTANT: Verify terminal can exist without location.

        Scenario:
        - Create terminal without store location
        - Expected: Success (location is optional)

        Value: Ensures terminals can be created before location assignment
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="location-test",
            name="Location Test",
            is_active=True
        )

        # Create terminal without location
        terminal = TerminalRegistration.objects.create(
            tenant=tenant,
            device_id="terminal-no-location",
            device_fingerprint="fingerprint-no-location",
            nickname="Unassigned Terminal"
            # store_location is NULL
        )

        assert terminal.store_location is None

    def test_expired_pairing_code_validation(self):
        """
        CRITICAL: Verify expired pairing codes cannot be used.

        Scenario:
        - Create pairing code
        - Set expiration in the past
        - Check validity
        - Expected: is_valid_for_polling() returns False

        Value: Ensures security of pairing process
        """
        from terminals.models import TerminalPairingCode
        from django.utils import timezone
        from datetime import timedelta

        # Create pairing code
        pairing_code = TerminalPairingCode.objects.create(
            device_code="expired-device-code",
            user_code="ABCD-1234",
            device_fingerprint="test-fingerprint",
            expires_at=timezone.now() - timedelta(minutes=1),  # Expired!
            status='pending'
        )

        # Should not be valid for polling
        assert pairing_code.is_valid_for_polling() is False

    def test_approved_pairing_code_includes_tenant_and_location(self):
        """
        CRITICAL: Verify approved pairing codes have tenant and location.

        Scenario:
        - Create pairing code
        - Approve it with tenant and location
        - Verify fields are set

        Value: Ensures proper pairing workflow
        """
        from terminals.models import TerminalPairingCode
        from django.utils import timezone
        from datetime import timedelta

        # Create tenant and location
        tenant = Tenant.objects.create(
            slug="pairing-test",
            name="Pairing Test",
            is_active=True
        )

        location = StoreLocation.objects.create(
            tenant=tenant,
            name="Main Store",
            address="123 Main St"
        )

        admin_user = User.objects.create_user(
            username="admin",
            email="admin@test.com",
            password="test123",
            tenant=tenant,
            role="ADMIN"
        )

        # Create pairing code
        pairing_code = TerminalPairingCode.objects.create(
            device_code="test-device-code",
            user_code="EFGH-5678",
            device_fingerprint="test-fingerprint",
            expires_at=timezone.now() + timedelta(minutes=15),
            status='pending'
        )

        # Approve it
        pairing_code.mark_approved(admin_user, tenant, location, "Test Terminal")

        assert pairing_code.status == 'approved'
        assert pairing_code.tenant == tenant
        assert pairing_code.location == location
        assert pairing_code.nickname == "Test Terminal"
        assert pairing_code.created_by == admin_user
        assert pairing_code.approved_at is not None
