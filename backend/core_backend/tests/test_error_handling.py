"""
Error Handling & Edge Case Tests

This module tests how the system handles failure scenarios, invalid inputs,
and edge cases. These tests are critical for ensuring system robustness.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Payment Failure Recovery
2. Order State Validation
3. Inventory Edge Cases
4. API Error Responses
"""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch, Mock

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, Category, ProductType, Tax
from orders.models import Order, OrderItem
from orders.services import OrderService
from payments.models import Payment, PaymentTransaction
from payments.services import PaymentService
from inventory.models import Location, InventoryStock
from inventory.services import InventoryService
from discounts.models import Discount

User = get_user_model()


# ============================================================================
# 1. PAYMENT FAILURE RECOVERY TESTS
# ============================================================================

@pytest.mark.django_db(transaction=True)
class TestPaymentFailureRecovery:
    """Test system recovery from payment failures."""

    def test_stripe_terminal_connection_failure_marks_payment_failed(self, django_db_with_cascade):
        """
        CRITICAL: Verify payment marked FAILED when terminal connection fails.

        Scenario:
        - Order ready for payment
        - Stripe Terminal API call fails (network error)
        - Expected: Payment status = FAILED, order remains IN_PROGRESS
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant-payment-1",
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
        OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=2
        )

        # Mock Stripe Terminal to simulate connection failure
        with patch('payments.strategies.StripeTerminalStrategy.process') as mock_stripe:
            mock_stripe.side_effect = Exception("Network connection failed")

            # Attempt payment
            with pytest.raises(Exception) as exc_info:
                PaymentService.process_transaction(
                    order=order,
                    method='STRIPE_TERMINAL',
                    amount=order.total,
                    terminal_id='tmr_test_123'
                )

            assert "Network connection failed" in str(exc_info.value)

        # Verify payment and order state
        payment = Payment.objects.filter(order=order).first()
        assert payment is not None, "Payment record should be created"
        assert payment.status == 'FAILED', f"Expected FAILED status, got {payment.status}"

        order.refresh_from_db()
        assert order.status == 'IN_PROGRESS', f"Order should remain IN_PROGRESS, got {order.status}"
        assert order.payment_status == 'PENDING', f"Payment status should be PENDING, got {order.payment_status}"

    def test_stripe_declined_card_allows_retry_with_different_card(self):
        """
        CRITICAL: Verify declined payment can be retried.

        Scenario:
        - First payment attempt declined by Stripe
        - Second payment attempt with different card succeeds
        - Expected: Order shows both attempts, 2nd succeeds
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
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
        OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=1
        )

        # First attempt - declined
        with patch('payments.strategies.StripeTerminalStrategy.process') as mock_stripe:
            mock_stripe.return_value = {
                'success': False,
                'transaction_id': 'pi_declined_123',
                'status': 'DECLINED',
                'error_message': 'Card declined - insufficient funds'
            }

            with pytest.raises(Exception) as exc_info:
                PaymentService.process_transaction(
                    order=order,
                    method='STRIPE_TERMINAL',
                    amount=order.total,
                    terminal_id='tmr_test_123'
                )

        # Verify first attempt failed
        payment = Payment.objects.get(order=order)
        assert payment.status == 'FAILED'
        failed_transactions = PaymentTransaction.objects.filter(
            payment=payment,
            status='FAILED'
        )
        assert failed_transactions.count() == 1

        # Second attempt - success
        with patch('payments.strategies.StripeTerminalStrategy.process') as mock_stripe:
            mock_stripe.return_value = {
                'success': True,
                'transaction_id': 'pi_success_456',
                'status': 'COMPLETED',
                'amount': order.total
            }

            PaymentService.process_transaction(
                order=order,
                method='STRIPE_TERMINAL',
                amount=order.total,
                terminal_id='tmr_test_123'
            )

        # Verify second attempt succeeded
        payment.refresh_from_db()
        assert payment.status == 'COMPLETED'

        all_transactions = PaymentTransaction.objects.filter(payment=payment)
        assert all_transactions.count() == 2, "Should have 2 transaction records"

        successful_transactions = all_transactions.filter(status='COMPLETED')
        assert successful_transactions.count() == 1, "Should have 1 successful transaction"

    def test_partial_payment_failure_requires_full_amount(self):
        """
        CRITICAL: Verify partial payments fail if amount < order total.

        Scenario:
        - Order total = $54.00 (with tax)
        - Payment attempt = $50.00 (insufficient)
        - Expected: Payment rejected, error message
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
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
            name="Test Category",
            tax=tax
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

        # Create order with total = $54.00 (with 8% tax)
        order = OrderService.create_order(
            tenant=tenant,
            order_type='COUNTER',
            cashier=user
        )
        OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=1
        )

        # Attempt partial payment ($50 when total is $54)
        with pytest.raises(ValueError) as exc_info:
            PaymentService.process_transaction(
                order=order,
                method='CASH',
                amount=Decimal('50.00')  # Less than total
            )

        assert "insufficient" in str(exc_info.value).lower() or "amount" in str(exc_info.value).lower()


# ============================================================================
# 2. ORDER STATE VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestOrderStateValidation:
    """Test order state transitions and validation."""

    def test_cannot_modify_completed_order_items(self):
        """
        CRITICAL: Verify completed orders cannot have items added/removed.

        Scenario:
        - Order is COMPLETED
        - Attempt to add new item
        - Expected: Raise error, order unchanged
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
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
            name="Test Category",
            tax=tax
        )

        product_type = ProductType.objects.create(
            tenant=tenant,
            name="Test Type"
        )

        product1 = Product.objects.create(
            tenant=tenant,
            name="Product 1",
            price=Decimal("30.00"),
            category=category,
            product_type=product_type
        )

        product2 = Product.objects.create(
            tenant=tenant,
            name="Product 2",
            price=Decimal("20.00"),
            category=category,
            product_type=product_type
        )

        # Create and complete order
        order = OrderService.create_order(
            tenant=tenant,
            order_type='COUNTER',
            cashier=user
        )
        OrderService.add_item_to_order(order=order, product=product1, quantity=1)

        # Complete the order
        order.status = 'COMPLETED'
        order.payment_status = 'PAID'
        order.save()

        initial_item_count = order.items.count()

        # Attempt to add item to completed order
        with pytest.raises(ValueError) as exc_info:
            OrderService.add_item_to_order(order=order, product=product2, quantity=1)

        assert "completed" in str(exc_info.value).lower() or "cannot modify" in str(exc_info.value).lower()
        assert order.items.count() == initial_item_count, "Item count should not change"

    def test_cannot_cancel_paid_order_without_refund(self):
        """
        CRITICAL: Verify paid orders require refund before cancellation.

        Scenario:
        - Order is PAID
        - Attempt to cancel without refund
        - Expected: Raise error or require refund first
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
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
            name="Test Category",
            tax=tax
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

        # Create order and mark as paid
        order = OrderService.create_order(
            tenant=tenant,
            order_type='COUNTER',
            cashier=user
        )
        OrderService.add_item_to_order(order=order, product=product, quantity=1)

        # Mark order as paid
        order.payment_status = 'PAID'
        order.save()

        # Attempt to cancel paid order
        with pytest.raises(ValueError) as exc_info:
            OrderService.cancel_order(order=order, reason="Customer changed mind")

        assert "paid" in str(exc_info.value).lower() or "refund" in str(exc_info.value).lower()

    def test_empty_order_cannot_be_paid(self):
        """
        CRITICAL: Verify orders with no items cannot be paid.

        Scenario:
        - Create order
        - Don't add any items
        - Attempt payment
        - Expected: Raise error
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
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

        # Create empty order
        order = OrderService.create_order(
            tenant=tenant,
            order_type='COUNTER',
            cashier=user
        )

        # Attempt payment on empty order
        with pytest.raises(ValueError) as exc_info:
            PaymentService.process_transaction(
                order=order,
                method='CASH',
                amount=Decimal('0.00')
            )

        assert "empty" in str(exc_info.value).lower() or "no items" in str(exc_info.value).lower()


