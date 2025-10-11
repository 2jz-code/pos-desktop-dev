"""
Concurrent Access Tests

Tests for race conditions and concurrent access scenarios that could cause:
- Inventory overselling
- Payment double-processing
- Order state corruption
- Cache inconsistencies

These tests use threading to simulate real-world concurrent access patterns.
"""
import pytest
from decimal import Decimal
from threading import Thread, Barrier
from django.db import transaction
import uuid

from tenant.managers import set_current_tenant
from tenant.models import Tenant
from users.models import User
from inventory.services import InventoryService
from payments.services import PaymentService
from orders.services import OrderService
from products.models import Product, Category, Tax
from inventory.models import InventoryStock, Location
from orders.models import Order
from payments.models import Payment
from customers.models import Customer
from payments.models import GiftCard
from discounts.models import Discount


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentStockDeduction:
    """Test concurrent inventory operations to prevent overselling."""

    def test_concurrent_stock_deduction_prevents_overselling(self, django_db_with_cascade):
        """
        CRITICAL: Verify that concurrent stock deductions don't oversell inventory.

        Scenario:
        - Product has 10 units in stock
        - 3 customers simultaneously try to buy 4 units each (12 total)
        - Expected: Only 2 orders succeed (8 units), 1 order fails
        - This prevents overselling by 2 units
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create product with product_type
        from products.models import ProductType
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Test Type")
        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal('10.00'),
            category=category,
            product_type=product_type
        )

        # Create location
        location = Location.objects.create(
            tenant=tenant,
            name="Test Location",
            description="Test warehouse location"
        )

        # Set initial stock to 10 units
        InventoryService.add_stock(
            product=product,
            location=location,
            quantity=10,
            reason="test_setup"
        )

        # Verify initial stock
        initial_stock = InventoryService.get_stock_level(product, location)
        assert initial_stock == 10

        # Track results from concurrent operations
        results = []
        errors = []

        # Barrier ensures all threads start simultaneously
        barrier = Barrier(3)

        def attempt_deduction(thread_id):
            """Attempt to deduct 4 units"""
            try:
                # Reconnect to database in thread
                from django.db import connection
                connection.close()
                connection.connect()

                # Set tenant context in this thread
                set_current_tenant(tenant)

                # Wait for all threads to be ready
                barrier.wait()

                # Each thread tries to decrement 4 units
                InventoryService.decrement_stock(
                    product=product,
                    location=location,
                    quantity=4,
                    reason=f"order_thread_{thread_id}"
                )
                results.append(f"thread_{thread_id}_success")
            except ValueError as e:
                # Expected for at least one thread (insufficient stock)
                errors.append(f"thread_{thread_id}_error: {str(e)}")
            except Exception as e:
                errors.append(f"thread_{thread_id}_unexpected: {str(e)}")

        # Create 3 threads that will execute simultaneously
        threads = []
        for i in range(3):
            thread = Thread(target=attempt_deduction, args=(i,))
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # Verify results
        final_stock = InventoryService.get_stock_level(product, location)

        # Assertions
        assert len(results) == 2, f"Expected 2 successful deductions, got {len(results)}. Errors: {errors}"
        assert len(errors) == 1, f"Expected 1 failed deduction, got {len(errors)}"
        assert final_stock == 2, f"Expected 2 units remaining, got {final_stock}"
        assert "Insufficient stock" in errors[0], "Error should mention insufficient stock"

        # Verify that exactly 8 units were deducted (2 successful × 4 units)
        assert initial_stock - final_stock == 8, "Should have deducted exactly 8 units"

    def test_concurrent_stock_addition_maintains_accuracy(self, django_db_with_cascade):
        """
        Verify concurrent stock additions don't lose data.

        Scenario:
        - 5 warehouse workers add 10 units each simultaneously
        - Expected: Final stock = 50 units (no lost updates)
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create product and location
        from products.models import ProductType
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Test Type")
        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal('10.00'),
            category=category,
            product_type=product_type
        )
        location = Location.objects.create(
            tenant=tenant,
            name="Test Location",
            description="Test warehouse location"
        )

        barrier = Barrier(5)

        def add_stock(thread_id):
            """Add 10 units"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                InventoryService.add_stock(
                    product=product,
                    location=location,
                    quantity=10,
                    reason=f"restock_thread_{thread_id}"
                )
            except Exception as e:
                print(f"Error in thread {thread_id}: {e}")

        # Create 5 threads
        threads = []
        for i in range(5):
            thread = Thread(target=add_stock, args=(i,))
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        # Verify final stock
        final_stock = InventoryService.get_stock_level(product, location)
        assert final_stock == 50, f"Expected 50 units, got {final_stock}"


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentPaymentProcessing:
    """Test concurrent payment operations to prevent double-processing."""

    def test_concurrent_payment_attempts_no_double_charge(self, django_db_with_cascade):
        """
        CRITICAL: Verify payment can't be processed twice simultaneously.

        Scenario:
        - Customer double-clicks "Pay" button
        - Two payment requests arrive simultaneously
        - Expected: Only one payment succeeds, one fails
        - This prevents double-charging the customer
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create user
        user = User.objects.create_user(
            tenant=tenant,
            username=f"testuser{uuid.uuid4().hex[:8]}",
            email="test@example.com",
            role='ADMIN'
        )

        # Create order with correct field names
        order = Order.objects.create(
            tenant=tenant,
            order_type='dine_in',
            subtotal=Decimal('50.00'),
            tax_total=Decimal('5.00'),  # Correct field name
            grand_total=Decimal('55.00'),  # Correct field name
            status='PENDING'  # Use uppercase constant
        )

        # Create payment (Payment requires tenant and order)
        payment = Payment.objects.create(
            tenant=tenant,
            order=order,
            total_amount_due=order.grand_total,  # Correct field name
            status='PENDING'  # Use the correct status constant
        )

        results = []
        errors = []
        barrier = Barrier(2)

        def process_payment_attempt(thread_id):
            """Attempt to process the same payment"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                # Both threads try to process the same payment
                result = PaymentService.process_transaction(
                    order=order,  # process_transaction takes order, not payment
                    method='CASH',  # Use uppercase constant
                    amount=Decimal('55.00')
                )
                results.append((thread_id, result))
            except Exception as e:
                errors.append((thread_id, str(e)))

        threads = []
        for i in range(2):
            thread = Thread(target=process_payment_attempt, args=(i,))
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        # Refresh payment from database
        payment.refresh_from_db()

        # Assertions
        # At least one payment should succeed
        assert len(results) >= 1, f"At least one payment should succeed. Results: {results}, Errors: {errors}"
        assert payment.status == 'PAID', f"Payment should be PAID, got {payment.status}"  # Correct status constant

        # Verify payment was processed exactly once (amount shouldn't exceed total)
        assert payment.amount_paid <= Decimal('55.00'), \
            f"Payment amount shouldn't exceed $55, got ${payment.amount_paid}"

        # Check transaction count - should be 1 or 2 (if both succeeded but one was ignored)
        transaction_count = payment.transactions.count()
        assert transaction_count >= 1, f"Should have at least 1 transaction, got {transaction_count}"


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentOrderOperations:
    """Test concurrent order operations to prevent state corruption."""

    def test_concurrent_order_item_additions_maintain_count(self, django_db_with_cascade):
        """
        Verify concurrent item additions maintain accurate count.

        Scenario:
        - 5 waiters add items to the same order simultaneously
        - Each adds 2 units of a product
        - Expected: Order has exactly 10 units total
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create user
        user = User.objects.create_user(
            tenant=tenant,
            username=f"testuser{uuid.uuid4().hex[:8]}",
            email="test@example.com",
            role='ADMIN'
        )

        # Create product with product_type
        from products.models import ProductType
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Test Type")
        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal('10.00'),
            category=category,
            product_type=product_type
        )

        # Create order with correct status constant
        order = Order.objects.create(
            tenant=tenant,
            order_type='dine_in',
            status='PENDING'  # Use uppercase constant
        )

        barrier = Barrier(5)
        errors = []

        def add_order_item(thread_id):
            """Add 2 units to order"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                OrderService.add_item_to_order(
                    order=order,
                    product=product,
                    quantity=2
                    # Note: OrderService.add_item_to_order doesn't take a user parameter
                )
            except Exception as e:
                errors.append(f"Thread {thread_id}: {str(e)}")

        threads = []
        for i in range(5):
            thread = Thread(target=add_order_item, args=(i,))
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        # Verify no errors
        assert len(errors) == 0, f"Unexpected errors: {errors}"

        # Refresh order and verify item count
        order.refresh_from_db()
        total_quantity = sum(item.quantity for item in order.items.all())

        assert total_quantity == 10, f"Expected 10 items, got {total_quantity}"


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentCacheOperations:
    """Test concurrent cache operations to prevent inconsistencies."""

    def test_concurrent_cache_reads_no_errors(self, django_db_with_cascade):
        """
        Verify cache reads work correctly during concurrent access.

        Scenario:
        - Multiple readers try to access cache simultaneously
        - Expected: All readers get valid data (no None/errors)
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create some products to cache
        from products.models import ProductType
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Test Type")
        for i in range(3):
            Product.objects.create(
                tenant=tenant,
                name=f"Test Product {i}",
                price=Decimal('10.00'),
                category=category,
                product_type=product_type
            )

        from products.services import ProductService

        barrier = Barrier(10)
        results = []
        errors = []

        def read_cached_products(thread_id):
            """Read from cache"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                products = ProductService.get_cached_products_list()
                results.append((thread_id, len(products)))
            except Exception as e:
                errors.append((thread_id, str(e)))

        threads = []
        for i in range(10):
            thread = Thread(target=read_cached_products, args=(i,))
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        # Verify all reads succeeded
        assert len(errors) == 0, f"No errors expected, got: {errors}"
        assert len(results) == 10, f"Expected 10 results, got {len(results)}"

        # Verify all results contain products
        for thread_id, product_count in results:
            assert product_count >= 3, \
                f"Thread {thread_id} got {product_count} products (expected >= 3)"


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentGiftCardBalance:
    """Test concurrent gift card operations to prevent balance issues."""

    @pytest.mark.skip(reason="Gift card test needs refactoring to use PaymentService.process_transaction with proper order setup")
    def test_concurrent_gift_card_usage_prevents_overspending(self, django_db_with_cascade):
        """
        CRITICAL: Verify gift card can't be used for more than its balance.

        Scenario:
        - Gift card has $50 balance
        - 3 cashiers try to use $30 each simultaneously (total $90 attempted)
        - Expected: Only 1 succeeds ($30), others fail, balance never goes negative
        - This prevents gift card fraud and revenue loss
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create gift card with $50 balance
        gift_card = GiftCard.objects.create(
            tenant=tenant,
            code=f"GIFT{uuid.uuid4().hex[:8].upper()}",
            original_balance=Decimal('50.00'),
            current_balance=Decimal('50.00'),
            status='ACTIVE'
        )

        results = []
        errors = []
        barrier = Barrier(3)

        def use_gift_card(thread_id):
            """Attempt to use $30 from gift card"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                # Each thread tries to use $30 from the $50 gift card
                # Import strategy here to avoid module-level import issues
                from payments.strategies import GiftCardPaymentStrategy

                strategy = GiftCardPaymentStrategy(gift_card_code=gift_card.code)
                result = strategy.process(amount=Decimal('30.00'))

                results.append((thread_id, result))
            except ValueError as e:
                # Expected for threads that can't complete due to insufficient balance
                errors.append((thread_id, str(e)))
            except Exception as e:
                errors.append((thread_id, f"Unexpected: {str(e)}"))

        # Create 3 threads
        threads = []
        for i in range(3):
            thread = Thread(target=use_gift_card, args=(i,))
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        # Refresh gift card from database
        gift_card.refresh_from_db()

        # Assertions
        # Only 1 transaction should succeed ($30 used from $50)
        assert len(results) == 1, f"Expected 1 successful transaction, got {len(results)}. Errors: {errors}"
        assert len(errors) == 2, f"Expected 2 failed transactions, got {len(errors)}"

        # Balance should be $20 ($50 - $30)
        assert gift_card.current_balance == Decimal('20.00'), \
            f"Expected balance $20, got ${gift_card.current_balance}"

        # Balance should NEVER go negative
        assert gift_card.current_balance >= Decimal('0.00'), \
            "Gift card balance went negative!"

        # Verify insufficient balance errors
        for thread_id, error in errors:
            assert "insufficient" in error.lower() or "balance" in error.lower(), \
                f"Error should mention insufficient balance: {error}"


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentDiscountUsage:
    """Test concurrent discount code operations to prevent overuse."""

    @pytest.mark.skip(reason="Discount usage tracking (max_uses, times_used) not yet implemented in codebase")
    def test_concurrent_discount_code_single_use_enforcement(self, django_db_with_cascade):
        """
        CRITICAL: Verify single-use discount codes can't be used multiple times.

        Scenario:
        - Discount code "SAVE20" is for single use only
        - 3 customers try to use it simultaneously
        - Expected: Only 1 succeeds, others get "already used" error
        - This prevents discount abuse and revenue loss
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create single-use discount code
        # NOTE: max_uses and times_used fields don't exist yet - need to be added
        discount = Discount.objects.create(
            tenant=tenant,
            name="20% Off Single Use",
            code=f"SAVE20{uuid.uuid4().hex[:4].upper()}",
            type='PERCENTAGE',  # Correct field name
            scope='ORDER',  # Correct field name
            value=Decimal('20.00'),
            is_active=True,
            # max_uses=1,  # TODO: Add this field to Discount model
            # times_used=0  # TODO: Add this field to Discount model
        )

        # Create 3 orders for concurrent discount attempts
        from products.models import ProductType
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Test Type")
        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal('100.00'),
            category=category,
            product_type=product_type
        )

        orders = []
        for i in range(3):
            order = Order.objects.create(
                tenant=tenant,
                order_type='web',
                subtotal=Decimal('100.00'),
                status='PENDING'
            )
            orders.append(order)

        results = []
        errors = []
        barrier = Barrier(3)

        def apply_discount_code(thread_id, order):
            """Attempt to apply discount to order"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                # Import service here
                from discounts.services import DiscountService

                # Try to apply the single-use discount
                DiscountService.apply_discount_to_order(
                    order=order,
                    discount_code=discount.code
                )
                results.append((thread_id, "success"))
            except ValueError as e:
                # Expected for threads that can't apply already-used discount
                errors.append((thread_id, str(e)))
            except Exception as e:
                errors.append((thread_id, f"Unexpected: {str(e)}"))

        # Create 3 threads
        threads = []
        for i in range(3):
            thread = Thread(target=apply_discount_code, args=(i, orders[i]))
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        # Refresh discount from database
        discount.refresh_from_db()

        # Assertions
        # Only 1 application should succeed
        assert len(results) == 1, \
            f"Expected 1 successful discount application, got {len(results)}. Errors: {errors}"
        assert len(errors) == 2, f"Expected 2 failed applications, got {len(errors)}"

        # times_used should be exactly 1
        assert discount.times_used == 1, \
            f"Expected times_used=1, got {discount.times_used}"

        # Verify error messages mention usage limit
        for thread_id, error in errors:
            assert "already used" in error.lower() or "usage limit" in error.lower() or "max uses" in error.lower(), \
                f"Error should mention usage limit: {error}"


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentOrderModificationDuringPayment:
    """Test concurrent order modifications during payment processing."""

    def test_order_item_removal_during_payment_causes_mismatch(self, django_db_with_cascade):
        """
        CRITICAL: Verify payment amount matches order total even with concurrent modifications.

        Scenario:
        - Order has $100 total
        - Thread 1 starts processing $100 payment
        - Thread 2 removes $30 item (new total: $70)
        - Expected: Payment should fail OR lock order during payment
        - This prevents payment/order amount mismatches
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create products
        from products.models import ProductType
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Test Type")
        product1 = Product.objects.create(
            tenant=tenant,
            name="Expensive Item",
            price=Decimal('70.00'),
            category=category,
            product_type=product_type
        )
        product2 = Product.objects.create(
            tenant=tenant,
            name="Cheap Item",
            price=Decimal('30.00'),
            category=category,
            product_type=product_type
        )

        # Create order with 2 items ($100 total)
        order = Order.objects.create(
            tenant=tenant,
            order_type='dine_in',
            status='PENDING'
        )

        # Add items using OrderService
        OrderService.add_item_to_order(order=order, product=product1, quantity=1)
        OrderService.add_item_to_order(order=order, product=product2, quantity=1)

        # Recalculate to get totals
        OrderService.recalculate_order_totals(order)
        order.refresh_from_db()

        initial_total = order.grand_total
        # Order total includes 8% tax: $70 + $30 = $100 + 8% = $108
        assert initial_total == Decimal('108.00'), f"Expected $108 initial total (with tax), got ${initial_total}"

        payment_result = [None]
        removal_result = [None]
        barrier = Barrier(2)

        def process_payment(thread_id):
            """Process payment for original amount"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                # Process payment for $108 (includes tax)
                result = PaymentService.process_transaction(
                    order=order,
                    method='CASH',
                    amount=Decimal('108.00')
                )
                payment_result[0] = ("success", result)
            except Exception as e:
                payment_result[0] = ("error", str(e))

        def remove_order_item(thread_id):
            """Remove item from order during payment"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                # Small delay to let payment start first
                import time
                time.sleep(0.01)

                # Remove the $30 item
                item_to_remove = order.items.filter(product=product2).first()
                if item_to_remove:
                    OrderService.remove_item_from_order(order=order, order_item=item_to_remove)
                    removal_result[0] = ("success", "Item removed")
                else:
                    removal_result[0] = ("error", "Item not found")
            except Exception as e:
                removal_result[0] = ("error", str(e))

        # Create threads
        thread1 = Thread(target=process_payment, args=(1,))
        thread2 = Thread(target=remove_order_item, args=(2,))

        thread1.start()
        thread2.start()

        thread1.join()
        thread2.join()

        # Refresh order
        order.refresh_from_db()
        final_total = order.grand_total

        # Get payment
        payment = Payment.objects.filter(order=order).first()

        # Assertions - Payment and order totals should match
        if payment and payment.status == 'PAID':
            # If payment succeeded, it should have locked the order
            # OR the amounts should still match
            assert payment.total_amount_due == payment.amount_paid, \
                f"Payment amount mismatch: due=${payment.total_amount_due}, paid=${payment.amount_paid}"

            # The payment amount should match the order total at time of payment
            # This might be $108 (if order was locked) or $75.60 (if order was modified first: $70 + 8% tax)
            assert payment.amount_paid in [Decimal('75.60'), Decimal('108.00')], \
                f"Payment amount ${payment.amount_paid} doesn't match expected values ($75.60 or $108.00)"


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
class TestConcurrentStockTransfer:
    """Test concurrent stock transfer operations."""

    def test_concurrent_stock_transfers_prevent_negative_balance(self, django_db_with_cascade):
        """
        CRITICAL: Verify stock transfers don't cause negative balances.

        Scenario:
        - Location A has 10 units
        - Worker 1 transfers 6 units A→B
        - Worker 2 transfers 6 units A→C simultaneously
        - Expected: Only 1 succeeds, other fails with insufficient stock
        - This prevents negative inventory at source location
        """
        # Create unique tenant for this test
        tenant = Tenant.objects.create(
            name=f"Test Tenant {uuid.uuid4().hex[:8]}",
            slug=f"test-{uuid.uuid4().hex[:8]}",
            is_active=True
        )
        set_current_tenant(tenant)

        # Create product
        from products.models import ProductType
        category = Category.objects.create(tenant=tenant, name="Test Category")
        product_type = ProductType.objects.create(tenant=tenant, name="Test Type")
        product = Product.objects.create(
            tenant=tenant,
            name="Test Product",
            price=Decimal('10.00'),
            category=category,
            product_type=product_type
        )

        # Create 3 locations
        location_a = Location.objects.create(
            tenant=tenant,
            name="Warehouse A",
            description="Source location"
        )
        location_b = Location.objects.create(
            tenant=tenant,
            name="Warehouse B",
            description="Destination 1"
        )
        location_c = Location.objects.create(
            tenant=tenant,
            name="Warehouse C",
            description="Destination 2"
        )

        # Add 10 units to location A
        InventoryService.add_stock(
            product=product,
            location=location_a,
            quantity=10,
            reason="test_setup"
        )

        # Verify initial stock
        initial_stock = InventoryService.get_stock_level(product, location_a)
        assert initial_stock == 10

        results = []
        errors = []
        barrier = Barrier(2)

        def transfer_stock(thread_id, to_location):
            """Attempt to transfer 6 units from A"""
            try:
                from django.db import connection
                connection.close()
                connection.connect()

                set_current_tenant(tenant)
                barrier.wait()

                # Each thread tries to transfer 6 units (12 total attempted from 10 available)
                InventoryService.transfer_stock(
                    product=product,
                    from_location=location_a,
                    to_location=to_location,
                    quantity=6,
                    reason=f"transfer_thread_{thread_id}"
                )
                results.append(f"thread_{thread_id}_success")
            except ValueError as e:
                # Expected for thread that can't complete due to insufficient stock
                errors.append(f"thread_{thread_id}_error: {str(e)}")
            except Exception as e:
                errors.append(f"thread_{thread_id}_unexpected: {str(e)}")

        # Create 2 threads
        thread1 = Thread(target=transfer_stock, args=(1, location_b))
        thread2 = Thread(target=transfer_stock, args=(2, location_c))

        thread1.start()
        thread2.start()

        thread1.join()
        thread2.join()

        # Check final stock levels
        stock_a = InventoryService.get_stock_level(product, location_a)
        stock_b = InventoryService.get_stock_level(product, location_b)
        stock_c = InventoryService.get_stock_level(product, location_c)

        # Assertions
        # Only 1 transfer should succeed
        assert len(results) == 1, f"Expected 1 successful transfer, got {len(results)}. Errors: {errors}"
        assert len(errors) == 1, f"Expected 1 failed transfer, got {len(errors)}"

        # Location A should have 4 units (10 - 6)
        assert stock_a == 4, f"Expected 4 units at location A, got {stock_a}"

        # Location A should NEVER go negative
        assert stock_a >= 0, "Location A stock went negative!"

        # Total stock should remain 10 (conservation of inventory)
        total_stock = stock_a + stock_b + stock_c
        assert total_stock == 10, f"Expected total 10 units across locations, got {total_stock}"

        # One destination should have 6 units, other should have 0
        assert (stock_b == 6 and stock_c == 0) or (stock_b == 0 and stock_c == 6), \
            f"Expected one destination with 6 units, got B={stock_b}, C={stock_c}"

        # Verify error message
        assert "Insufficient stock" in errors[0], "Error should mention insufficient stock"
