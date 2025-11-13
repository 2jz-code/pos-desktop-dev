"""
Security Tests - Tier 1 (CRITICAL for Production)

This module tests critical security vulnerabilities that must be addressed before production deployment:
1. File Upload Validation (prevent malicious uploads)
2. Webhook Security (prevent fraudulent payment confirmations)
3. Rate Limiting (prevent brute force and DoS attacks)

Priority: CRITICAL for Production Readiness

Test Categories:
1. File Upload Validation (3 tests)
2. Webhook Security (2 tests)
3. Rate Limiting (2 tests)
"""
import pytest
import io
import hashlib
import time
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile, InMemoryUploadedFile
from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from PIL import Image

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, ProductType, Category
from payments.models import Payment, PaymentTransaction
from orders.models import Order

User = get_user_model()


# ============================================================================
# FILE UPLOAD VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestFileUploadValidation:
    """Test validation of file uploads to prevent malicious files."""

    def test_product_image_size_exceeds_limit_rejected(self):
        """
        CRITICAL: Verify large file uploads are rejected.

        Scenario:
        - Try to upload product image > 10MB
        - Expected: HTTP 400 - File size exceeds limit

        Value: Prevents DoS attacks via large file uploads
        """
        # Create tenant and user
        tenant = Tenant.objects.create(
            slug="file-upload-test",
            name="File Upload Test",
            is_active=True
        )

        user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="test123",
            tenant=tenant,
            role="ADMIN"
        )

        set_current_tenant(tenant)

        # Create category and product type
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Simple")

        # Create a large fake image file (> 10MB)
        # Create 11MB of data
        large_image_data = b'0' * (11 * 1024 * 1024)  # 11MB
        large_file = SimpleUploadedFile(
            "large_image.jpg",
            large_image_data,
            content_type="image/jpeg"
        )

        # Setup API client with authentication
        client = APIClient()
        refresh = RefreshToken.for_user(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug

        client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

        # Try to create product with large image
        response = client.post('/api/products/', {
            'name': 'Test Product',
            'price': '10.00',
            'product_type_id': product_type.id,
            'category_id': category.id,
            'image': large_file
        }, format='multipart')

        # Should return 400 (bad request) due to file size
        # Note: This test will pass if Django's FILE_UPLOAD_MAX_MEMORY_SIZE or custom validation is configured
        # If no validation exists, this test will fail and indicate the need to implement it
        assert response.status_code in [400, 413], \
            f"Expected 400 or 413 for oversized file, got {response.status_code}. " \
            f"SECURITY ISSUE: File size validation may not be implemented!"

    def test_non_image_file_rejected(self):
        """
        CRITICAL: Verify non-image files are rejected.

        Scenario:
        - Try to upload .exe, .php, .sh files as product images
        - Expected: HTTP 400 - Invalid file type

        Value: Prevents malicious file execution
        """
        # Create tenant and user
        tenant = Tenant.objects.create(
            slug="file-type-test",
            name="File Type Test",
            is_active=True
        )

        user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="test123",
            tenant=tenant,
            role="ADMIN"
        )

        set_current_tenant(tenant)

        # Create category and product type
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Simple")

        # Malicious file types to test
        malicious_files = [
            ("malicious.exe", b"MZ\x90\x00", "application/x-msdownload"),
            ("script.php", b"<?php system('rm -rf /'); ?>", "application/x-php"),
            ("script.sh", b"#!/bin/bash\nrm -rf /", "application/x-sh"),
            ("test.txt", b"Just a text file", "text/plain"),
        ]

        client = APIClient()
        refresh = RefreshToken.for_user(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug

        client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

        for filename, content, content_type in malicious_files:
            malicious_file = SimpleUploadedFile(filename, content, content_type=content_type)

            response = client.post('/api/products/', {
                'name': f'Test Product {filename}',
                'price': '10.00',
                'product_type_id': product_type.id,
                'category_id': category.id,
                'image': malicious_file
            }, format='multipart')

            # Should reject non-image files
            # This test checks if the serializer or model validates file types
            # If validation doesn't exist, the test should highlight this gap
            assert response.status_code in [400, 415], \
                f"File {filename} should be rejected but got {response.status_code}. " \
                f"SECURITY WARNING: File type validation may not be implemented!"

    def test_valid_image_formats_accepted(self):
        """
        IMPORTANT: Verify valid image formats are accepted.

        Scenario:
        - Upload valid JPEG, PNG, GIF, WebP images
        - Expected: HTTP 201 - Created successfully

        Value: Ensures legitimate uploads work correctly
        """
        # Create tenant and user
        tenant = Tenant.objects.create(
            slug="valid-image-test",
            name="Valid Image Test",
            is_active=True
        )

        user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="test123",
            tenant=tenant,
            role="ADMIN"
        )

        set_current_tenant(tenant)

        # Create category and product type
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Simple")

        client = APIClient()
        refresh = RefreshToken.for_user(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug

        client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

        # Create a small valid image (100x100 pixel PNG)
        image = Image.new('RGB', (100, 100), color='red')
        image_io = io.BytesIO()
        image.save(image_io, format='PNG')
        image_io.seek(0)

        valid_image = InMemoryUploadedFile(
            image_io, None, 'test_image.png', 'image/png',
            len(image_io.getvalue()), None
        )

        response = client.post('/api/products/', {
            'name': 'Test Product with Image',
            'price': '10.00',
            'product_type_id': product_type.id,
            'category_id': category.id,
            'image': valid_image
        }, format='multipart')

        # Valid images should be accepted
        assert response.status_code == 201, \
            f"Valid image should be accepted, got {response.status_code}: {response.data}"


# ============================================================================
# WEBHOOK SECURITY TESTS
# ============================================================================

@pytest.mark.django_db
class TestWebhookSecurity:
    """Test webhook security to prevent fraudulent payment confirmations."""

    def test_stripe_webhook_invalid_signature_rejected(self):
        """
        CRITICAL: Verify Stripe webhook with invalid signature is rejected.

        Scenario:
        - Send webhook with invalid/missing signature
        - Expected: HTTP 400 - Invalid signature

        Value: Prevents fraudulent payment confirmations
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="webhook-security-test",
            name="Webhook Security Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Create order and payment
        order = Order.objects.create(
            tenant=tenant,
            order_type='web',
            subtotal=Decimal('100.00'),
            tax_total=Decimal('8.00'),
            grand_total=Decimal('108.00'),
            status='PENDING'
        )

        payment = Payment.objects.create(
            tenant=tenant,
            order=order,
            total_amount_due=order.grand_total,
            status='PENDING'
        )

        # Create fake webhook payload
        webhook_payload = {
            "id": "evt_test_webhook",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": "pi_test_12345",
                    "amount": 10800,  # $108.00 in cents
                    "currency": "usd",
                    "status": "succeeded",
                    "metadata": {
                        "order_id": str(order.id)
                    }
                }
            }
        }

        client = APIClient()

        # Send webhook WITHOUT signature (should be rejected)
        response = client.post(
            '/api/payments/webhooks/stripe/',
            data=webhook_payload,
            format='json'
        )

        assert response.status_code == 400, \
            f"Webhook without signature should be rejected, got {response.status_code}"

        # Send webhook WITH INVALID signature (should be rejected)
        response = client.post(
            '/api/payments/webhooks/stripe/',
            data=webhook_payload,
            format='json',
            HTTP_STRIPE_SIGNATURE='invalid_signature_12345'
        )

        assert response.status_code == 400, \
            f"Webhook with invalid signature should be rejected, got {response.status_code}"

    def test_webhook_idempotency_prevents_duplicate_processing(self):
        """
        HIGH: Verify webhook events are processed only once (idempotency).

        Scenario:
        - Send same webhook payload twice (replay attack)
        - Expected: Second attempt is idempotent (no double-processing)

        Value: Prevents double-charging/double-crediting

        Note: This test checks the refund idempotency logic that already exists
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="webhook-idempotency-test",
            name="Webhook Idempotency Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Create order, payment, and transaction
        order = Order.objects.create(
            tenant=tenant,
            order_type='web',
            subtotal=Decimal('100.00'),
            tax_total=Decimal('8.00'),
            grand_total=Decimal('108.00'),
            status='PENDING'
        )

        payment = Payment.objects.create(
            tenant=tenant,
            order=order,
            total_amount_due=order.grand_total,
            status='PAID',
            amount_paid=order.grand_total
        )

        # Create successful transaction
        transaction = PaymentTransaction.objects.create(
            tenant=tenant,
            payment=payment,
            transaction_id="pi_test_idempotency",
            amount=Decimal('108.00'),
            method='CARD_ONLINE',
            status='SUCCESSFUL',
            provider_response={
                "id": "pi_test_idempotency",
                "refunds": []  # No refunds initially
            }
        )

        # Simulate refund webhook payload
        refund_payload = {
            "id": "re_test_12345",
            "amount": 10800,  # Full refund
            "status": "succeeded",
            "payment_intent": "pi_test_idempotency"
        }

        # Manually call the webhook handler's refund method
        # (bypassing signature verification for testing)
        from payments.views.webhooks import StripeWebhookView
        webhook_view = StripeWebhookView()

        # First refund processing - should succeed
        initial_refunded = transaction.refunded_amount
        webhook_view._handle_refund_updated(refund_payload)

        transaction.refresh_from_db()
        first_refunded_amount = transaction.refunded_amount

        # Verify refund was processed
        assert first_refunded_amount > initial_refunded, \
            "First refund should be processed"

        # Second refund processing (replay attack) - should be idempotent
        webhook_view._handle_refund_updated(refund_payload)

        transaction.refresh_from_db()
        second_refunded_amount = transaction.refunded_amount

        # Verify refund was NOT processed again (idempotency)
        assert first_refunded_amount == second_refunded_amount, \
            f"Refund should be idempotent, but amount changed from {first_refunded_amount} to {second_refunded_amount}"

        # Verify refund ID is stored only once in provider_response
        refund_ids = [r.get('id') for r in transaction.provider_response.get('refunds', [])]
        assert refund_ids.count('re_test_12345') == 1, \
            "Refund ID should appear only once in provider_response"


# ============================================================================
# RATE LIMITING TESTS
# ============================================================================

@pytest.mark.django_db
class TestRateLimiting:
    """Test rate limiting to prevent brute force and DoS attacks."""

    def test_login_rate_limit_enforced(self):
        """
        CRITICAL: Verify login rate limiting prevents brute force attacks.

        Scenario:
        - Make 6+ failed login attempts within 1 minute (rate limit is 5/minute)
        - Expected: HTTP 403 - Too many requests (django-ratelimit response)

        Value: Prevents brute force password attacks

        Note: Tests existing django-ratelimit configuration on POS login endpoint
        """
        # Create tenant and user
        tenant = Tenant.objects.create(
            slug="rate-limit-test",
            name="Rate Limit Test",
            is_active=True
        )

        user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="correct_password",
            tenant=tenant,
            role="STAFF"
        )

        set_current_tenant(tenant)

        client = APIClient()

        # Attempt 6 failed logins with wrong password (rate limit is 5/minute)
        failed_attempts = 0
        rate_limited = False

        for i in range(7):
            response = client.post('/api/users/login/pos/', {
                'username': 'testuser',
                'pin': '0000'  # Wrong PIN
            })

            if response.status_code == 403:  # django-ratelimit blocks with 403
                rate_limited = True
                break

            failed_attempts += 1

        # Should hit rate limit after 5 attempts
        assert rate_limited, \
            f"Rate limiting should block after 5 attempts, but allowed {failed_attempts} attempts. " \
            f"Last response: {response.status_code}"

        assert failed_attempts <= 5, \
            f"Expected rate limit after 5 attempts, but got {failed_attempts} attempts"

    def test_customer_registration_rate_limit_enforced(self):
        """
        CRITICAL: Verify customer registration rate limiting prevents abuse.

        Scenario:
        - Attempt 6+ customer registrations within 1 minute (rate limit is 5/minute)
        - Expected: HTTP 403 - Too many requests

        Value: Prevents automated account creation attacks

        Note: Tests existing django-ratelimit configuration on customer registration endpoint
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="customer-rate-limit-test",
            name="Customer Rate Limit Test",
            is_active=True
        )

        set_current_tenant(tenant)

        client = APIClient()

        # Attempt 6 customer registrations (rate limit is 5/minute)
        registration_attempts = 0
        rate_limited = False

        for i in range(7):
            response = client.post('/api/customers/register/', {
                'first_name': f'Test{i}',
                'last_name': f'User{i}',
                'email': f'test{i}@example.com',
                'phone_number': f'555-000{i}',
                'password': 'TestPass123!',
                'password_confirm': 'TestPass123!'
            })

            if response.status_code == 403:  # django-ratelimit blocks with 403
                rate_limited = True
                break

            if response.status_code == 201:  # Successful registration
                registration_attempts += 1

        # Should hit rate limit after 5 attempts
        assert rate_limited, \
            f"Rate limiting should block after 5 registrations, but allowed {registration_attempts} attempts. " \
            f"Last response: {response.status_code}"

        assert registration_attempts <= 5, \
            f"Expected rate limit after 5 registrations, but got {registration_attempts} successful attempts"
