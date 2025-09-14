"""
Comprehensive tests for customer authentication and account management.
Tests cover security requirements, password reset flow, email verification, and anti-enumeration.
"""

from django.test import TestCase, override_settings
from django.urls import reverse
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from datetime import timedelta
from unittest.mock import patch, MagicMock
import json

from .models import Customer, CustomerPasswordResetToken, CustomerEmailVerificationToken
from .services import CustomerAuthService


class CustomerModelTestCase(TestCase):
    """Test Customer model functionality"""
    
    def setUp(self):
        self.customer_data = {
            'email': 'test@example.com',
            'password': 'TestPassword123!',
            'first_name': 'John',
            'last_name': 'Doe',
        }
    
    def test_customer_creation(self):
        """Test basic customer creation"""
        customer = Customer.objects.create_customer(**self.customer_data)
        
        self.assertEqual(customer.email, 'test@example.com')
        self.assertEqual(customer.first_name, 'John')
        self.assertEqual(customer.last_name, 'Doe')
        self.assertTrue(customer.check_password('TestPassword123!'))
        self.assertFalse(customer.email_verified)
        self.assertTrue(customer.is_active)
    
    def test_email_normalization(self):
        """Test email address normalization"""
        data = self.customer_data.copy()
        data['email'] = 'TEST@EXAMPLE.COM'
        
        customer = Customer.objects.create_customer(**data)
        self.assertEqual(customer.email, 'test@example.com')
    
    def test_customer_properties(self):
        """Test customer computed properties"""
        customer = Customer.objects.create_customer(**self.customer_data)
        
        self.assertEqual(customer.full_name, 'John Doe')
        self.assertEqual(customer.get_short_name(), 'John')
        self.assertFalse(customer.is_pos_staff)  # Customers are never POS staff


class CustomerAuthServiceTestCase(TestCase):
    """Test CustomerAuthService methods"""
    
    def setUp(self):
        self.customer_data = {
            'email': 'test@example.com',
            'password': 'TestPassword123!',
            'first_name': 'John',
            'last_name': 'Doe',
        }
        self.customer = Customer.objects.create_customer(**self.customer_data)
    
    def test_successful_authentication(self):
        """Test successful customer authentication"""
        customer = CustomerAuthService.authenticate_customer('test@example.com', 'TestPassword123!')
        self.assertEqual(customer, self.customer)
    
    def test_failed_authentication_wrong_password(self):
        """Test authentication with wrong password"""
        customer = CustomerAuthService.authenticate_customer('test@example.com', 'WrongPassword')
        self.assertIsNone(customer)
    
    def test_failed_authentication_nonexistent_email(self):
        """Test authentication with nonexistent email"""
        customer = CustomerAuthService.authenticate_customer('nonexistent@example.com', 'TestPassword123!')
        self.assertIsNone(customer)
    
    def test_failed_authentication_inactive_customer(self):
        """Test authentication with inactive customer"""
        self.customer.is_active = False
        self.customer.save()
        
        customer = CustomerAuthService.authenticate_customer('test@example.com', 'TestPassword123!')
        self.assertIsNone(customer)
    
    def test_duplicate_email_registration(self):
        """Test registration with existing email"""
        with self.assertRaises(ValueError) as context:
            CustomerAuthService.register_customer(
                email='test@example.com',  # Same email
                password='TestPassword123!',
                first_name='Jane'
            )
        
        # Should use generic error message
        error_dict = context.exception.args[0]
        self.assertIn('Unable to create account with this email address', str(error_dict))
    
    def test_weak_password_registration(self):
        """Test registration with weak password"""
        with self.assertRaises(ValueError) as context:
            CustomerAuthService.register_customer(
                email='new@example.com',
                password='123',  # Weak password
                first_name='Jane'
            )
        
        error_dict = context.exception.args[0]
        self.assertIn('password', error_dict)
    
    def test_password_change(self):
        """Test password change functionality"""
        result = CustomerAuthService.change_customer_password(
            self.customer, 'TestPassword123!', 'NewPassword123!'
        )
        
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password('NewPassword123!'))
        self.assertFalse(self.customer.check_password('TestPassword123!'))
    
    def test_password_change_wrong_old_password(self):
        """Test password change with wrong old password"""
        with self.assertRaises(ValueError):
            CustomerAuthService.change_customer_password(
                self.customer, 'WrongPassword', 'NewPassword123!'
            )


