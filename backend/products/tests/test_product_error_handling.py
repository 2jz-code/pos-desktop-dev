"""
Product Error Handling Tests

This module tests how the product system handles failure scenarios, invalid inputs,
and edge cases. These tests are critical for ensuring product system robustness.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Product API Error Responses (404, 400, etc.)
2. Invalid Product Data Validation
3. Product Creation/Update Edge Cases

Run with: pytest backend/products/tests/test_product_error_handling.py -v
"""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, Category, ProductType, Tax

User = get_user_model()


# ============================================================================
# PRODUCT API ERROR RESPONSE TESTS
# ============================================================================

@pytest.mark.django_db
class TestProductAPIErrorResponses:
    """Test API returns proper error codes and messages for products."""

    def test_invalid_product_id_returns_404(self):
        """
        CRITICAL: Verify accessing non-existent product returns 404.

        Scenario:
        - Request product with invalid UUID
        - Expected: 404 Not Found

        Value: Ensures proper API error responses for invalid product lookups
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-product-404",
            name="Test Tenant",
            is_active=True
        )
        set_current_tenant(tenant)

        user = User.objects.create_user(
            username="staff",
            email="staff@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        client = APIClient()

        # Authenticate
        from django.conf import settings
        refresh = RefreshToken.for_user(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

        # Request non-existent product
        response = client.get('/api/products/00000000-0000-0000-0000-000000000000/')

        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


# ============================================================================
# TEST RUN SUMMARY
# ============================================================================

"""
Expected Test Results:
- 1 test total
- All tests should PASS (no skips expected)
- Zero teardown errors

Test Coverage:
✓ Product 404 error response (non-existent product ID)

This test verifies the product API returns proper error codes for invalid requests.
"""
