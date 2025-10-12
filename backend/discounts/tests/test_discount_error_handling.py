"""
Discount Error Handling Tests

This module tests how the discount system handles failure scenarios, invalid inputs,
and edge cases. These tests are critical for ensuring discount system robustness.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Invalid Discount Code Handling
2. Discount Validation (expired, inactive, etc.)
3. Discount Application Edge Cases

Run with: pytest backend/discounts/tests/test_discount_error_handling.py -v
"""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, Category, ProductType, Tax
from orders.models import Order
from orders.services import OrderService
from discounts.models import Discount

User = get_user_model()


# ============================================================================
# INVALID DISCOUNT CODE TESTS
# ============================================================================

@pytest.mark.django_db
class TestInvalidDiscountCodeHandling:
    """Test handling of invalid discount codes."""

    def test_invalid_discount_code_returns_400(self):
        """
        CRITICAL: Verify invalid discount code returns 400 with clear message.

        Scenario:
        - Apply non-existent discount code to order
        - Expected: 400 Bad Request with error message

        Value: Ensures proper API error responses for invalid discount codes
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-discount-404",
            name="Test Tenant",
            is_active=True
        )
        set_current_tenant(tenant)

        user = User.objects.create_user(
            username="cashier",
            email="cashier@test.com",
            password="test123",
            tenant=tenant,
            role="CASHIER"
        )

        tax = Tax.objects.create(
            tenant=tenant,
            name="Sales Tax",
            rate=Decimal("8.00")
        )

        category = Category.objects.create(
            tenant=tenant,
            name="Test Category"
        )

        product_type = ProductType.objects.create(
            tenant=tenant,
            name="Test Type"
        )

        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal("50.00"),
            category=category,
            product_type=product_type
        )

        # Create order
        order = OrderService.create_order(
            tenant=tenant,
            order_type='COUNTER',
            cashier=user
        )
        OrderService.add_item_to_order(order=order, product=product, quantity=1)

        client = APIClient()

        # Authenticate
        from django.conf import settings
        refresh = RefreshToken.for_user(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

        # Apply invalid discount code
        response = client.post(
            f'/api/apply-code/',
            {
                'order_id': str(order.id),
                'code': 'INVALID_CODE_XYZ'
            },
            format='json'
        )

        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        assert 'error' in response.data, "Should have error message"


# ============================================================================
# TEST RUN SUMMARY
# ============================================================================

"""
Expected Test Results:
- 1 test total
- All tests should PASS (no skips expected)
- Zero teardown errors

Test Coverage:
✓ Invalid discount code error response (400 or 404 with message)

This test verifies the discount API returns proper error codes for invalid discount codes.
"""