# ============================================================================
# 3. INVENTORY EDGE CASE TESTS
# ============================================================================

@pytest.mark.django_db
class TestInventoryEdgeCases:
    """Test inventory edge cases and boundary conditions."""

    def test_negative_stock_adjustment_fails(self):
        """
        CRITICAL: Verify cannot adjust stock below zero.

        Scenario:
        - Stock = 5 units
        - Attempt to deduct 10 units
        - Expected: Raise error, stock unchanged
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
            name="Test Tenant",
            is_active=True
        )
        set_current_tenant(tenant)

        tax = Tax.objects.create(
            tenant=tenant,
            name="Sales Tax",
            rate=Decimal("8.00")
        )

        category = Category.objects.create(
            tenant=tenant,
            name="Test Category",
            tax=tax
        )

        product_type = ProductType.objects.create(
            tenant=tenant,
            name="Test Type"
        )

        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal("10.00"),
            category=category,
            product_type=product_type,
            track_inventory=True
        )

        location = Location.objects.create(
            tenant=tenant,
            name="Main Store"
        )

        # Create stock with 5 units
        InventoryService.add_stock(
            product=product,
            location=location,
            quantity=5,
            reason="Initial stock"
        )

        # Attempt to deduct 10 units (more than available)
        with pytest.raises(ValueError) as exc_info:
            InventoryService.decrement_stock(
                product=product,
                location=location,
                quantity=10,
                reason="Over-deduction"
            )

        assert "insufficient" in str(exc_info.value).lower()

        # Verify stock unchanged
        stock = InventoryStock.objects.get(product=product, location=location)
        assert stock.quantity == 5, f"Stock should remain 5, got {stock.quantity}"

    def test_transfer_with_insufficient_stock_fails(self):
        """
        CRITICAL: Verify stock transfer fails if insufficient stock.

        Scenario:
        - Location A has 3 units
        - Attempt to transfer 5 units to Location B
        - Expected: Raise error, no transfer occurs
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
            name="Test Tenant",
            is_active=True
        )
        set_current_tenant(tenant)

        tax = Tax.objects.create(
            tenant=tenant,
            name="Sales Tax",
            rate=Decimal("8.00")
        )

        category = Category.objects.create(
            tenant=tenant,
            name="Test Category",
            tax=tax
        )

        product_type = ProductType.objects.create(
            tenant=tenant,
            name="Test Type"
        )

        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal("10.00"),
            category=category,
            product_type=product_type,
            track_inventory=True
        )

        location_a = Location.objects.create(tenant=tenant, name="Location A")
        location_b = Location.objects.create(tenant=tenant, name="Location B")

        # Add 3 units to Location A
        InventoryService.add_stock(
            product=product,
            location=location_a,
            quantity=3,
            reason="Initial stock"
        )

        # Attempt to transfer 5 units (more than available)
        with pytest.raises(ValueError) as exc_info:
            InventoryService.transfer_stock(
                product=product,
                from_location=location_a,
                to_location=location_b,
                quantity=5,
                reason="Over-transfer"
            )

        assert "insufficient" in str(exc_info.value).lower()

        # Verify stocks unchanged
        stock_a = InventoryStock.objects.get(product=product, location=location_a)
        assert stock_a.quantity == 3, f"Location A should still have 3, got {stock_a.quantity}"

        stock_b_exists = InventoryStock.objects.filter(product=product, location=location_b).exists()
        assert not stock_b_exists, "Location B should have no stock record"

    def test_non_tracked_product_allows_unlimited_orders(self):
        """
        IMPORTANT: Verify products with track_inventory=False allow unlimited orders.

        Scenario:
        - Product has track_inventory=False
        - No stock records exist
        - Order with any quantity should succeed
        - Expected: Order processes normally
        """
        # Setup
        tenant = Tenant.objects.create(
            slug="test-tenant",
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
            name="Test Category",
            tax=tax
        )

        product_type = ProductType.objects.create(
            tenant=tenant,
            name="Test Type"
        )

        # Create product with track_inventory=False
        product = Product.objects.create(
            tenant=tenant,
            name="Digital Product",
            price=Decimal("99.00"),
            category=category,
            product_type=product_type,
            track_inventory=False  # Key: No inventory tracking
        )

        # Create order with large quantity
        order = OrderService.create_order(
            tenant=tenant,
            order_type='COUNTER',
            cashier=user
        )

        # Should succeed even with no stock records
        OrderService.add_item_to_order(
            order=order,
            product=product,
            quantity=1000  # Large quantity, but product not tracked
        )

        order.refresh_from_db()
        assert order.items.count() == 1
        assert order.items.first().quantity == 1000


