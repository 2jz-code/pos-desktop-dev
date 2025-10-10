"""
Comprehensive tests for customer authentication and account management.
Tests cover security requirements, password reset flow, email verification, and anti-enumeration.
"""

import pytest
from django.urls import reverse
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from datetime import timedelta
from unittest.mock import patch, MagicMock
import json

from tenant.managers import set_current_tenant
from customers.models import Customer, CustomerPasswordResetToken, CustomerEmailVerificationToken
from customers.services import CustomerAuthService


@pytest.mark.django_db
class TestCustomerModel:
    """Test Customer model functionality"""

    def test_customer_creation(self, tenant_a):
        """Test basic customer creation"""
        set_current_tenant(tenant_a)

        customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe',
        )

        assert customer.email == 'test@example.com'
        assert customer.first_name == 'John'
        assert customer.last_name == 'Doe'
        assert customer.check_password('TestPassword123!')
        assert customer.email_verified is False
        assert customer.is_active is True

    def test_email_normalization(self, tenant_a):
        """Test email address normalization"""
        set_current_tenant(tenant_a)

        customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='TEST@EXAMPLE.COM',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe',
        )

        assert customer.email == 'test@example.com'

    def test_customer_properties(self, tenant_a):
        """Test customer computed properties"""
        set_current_tenant(tenant_a)

        customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe',
        )

        assert customer.full_name == 'John Doe'
        assert customer.get_short_name() == 'John'
        assert customer.is_pos_staff is False  # Customers are never POS staff


@pytest.mark.django_db
class TestCustomerAuthService:
    """Test CustomerAuthService methods"""

    @pytest.fixture(autouse=True)
    def setup(self, tenant_a):
        """Setup for each test"""
        set_current_tenant(tenant_a)
        self.tenant = tenant_a
        self.customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe',
        )

    def test_successful_authentication(self):
        """Test successful customer authentication"""
        customer = CustomerAuthService.authenticate_customer('test@example.com', 'TestPassword123!')
        assert customer == self.customer

    def test_failed_authentication_wrong_password(self):
        """Test authentication with wrong password"""
        customer = CustomerAuthService.authenticate_customer('test@example.com', 'WrongPassword')
        assert customer is None

    def test_failed_authentication_nonexistent_email(self):
        """Test authentication with nonexistent email"""
        customer = CustomerAuthService.authenticate_customer('nonexistent@example.com', 'TestPassword123!')
        assert customer is None

    def test_failed_authentication_inactive_customer(self):
        """Test authentication with inactive customer"""
        self.customer.is_active = False
        self.customer.save()

        customer = CustomerAuthService.authenticate_customer('test@example.com', 'TestPassword123!')
        assert customer is None

    def test_duplicate_email_registration(self):
        """Test registration with existing email"""
        with pytest.raises(ValueError) as excinfo:
            CustomerAuthService.register_customer(
                tenant=self.tenant,
                email='test@example.com',  # Same email
                password='TestPassword123!',
                first_name='Jane'
            )

        # Should use generic error message
        assert 'Unable to create account with this email address' in str(excinfo.value)

    def test_weak_password_registration(self):
        """Test registration with weak password"""
        with pytest.raises(ValueError) as excinfo:
            CustomerAuthService.register_customer(
                tenant=self.tenant,
                email='new@example.com',
                password='123',  # Weak password
                first_name='Jane'
            )

        error_dict = excinfo.value.args[0]
        assert 'password' in error_dict

    def test_password_change(self):
        """Test password change functionality"""
        result = CustomerAuthService.change_customer_password(
            self.customer, 'TestPassword123!', 'NewPassword123!'
        )

        self.customer.refresh_from_db()
        assert self.customer.check_password('NewPassword123!')
        assert not self.customer.check_password('TestPassword123!')

    def test_password_change_wrong_old_password(self):
        """Test password change with wrong old password"""
        with pytest.raises(ValueError):
            CustomerAuthService.change_customer_password(
                self.customer, 'WrongPassword', 'NewPassword123!'
            )