class PasswordResetTestCase(TestCase):
    """Test password reset functionality"""
    
    def setUp(self):
        self.customer = Customer.objects.create_customer(
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
            
            self.assertTrue(result)
            mock_send.assert_called_once()
            
            # Should create a token
            self.assertEqual(CustomerPasswordResetToken.objects.count(), 1)
    
    def test_password_reset_request_nonexistent_email(self):
        """Test password reset request for nonexistent email (should still return True)"""
        with patch('notifications.services.EmailService.send_password_reset_email') as mock_send:
            result = CustomerAuthService.request_password_reset('nonexistent@example.com')
            
            self.assertTrue(result)  # Should return True to prevent enumeration
            mock_send.assert_not_called()
            
            # Should not create a token
            self.assertEqual(CustomerPasswordResetToken.objects.count(), 0)
    
    def test_password_reset_rate_limiting(self):
        """Test rate limiting on password reset requests"""
        email = 'test@example.com'
        
        with patch('notifications.services.EmailService.send_password_reset_email') as mock_send:
            mock_send.return_value = True
            
            # Make 3 requests (should work)
            for i in range(3):
                result = CustomerAuthService.request_password_reset(email)
                self.assertTrue(result)
            
            # 4th request should be rate limited but still return True
            result = CustomerAuthService.request_password_reset(email)
            self.assertTrue(result)  # Should still return True
            
            # Should only have sent 3 emails (4th was rate limited)
            self.assertEqual(mock_send.call_count, 3)
    
    def test_valid_password_reset(self):
        """Test password reset with valid token"""
        # Create a reset token
        token = CustomerPasswordResetToken.objects.create(customer=self.customer)
        
        result = CustomerAuthService.reset_password(token.token, 'NewPassword123!')
        
        self.assertTrue(result)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password('NewPassword123!'))
        
        # Token should be marked as used
        token.refresh_from_db()
        self.assertIsNotNone(token.used_at)
    
    def test_expired_password_reset_token(self):
        """Test password reset with expired token"""
        # Create an expired token
        token = CustomerPasswordResetToken.objects.create(
            customer=self.customer,
            expires_at=timezone.now() - timedelta(hours=1)
        )
        
        with self.assertRaises(ValueError) as context:
            CustomerAuthService.reset_password(token.token, 'NewPassword123!')
        
        # Should use generic error message
        self.assertIn('Invalid or expired password reset token', str(context.exception))
    
    def test_used_password_reset_token(self):
        """Test password reset with already used token"""
        token = CustomerPasswordResetToken.objects.create(
            customer=self.customer,
            used_at=timezone.now()
        )
        
        with self.assertRaises(ValueError) as context:
            CustomerAuthService.reset_password(token.token, 'NewPassword123!')
        
        # Should use generic error message
        self.assertIn('Invalid or expired password reset token', str(context.exception))
    
    def test_invalid_password_reset_token(self):
        """Test password reset with nonexistent token"""
        with self.assertRaises(ValueError) as context:
            CustomerAuthService.reset_password('nonexistent-token', 'NewPassword123!')
        
        # Should use generic error message
        self.assertIn('Invalid or expired password reset token', str(context.exception))


class EmailVerificationTestCase(TestCase):
    """Test email verification functionality"""
    
    def setUp(self):
        self.customer = Customer.objects.create_customer(
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
            
            self.assertTrue(result)
            mock_send.assert_called_once()
            
            # Should create a token
            self.assertEqual(CustomerEmailVerificationToken.objects.count(), 1)
    
    def test_verify_email_with_valid_token(self):
        """Test email verification with valid token"""
        token = CustomerEmailVerificationToken.objects.create(customer=self.customer)
        
        result = CustomerAuthService.verify_email_with_token(token.token)
        
        self.assertTrue(result)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.email_verified)
        
        # Token should be marked as used
        token.refresh_from_db()
        self.assertIsNotNone(token.used_at)
    
    def test_verify_email_with_expired_token(self):
        """Test email verification with expired token"""
        token = CustomerEmailVerificationToken.objects.create(
            customer=self.customer,
            expires_at=timezone.now() - timedelta(hours=1)
        )
        
        with self.assertRaises(ValueError) as context:
            CustomerAuthService.verify_email_with_token(token.token)
        
        # Should use generic error message
        self.assertIn('Invalid or expired verification token', str(context.exception))
    
    def test_verify_email_with_invalid_token(self):
        """Test email verification with invalid token"""
        with self.assertRaises(ValueError) as context:
            CustomerAuthService.verify_email_with_token('invalid-token')
        
        # Should use generic error message
        self.assertIn('Invalid or expired verification token', str(context.exception))