# ============================================================================
# 4. API ERROR RESPONSE TESTS
# ============================================================================

@pytest.mark.django_db
class TestAPIErrorResponses:
    """Test API returns proper error codes and messages."""

    def test_unauthenticated_order_creation_returns_401(self):
        """
        CRITICAL: Verify unauthenticated API requests return 401.

        Scenario:
        - No authentication token
        - Attempt to create order via API
        - Expected: 401 Unauthorized
        """
        client = APIClient()

        response = client.post('/api/orders/', {
            'order_type': 'COUNTER'
        }, format='json')

        assert response.status_code == 401, f"Expected 401, got {response.status_code}"

    def test_invalid_product_id_returns_404(self):
        """
        CRITICAL: Verify accessing non-existent product returns 404.

        Scenario:
        - Request product with invalid UUID
        - Expected: 404 Not Found
        """
        tenant = Tenant.objects.create(
            slug="test-tenant",
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

    def test_invalid_discount_code_returns_400(self):
        """
        CRITICAL: Verify invalid discount code returns 400 with clear message.

        Scenario:
        - Apply non-existent discount code to order
        - Expected: 400 Bad Request with error message
        """
        tenant = Tenant.objects.create(
            slug="test-tenant",
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
            name="Test Category",
            tax=tax
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
            f'/api/discounts/apply-code/',
            {
                'order_id': str(order.id),
                'code': 'INVALID_CODE_XYZ'
            },
            format='json'
        )

        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        assert 'error' in response.data or 'detail' in response.data, "Should have error message"

    def test_malformed_json_request_returns_400(self):
        """
        IMPORTANT: Verify malformed JSON returns 400.

        Scenario:
        - Send malformed JSON to API
        - Expected: 400 Bad Request
        """
        tenant = Tenant.objects.create(
            slug="test-tenant",
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
- 13 tests total
- All tests should PASS (no skips expected)
- Zero teardown errors

Test Coverage:
✓ Payment failure scenarios (network errors, declined cards, partial payments)
✓ Order state validation (completed orders, paid orders, empty orders)
✓ Inventory edge cases (negative stock, insufficient transfers, non-tracked products)
✓ API error responses (401, 404, 400 with proper messages)

Run with: pytest backend/core_backend/tests/test_error_handling.py -v
"""
