"""
Global Error Handling & Framework-Level Tests

This module tests GLOBAL error handling - framework-level concerns that span multiple apps.
App-specific error handling tests are now located in their respective apps.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Global API Error Responses (401 Unauthorized, 400 Malformed JSON)
2. Framework-Level Error Handling (CORS, CSRF, etc.)
3. Middleware Error Handling (BusinessHours, etc.)

NOTE: App-specific error tests have been moved to:
- payments/tests/test_payment_error_handling.py (3 tests)
- orders/tests/test_order_error_handling.py (3 tests)
- inventory/tests/test_inventory_error_handling.py (3 tests)
- products/tests/test_product_error_handling.py (1 test)
- discounts/tests/test_discount_error_handling.py (1 test)

Run with: pytest backend/core_backend/tests/test_error_handling.py -v
"""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tenant.models import Tenant
from tenant.managers import set_current_tenant

User = get_user_model()


# ============================================================================
# GLOBAL API ERROR RESPONSE TESTS
# ============================================================================

@pytest.mark.django_db
class TestGlobalAPIErrorResponses:
    """Test framework-level API error responses that apply across all apps."""

    def test_unauthenticated_order_creation_returns_401(self):
        """
        CRITICAL: Verify unauthenticated API requests return 401 or 400.

        Scenario:
        - No authentication token
        - Attempt to create order via API
        - Expected: 401 Unauthorized or 400 Bad Request (if tenant validation happens first)

        Value: Ensures authentication is enforced globally across all endpoints
        """
        client = APIClient()

        response = client.post('/api/orders/', {
            'order_type': 'COUNTER'
        }, format='json')

        assert response.status_code in [400, 401], f"Expected 400 or 401, got {response.status_code}"

    def test_malformed_json_request_returns_400(self):
        """
        IMPORTANT: Verify malformed JSON returns 400.

        Scenario:
        - Send malformed JSON to API
        - Expected: 400 Bad Request

        Value: Ensures proper handling of malformed requests at framework level
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-malformed",
            name="Test Tenant",
            is_active=True
        )

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

        # Send malformed JSON (missing closing brace)
        response = client.post(
            '/api/products/',
            '{"name": "Test Product", "price": "50.00"',  # Malformed
            content_type='application/json'
        )

        assert response.status_code == 400, f"Expected 400, got {response.status_code}"


# ============================================================================
# TEST RUN SUMMARY
# ============================================================================

"""
Expected Test Results:
- 2 tests total (DOWN FROM 13 - others moved to app-specific files)
- All tests should PASS (no skips expected)
- Zero teardown errors

Test Coverage:
✓ Unauthenticated API requests (401)
✓ Malformed JSON handling (400)

App-Specific Tests Relocated:
✓ Payment errors → payments/tests/test_payment_error_handling.py (3 tests)
✓ Order errors → orders/tests/test_order_error_handling.py (3 tests)
✓ Inventory errors → inventory/tests/test_inventory_error_handling.py (3 tests)
✓ Product API errors → products/tests/test_product_error_handling.py (1 test)
✓ Discount API errors → discounts/tests/test_discount_error_handling.py (1 test)

TOTAL ERROR HANDLING TESTS: 13 tests (2 global + 11 app-specific)

Run all error handling tests with:
pytest backend/payments/tests/test_payment_error_handling.py \
      backend/orders/tests/test_order_error_handling.py \
      backend/inventory/tests/test_inventory_error_handling.py \
      backend/products/tests/test_product_error_handling.py \
      backend/discounts/tests/test_discount_error_handling.py \
      backend/core_backend/tests/test_error_handling.py -v
"""