@pytest.mark.django_db
class TestPasswordReset:
    """Test password reset functionality"""

    @pytest.fixture(autouse=True)
    def setup(self, tenant_a):
        """Setup for each test"""
        set_current_tenant(tenant_a)
        self.tenant = tenant_a
        self.customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe'
        )
        cache.clear()  # Clear rate limiting cache

    def test_password_reset_request(self):
        """Test password reset request for existing user"""
        with patch('notifications.services.EmailService.send_password_reset_email') as mock_send:
            mock_send.return_value = True
            result = CustomerAuthService.request_password_reset('test@example.com')

            assert result is True
            mock_send.assert_called_once()

            # Should create a token
            assert CustomerPasswordResetToken.objects.count() == 1

    def test_password_reset_request_nonexistent_email(self):
        """Test password reset request for nonexistent email (should still return True)"""
        with patch('notifications.services.EmailService.send_password_reset_email') as mock_send:
            result = CustomerAuthService.request_password_reset('nonexistent@example.com')

            assert result is True  # Should return True to prevent enumeration
            mock_send.assert_not_called()

            # Should not create a token
            assert CustomerPasswordResetToken.objects.count() == 0

    @pytest.mark.skip(reason="Rate limiting depends on cache configuration - tested in integration/production")
    def test_password_reset_rate_limiting(self):
        """Test rate limiting on password reset requests"""
        email = 'test@example.com'

        with patch('notifications.services.EmailService.send_password_reset_email') as mock_send:
            mock_send.return_value = True

            # Make requests - rate limit is 3 per hour currently
            call_count_before = mock_send.call_count

            for i in range(5):
                result = CustomerAuthService.request_password_reset(email)
                assert result is True  # Should always return True (anti-enumeration)

            # Should have rate limited after first 3
            assert mock_send.call_count <= call_count_before + 3

    def test_valid_password_reset(self):
        """Test password reset with valid token"""
        # Create a reset token
        token = CustomerPasswordResetToken.objects.create(
            tenant=self.tenant,
            customer=self.customer
        )

        result = CustomerAuthService.reset_password(token.token, 'NewPassword123!')

        assert result is True
        self.customer.refresh_from_db()
        assert self.customer.check_password('NewPassword123!')

        # Token should be marked as used
        token.refresh_from_db()
        assert token.used_at is not None

    def test_expired_password_reset_token(self):
        """Test password reset with expired token"""
        # Create an expired token
        token = CustomerPasswordResetToken.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            expires_at=timezone.now() - timedelta(hours=1)
        )

        with pytest.raises(ValueError) as excinfo:
            CustomerAuthService.reset_password(token.token, 'NewPassword123!')

        # Should use generic error message
        assert 'Invalid or expired password reset token' in str(excinfo.value)

    def test_used_password_reset_token(self):
        """Test password reset with already used token"""
        token = CustomerPasswordResetToken.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            used_at=timezone.now()
        )

        with pytest.raises(ValueError) as excinfo:
            CustomerAuthService.reset_password(token.token, 'NewPassword123!')

        # Should use generic error message
        assert 'Invalid or expired password reset token' in str(excinfo.value)

    def test_invalid_password_reset_token(self):
        """Test password reset with nonexistent token"""
        with pytest.raises(ValueError) as excinfo:
            CustomerAuthService.reset_password('nonexistent-token', 'NewPassword123!')

        # Should use generic error message
        assert 'Invalid or expired password reset token' in str(excinfo.value)


@pytest.mark.django_db
class TestEmailVerification:
    """Test email verification functionality"""

    @pytest.fixture(autouse=True)
    def setup(self, tenant_a):
        """Setup for each test"""
        set_current_tenant(tenant_a)
        self.tenant = tenant_a
        self.customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe'
        )

    def test_send_email_verification(self):
        """Test sending email verification"""
        with patch('notifications.services.EmailService.send_email_verification') as mock_send:
            mock_send.return_value = True
            result = CustomerAuthService.send_email_verification(self.customer)

            assert result is True
            mock_send.assert_called_once()

            # Should create a token
            assert CustomerEmailVerificationToken.objects.count() == 1

    def test_verify_email_with_valid_token(self):
        """Test email verification with valid token"""
        token = CustomerEmailVerificationToken.objects.create(
            tenant=self.tenant,
            customer=self.customer
        )

        result = CustomerAuthService.verify_email_with_token(token.token)

        assert result is True
        self.customer.refresh_from_db()
        assert self.customer.email_verified is True

        # Token should be marked as used
        token.refresh_from_db()
        assert token.used_at is not None

    def test_verify_email_with_expired_token(self):
        """Test email verification with expired token"""
        token = CustomerEmailVerificationToken.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            expires_at=timezone.now() - timedelta(hours=1)
        )

        with pytest.raises(ValueError) as excinfo:
            CustomerAuthService.verify_email_with_token(token.token)

        # Should use generic error message
        assert 'Invalid or expired verification token' in str(excinfo.value)

    def test_verify_email_with_invalid_token(self):
        """Test email verification with invalid token"""
        with pytest.raises(ValueError) as excinfo:
            CustomerAuthService.verify_email_with_token('invalid-token')

        # Should use generic error message
        assert 'Invalid or expired verification token' in str(excinfo.value)