class CustomerAPITestCase(APITestCase):
    """Test customer API endpoints"""
    
    def setUp(self):
        self.customer = Customer.objects.create_customer(
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe'
        )
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
        
        response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('message', response.data)
        self.assertTrue(Customer.objects.filter(email='new@example.com').exists())
    
    def test_customer_login_api(self):
        """Test customer login endpoint"""
        url = reverse('customers:login')
        data = {
            'email': 'test@example.com',
            'password': 'TestPassword123!'
        }
        
        response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)
        self.assertIn('customer', response.data)
    
    def test_customer_login_invalid_credentials(self):
        """Test customer login with invalid credentials"""
        url = reverse('customers:login')
        data = {
            'email': 'test@example.com',
            'password': 'WrongPassword'
        }
        
        response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Should use generic error message
        self.assertIn('Invalid email or password', str(response.data))
    
    @patch('notifications.services.EmailService.send_password_reset_email')
    def test_password_reset_request_api(self, mock_send):
        """Test password reset request endpoint"""
        mock_send.return_value = True
        url = reverse('customers:password_reset_request')
        data = {'email': 'test@example.com'}
        
        response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)
        # Should always return success message
        self.assertIn('password reset link has been sent', response.data['message'])
    
    @patch('notifications.services.EmailService.send_password_reset_email')
    def test_password_reset_request_nonexistent_email(self, mock_send):
        """Test password reset request for nonexistent email"""
        url = reverse('customers:password_reset_request')
        data = {'email': 'nonexistent@example.com'}
        
        response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should still return success to prevent enumeration
        self.assertIn('password reset link has been sent', response.data['message'])
        mock_send.assert_not_called()
    
    def test_password_reset_confirm_api(self):
        """Test password reset confirmation endpoint"""
        token = CustomerPasswordResetToken.objects.create(customer=self.customer)
        
        url = reverse('customers:password_reset_confirm')
        data = {
            'token': token.token,
            'new_password': 'NewPassword123!'
        }
        
        response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Password has been reset successfully', response.data['message'])
    
    def test_rate_limiting_password_reset(self):
        """Test rate limiting on password reset requests"""
        url = reverse('customers:password_reset_request')
        data = {'email': 'test@example.com'}
        
        with patch('notifications.services.EmailService.send_password_reset_email'):
            # Make requests up to rate limit
            for i in range(3):
                response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
                self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # Next request should be rate limited
            response = self.client.post(url, data, HTTP_X_CSRFTOKEN='test')
            self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class SecurityTestCase(TestCase):
    """Test security measures and anti-enumeration"""
    
    def setUp(self):
        self.customer = Customer.objects.create_customer(
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
        
        self.assertIsNone(result1)
        self.assertIsNone(result2)
        
        # Both should take at least 100ms (timing protection)
        self.assertGreaterEqual(elapsed1, 0.1)
        self.assertGreaterEqual(elapsed2, 0.1)
        
        # Timing should be relatively consistent (within 50ms)
        self.assertLess(abs(elapsed1 - elapsed2), 0.05)
    
    def test_token_uniqueness(self):
        """Test that tokens are unique and secure"""
        token1 = CustomerPasswordResetToken.objects.create(customer=self.customer)
        token2 = CustomerPasswordResetToken.objects.create(customer=self.customer)
        
        self.assertNotEqual(token1.token, token2.token)
        self.assertEqual(len(token1.token), 40)  # URL-safe tokens should be 40 chars
        self.assertTrue(token1.token.replace('-', '').replace('_', '').isalnum())
    
    def test_token_expiration(self):
        """Test that tokens have proper expiration"""
        token = CustomerPasswordResetToken.objects.create(customer=self.customer)
        
        # Should expire in 24 hours
        expected_expiry = timezone.now() + timedelta(hours=24)
        time_diff = abs((token.expires_at - expected_expiry).total_seconds())
        self.assertLess(time_diff, 60)  # Within 1 minute
    
    def test_old_tokens_invalidated(self):
        """Test that old tokens are invalidated when new ones are created"""
        with patch('notifications.services.EmailService.send_password_reset_email') as mock_send:
            mock_send.return_value = True
            
            # Request password reset twice
            CustomerAuthService.request_password_reset('test@example.com')
            CustomerAuthService.request_password_reset('test@example.com')
            
            # Should have 2 tokens, but only 1 should be valid
            tokens = CustomerPasswordResetToken.objects.filter(customer=self.customer)
            self.assertEqual(tokens.count(), 2)
            
            valid_tokens = [t for t in tokens if t.is_valid]
            self.assertEqual(len(valid_tokens), 1)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class EmailIntegrationTestCase(TestCase):
    """Test email integration"""
    
    def setUp(self):
        self.customer = Customer.objects.create_customer(
            email='test@example.com',
            password='TestPassword123!',
            first_name='John',
            last_name='Doe'
        )
        mail.outbox.clear()
    
    def test_password_reset_email_sent(self):
        """Test that password reset email is actually sent"""
        CustomerAuthService.request_password_reset('test@example.com')
        
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['test@example.com'])
        self.assertIn('Reset Your Ajeen Fresh Password', email.subject)
        self.assertIn('reset-password?token=', email.body)
    
    def test_email_verification_sent(self):
        """Test that email verification is actually sent"""
        CustomerAuthService.send_email_verification(self.customer)
        
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['test@example.com'])
        self.assertIn('Welcome to Ajeen Fresh', email.subject)
        self.assertIn('verify-email?token=', email.body)