"""
Inventory Error Handling Tests

This module tests how the inventory system handles failure scenarios, invalid inputs,
and edge cases. These tests are critical for ensuring inventory system robustness.

Priority: 4 (Critical for Production Readiness)

Test Categories:
1. Negative Stock Prevention
2. Stock Transfer Validation
3. Insufficient Stock Handling
4. Non-Tracked Product Behavior

Run with: pytest backend/inventory/tests/test_inventory_error_handling.py -v
"""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, Category, ProductType, Tax
from inventory.models import Location, InventoryStock
from inventory.services import InventoryService
from orders.services import OrderService

User = get_user_model()


# ============================================================================
# NEGATIVE STOCK PREVENTION TESTS
# ============================================================================

@pytest.mark.django_db
class TestNegativeStockPrevention:
    """Test that stock cannot go below zero."""

    def test_negative_stock_adjustment_fails(self):
        """
        CRITICAL: Verify cannot adjust stock below zero.

        Scenario:
        - Stock = 5 units
        - Attempt to deduct 10 units
        - Expected: Raise error, stock unchanged

        Value: Prevents overselling inventory that doesn't exist
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-neg-stock",
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
            name="Test Category"
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


# ============================================================================
# STOCK TRANSFER VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestStockTransferValidation:
    """Test stock transfer validation and error handling."""

    def test_transfer_with_insufficient_stock_fails(self):
        """
        CRITICAL: Verify stock transfer fails if insufficient stock.

        Scenario:
        - Location A has 3 units
        - Attempt to transfer 5 units to Location B
        - Expected: Raise error, no transfer occurs

        Value: Prevents transferring more inventory than exists
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-transfer",
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
            name="Test Category"
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


# ============================================================================
# NON-TRACKED PRODUCT TESTS
# ============================================================================

@pytest.mark.django_db
class TestNonTrackedProductBehavior:
    """Test behavior of products with track_inventory=False."""

    def test_non_tracked_product_allows_unlimited_orders(self):
        """
        IMPORTANT: Verify products with track_inventory=False allow unlimited orders.

        Scenario:
        - Product has track_inventory=False
        - No stock records exist
        - Order with any quantity should succeed
        - Expected: Order processes normally

        Value: Allows selling digital/non-inventory products without stock management
        """
        # Setup tenant context
        tenant = Tenant.objects.create(
            slug="test-tenant-non-tracked",
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
# TEST RUN SUMMARY
# ============================================================================

"""
Expected Test Results:
- 3 tests total
- All tests should PASS (no skips expected)
- Zero teardown errors

Test Coverage:
✓ Negative stock prevention (rejects stock going below zero)
✓ Stock transfer validation (prevents transferring more than available)
✓ Non-tracked product behavior (allows unlimited orders for digital products)

These tests verify the inventory system prevents overselling and maintains stock accuracy.
"""
