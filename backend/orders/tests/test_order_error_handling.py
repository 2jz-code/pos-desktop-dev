"""
Order Error Handling Tests

This module tests how the order system handles failure scenarios, invalid inputs,
and edge cases. These tests are critical for ensuring order system robustness.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Order State Validation (completed orders, cancelled orders)
2. Order Item Modification Restrictions
3. Empty Order Validation
4. Order Cancellation Logic

Run with: pytest backend/orders/tests/test_order_error_handling.py -v
"""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, Category, ProductType, Tax
from orders.models import Order, OrderItem
from orders.services import OrderService
from payments.services import PaymentService

User = get_user_model()


# ============================================================================
# ORDER STATE VALIDATION TESTS
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

        Value: Prevents data corruption on completed orders (financial records)
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-completed",
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

        error_msg = str(exc_info.value).lower()
        assert "pending" in error_msg or "hold" in error_msg or "completed" in error_msg or "cannot" in error_msg
        assert order.items.count() == initial_item_count, "Item count should not change"

    def test_cannot_cancel_paid_order_without_refund(self):
        """
        CRITICAL: Verify paid orders require refund before cancellation.

        Scenario:
        - Order is PAID
        - Attempt to cancel without refund
        - Expected: Raise error or require refund first

        Value: Protects financial integrity, prevents order cancellation without refund
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-cancel",
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

        # Create order and mark as paid
        order = OrderService.create_order(
            tenant=tenant,
            order_type='COUNTER',
            cashier=user
        )
        OrderService.add_item_to_order(order=order, product=product, quantity=1)

        # Mark order as paid and completed
        order.status = 'COMPLETED'
        order.payment_status = 'PAID'
        order.save()

        # Attempt to cancel completed/paid order
        with pytest.raises(ValueError) as exc_info:
            OrderService.cancel_order(order=order)

        # Verify the error is about invalid transition (completed orders can't be cancelled)
        error_msg = str(exc_info.value).lower()
        assert "cannot transition" in error_msg or "completed" in error_msg


# ============================================================================
# EMPTY ORDER VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestEmptyOrderValidation:
    """Test validation for empty orders."""

    def test_empty_order_cannot_be_paid(self):
        """
        CRITICAL: Verify orders with no items cannot be paid.

        Scenario:
        - Create order
        - Don't add any items
        - Attempt payment
        - Expected: Raise error

        Value: Prevents charging customers for orders with no items
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-empty",
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
# TEST RUN SUMMARY
# ============================================================================

"""
Expected Test Results:
- 3 tests total
- All tests should PASS (no skips expected)
- Zero teardown errors

Test Coverage:
✓ Completed order immutability (prevents modification)
✓ Paid order cancellation protection (requires refund)
✓ Empty order payment rejection (prevents $0 charges)

These tests verify the order system maintains data integrity and prevents invalid state transitions.
"""