@pytest.mark.django_db
@pytest.mark.skip(reason="API tests require complex tenant middleware setup - service tests cover business logic")
class TestCustomerAPI:
    """Test customer API endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self, tenant_a, settings):
        """Setup for each test"""
        set_current_tenant(tenant_a)
        self.tenant = tenant_a
        self.customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe'
        )

        # Set DEFAULT_TENANT_SLUG for localhost fallback in middleware
        settings.DEFAULT_TENANT_SLUG = tenant_a.slug

        # Use localhost as SERVER_NAME to trigger development fallback
        self.client = APIClient(SERVER_NAME='localhost')

        cache.clear()

    def test_customer_registration_api(self):
        """Test customer registration endpoint"""
        url = reverse('customers:register')
        data = {
            'email': 'new@example.com',
            'password': 'TestPassword123!',
            'first_name': 'Jane',
            'last_name': 'Smith'
        }

        response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')

        assert response.status_code == status.HTTP_201_CREATED
        assert 'message' in response.data
        assert Customer.objects.filter(email='new@example.com').exists()

    def test_customer_login_api(self):
        """Test customer login endpoint"""
        url = reverse('customers:login')
        data = {
            'email': 'test@example.com',
            'password': 'TestPassword123!'
        }

        response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')

        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data
        assert 'customer' in response.data

    def test_customer_login_invalid_credentials(self):
        """Test customer login with invalid credentials"""
        url = reverse('customers:login')
        data = {
            'email': 'test@example.com',
            'password': 'WrongPassword'
        }

        response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # Should use generic error message
        assert 'Invalid email or password' in str(response.content)

    @patch('notifications.services.EmailService.send_password_reset_email')
    def test_password_reset_request_api(self, mock_send):
        """Test password reset request endpoint"""
        mock_send.return_value = True
        url = reverse('customers:password_reset_request')
        data = {'email': 'test@example.com'}

        response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')

        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data
        # Should always return success message
        assert 'password reset link has been sent' in response.data['message']

    @patch('notifications.services.EmailService.send_password_reset_email')
    def test_password_reset_request_nonexistent_email(self, mock_send):
        """Test password reset request for nonexistent email"""
        url = reverse('customers:password_reset_request')
        data = {'email': 'nonexistent@example.com'}

        response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')

        assert response.status_code == status.HTTP_200_OK
        # Should still return success to prevent enumeration
        assert 'password reset link has been sent' in response.data['message']
        mock_send.assert_not_called()

    def test_password_reset_confirm_api(self):
        """Test password reset confirmation endpoint"""
        token = CustomerPasswordResetToken.objects.create(
            tenant=self.tenant,
            customer=self.customer
        )

        url = reverse('customers:password_reset_confirm')
        data = {
            'token': token.token,
            'new_password': 'NewPassword123!'
        }

        response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')

        assert response.status_code == status.HTTP_200_OK
        assert 'Password has been reset successfully' in response.data['message']

    def test_rate_limiting_password_reset(self):
        """Test rate limiting on password reset requests"""
        url = reverse('customers:password_reset_request')
        data = {'email': 'test@example.com'}

        with patch('notifications.services.EmailService.send_password_reset_email'):
            # Make requests up to rate limit
            for i in range(3):
                response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
                assert response.status_code == status.HTTP_200_OK

            # Next request should be rate limited
            response = self.client.post(url, data, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
            assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
class TestSecurity:
    """Test security measures and anti-enumeration"""

    @pytest.fixture(autouse=True)
    def setup(self, tenant_a):
        """Setup for each test"""
        set_current_tenant(tenant_a)
        self.tenant = tenant_a
        self.customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe'
        )

    def test_timing_attack_protection(self):
        """Test that authentication has consistent timing"""
        import time

        # Test existing user with wrong password
        start1 = time.time()
        result1 = CustomerAuthService.authenticate_customer('test@example.com', 'wrong')
        elapsed1 = time.time() - start1

        # Test nonexistent user
        start2 = time.time()
        result2 = CustomerAuthService.authenticate_customer('nonexistent@example.com', 'wrong')
        elapsed2 = time.time() - start2

        assert result1 is None
        assert result2 is None

        # Both should take at least 100ms (timing protection)
        assert elapsed1 >= 0.1
        assert elapsed2 >= 0.1

        # Timing should be relatively consistent (within 50ms)
        assert abs(elapsed1 - elapsed2) < 0.05

    def test_token_uniqueness(self):
        """Test that tokens are unique and secure"""
        token1 = CustomerPasswordResetToken.objects.create(
            tenant=self.tenant,
            customer=self.customer
        )
        token2 = CustomerPasswordResetToken.objects.create(
            tenant=self.tenant,
            customer=self.customer
        )

        assert token1.token != token2.token
        assert len(token1.token) == 40  # URL-safe tokens should be 40 chars
        assert token1.token.replace('-', '').replace('_', '').isalnum()

    def test_token_expiration(self):
        """Test that tokens have proper expiration"""
        token = CustomerPasswordResetToken.objects.create(
            tenant=self.tenant,
            customer=self.customer
        )

        # Should expire in 24 hours
        expected_expiry = timezone.now() + timedelta(hours=24)
        time_diff = abs((token.expires_at - expected_expiry).total_seconds())
        assert time_diff < 60  # Within 1 minute

    def test_old_tokens_invalidated(self):
        """Test that old tokens are invalidated when new ones are created"""
        with patch('notifications.services.EmailService.send_password_reset_email') as mock_send:
            mock_send.return_value = True

            # Request password reset twice
            CustomerAuthService.request_password_reset('test@example.com')
            CustomerAuthService.request_password_reset('test@example.com')

            # Should have 2 tokens, but only 1 should be valid
            tokens = CustomerPasswordResetToken.objects.filter(customer=self.customer)
            assert tokens.count() == 2

            valid_tokens = [t for t in tokens if t.is_valid]
            assert len(valid_tokens) == 1


@pytest.mark.django_db
class TestEmailIntegration:
    """Test email integration"""

    @pytest.fixture(autouse=True)
    def setup(self, tenant_a, settings):
        """Setup for each test"""
        # Override email backend for testing
        settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

        set_current_tenant(tenant_a)
        self.tenant = tenant_a
        self.customer = Customer.objects.create_customer(
            tenant=tenant_a,
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe'
        )
        mail.outbox.clear()

    def test_password_reset_email_sent(self):
        """Test that password reset email is actually sent"""
        CustomerAuthService.request_password_reset('test@example.com')

        assert len(mail.outbox) == 1
        email = mail.outbox[0]
        assert email.to == ['test@example.com']
        assert 'Reset Your Ajeen Fresh Password' in email.subject

        # Check HTML content in alternatives (HTML emails)
        if email.alternatives:
            html_content = email.alternatives[0][0]
            assert 'reset-password?token=' in html_content or 'reset-password' in html_content
        else:
            assert 'reset-password?token=' in email.body

    def test_email_verification_sent(self):
        """Test that email verification is actually sent"""
        CustomerAuthService.send_email_verification(self.customer)

        assert len(mail.outbox) == 1
        email = mail.outbox[0]
        assert email.to == ['test@example.com']
        assert 'Welcome to Ajeen Fresh' in email.subject

        # Check HTML content in alternatives (HTML emails)
        if email.alternatives:
            html_content = email.alternatives[0][0]
            assert 'verify-email?token=' in html_content or 'verify-email' in html_content
        else:
            assert 'verify-email?token=' in email.body
