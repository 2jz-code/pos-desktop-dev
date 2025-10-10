"""
Order Management Tests - Priority 2A (Week 1, Day 3-5)

These tests verify that order creation, modification, and lifecycle management
work correctly with proper tenant isolation and financial calculations.

Priority: HIGH - Orders are the revenue-generating core of the POS system
Status: Week 1, Day 3-5
"""
import pytest
from decimal import Decimal
from django.utils import timezone

from tenant.managers import set_current_tenant
from orders.models import Order, OrderItem, OrderDiscount
from orders.services import OrderService, GuestSessionService
from products.models import Product, ModifierSet, ModifierOption
from discounts.models import Discount


@pytest.mark.django_db
class TestOrderCreation:
    """Test order creation with items and modifiers"""

    def test_create_order_with_single_item(
        self, tenant_a, admin_user_tenant_a, product_tenant_a, global_settings_tenant_a
    ):
        """
        CRITICAL: Verify order creation with a single item calculates totals correctly

        Business Impact: Every order must calculate subtotal, tax, and grand total accurately
        Security Impact: Order must be assigned to correct tenant
        """
        # Set tenant context
        set_current_tenant(tenant_a)

        # Create order
        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            customer=None,
            tenant=tenant_a
        )

        # Verify order created with correct tenant
        assert order.tenant == tenant_a, "Order not assigned to correct tenant"
        assert order.status == Order.OrderStatus.PENDING, "Order status should be PENDING"
        assert order.payment_status == Order.PaymentStatus.UNPAID, "Payment status should be UNPAID"

        # Add item to order
        OrderService.add_item_to_order(
            order=order,
            product=product_tenant_a,
            quantity=2,
            selected_modifiers=[],
            notes=""
        )

        # Refresh order from database
        order.refresh_from_db()

        # Verify calculations
        expected_subtotal = product_tenant_a.price * 2  # $15.99 * 2 = $31.98
        assert order.subtotal == expected_subtotal, f"Subtotal incorrect: {order.subtotal} != {expected_subtotal}"

        # Tax should be 10% (from global_settings_tenant_a)
        expected_tax = expected_subtotal * Decimal('0.10')  # $3.20 (rounded)
        assert abs(order.tax_total - expected_tax) < Decimal('0.01'), f"Tax incorrect: {order.tax_total} != {expected_tax}"

        expected_grand_total = expected_subtotal + expected_tax  # $35.18
        assert abs(order.grand_total - expected_grand_total) < Decimal('0.01'), f"Grand total incorrect: {order.grand_total} != {expected_grand_total}"

        # Verify item count
        assert order.items.count() == 1, "Order should have 1 item"

    def test_create_order_with_modifiers(
        self, tenant_a, admin_user_tenant_a, product_tenant_a,
        modifier_set_tenant_a, modifier_option_tenant_a, global_settings_tenant_a
    ):
        """
        Verify order with product modifiers calculates prices correctly

        Business Impact: Modifiers (like "Large", "Extra Cheese") affect item pricing
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        # Add item with modifier
        # Product: $15.99, Modifier: +$3.00, Total: $18.99 per item
        # Use force_add=True to bypass modifier validation (for test simplicity)
        OrderService.add_item_to_order(
            order=order,
            product=product_tenant_a,
            quantity=1,
            selected_modifiers=[{
                'option_id': modifier_option_tenant_a.id,
                'quantity': 1
            }],
            notes="",
            force_add=True  # Skip validation for test purposes
        )

        order.refresh_from_db()

        # Verify price includes modifier
        expected_item_price = product_tenant_a.price + modifier_option_tenant_a.price_delta
        assert order.subtotal == expected_item_price, f"Subtotal should include modifier: {order.subtotal} != {expected_item_price}"

    def test_create_order_with_multiple_items(
        self, tenant_a, admin_user_tenant_a, product_tenant_a, category_tenant_a,
        product_type_tenant_a, global_settings_tenant_a
    ):
        """
        Verify order with multiple different products calculates correctly

        Business Impact: Multi-item orders are common in POS systems
        """
        set_current_tenant(tenant_a)

        # Create second product
        product2 = Product.objects.create(
            name='Margherita Pizza',
            price=Decimal('12.99'),
            tenant=tenant_a,
            category=category_tenant_a,
            product_type=product_type_tenant_a,
            is_active=True
        )

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        # Add two different products
        OrderService.add_item_to_order(order, product_tenant_a, quantity=1)
        OrderService.add_item_to_order(order, product2, quantity=2)

        order.refresh_from_db()

        # Verify calculations
        expected_subtotal = product_tenant_a.price + (product2.price * 2)  # $15.99 + ($12.99 * 2) = $41.97
        assert order.subtotal == expected_subtotal, f"Subtotal incorrect: {order.subtotal} != {expected_subtotal}"
        assert order.items.count() == 2, "Order should have 2 items"


@pytest.mark.django_db
class TestOrderDiscounts:
    """Test discount application to orders"""

    def test_apply_percentage_discount_to_order(
        self, tenant_a, admin_user_tenant_a, product_tenant_a,
        discount_tenant_a, global_settings_tenant_a
    ):
        """
        Verify percentage discount (10% off) calculates correctly

        Business Impact: Discounts affect revenue and must calculate accurately
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        # Add item: $15.99
        OrderService.add_item_to_order(order, product_tenant_a, quantity=1)

        # Apply 10% discount
        OrderService.apply_discount_to_order_by_code(order, 'SAVE10')

        order.refresh_from_db()

        # Verify discount applied
        expected_discount = order.subtotal * Decimal('0.10')  # $1.60
        assert abs(order.total_discounts_amount - expected_discount) < Decimal('0.01'), \
            f"Discount amount incorrect: {order.total_discounts_amount} != {expected_discount}"

        # Verify grand total reduced
        post_discount_subtotal = order.subtotal - order.total_discounts_amount  # $14.39
        expected_tax = post_discount_subtotal * Decimal('0.10')  # $1.44
        expected_grand_total = post_discount_subtotal + expected_tax  # $15.83
        assert abs(order.grand_total - expected_grand_total) < Decimal('0.01'), \
            f"Grand total with discount incorrect: {order.grand_total} != {expected_grand_total}"

    def test_apply_fixed_amount_discount_to_order(
        self, tenant_b, admin_user_tenant_b, product_tenant_b,
        discount_tenant_b, global_settings_tenant_b
    ):
        """
        Verify fixed amount discount ($5 off) calculates correctly

        Business Impact: Fixed discounts are common for promotions
        """
        set_current_tenant(tenant_b)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_b,
            tenant=tenant_b
        )

        # Add item: $8.99
        OrderService.add_item_to_order(order, product_tenant_b, quantity=2)  # $17.98

        # Apply $5 off discount
        OrderService.apply_discount_to_order_by_code(order, 'SAVE5')

        order.refresh_from_db()

        # Verify discount applied
        assert order.total_discounts_amount == Decimal('5.00'), \
            f"Fixed discount should be $5.00: {order.total_discounts_amount}"

        # Verify grand total
        post_discount_subtotal = order.subtotal - Decimal('5.00')  # $12.98
        expected_tax = post_discount_subtotal * Decimal('0.08')  # $1.04 (8% tax for tenant B)
        expected_grand_total = post_discount_subtotal + expected_tax  # $14.02
        assert abs(order.grand_total - expected_grand_total) < Decimal('0.01'), \
            f"Grand total with fixed discount incorrect: {order.grand_total} != {expected_grand_total}"


@pytest.mark.django_db
class TestOrderItemManagement:
    """Test order item quantity updates and removal"""

    def test_update_order_item_quantity(
        self, tenant_a, admin_user_tenant_a, product_tenant_a, global_settings_tenant_a
    ):
        """
        Verify updating item quantity recalculates order totals

        Business Impact: Cashiers frequently adjust quantities during order building
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        # Add item with quantity 1
        OrderService.add_item_to_order(order, product_tenant_a, quantity=1)
        order.refresh_from_db()

        initial_total = order.grand_total

        # Update quantity to 3
        order_item = order.items.first()
        OrderService.update_item_quantity(order_item, 3)

        order.refresh_from_db()

        # Verify total updated (should be ~3x the original)
        assert order.grand_total > initial_total, "Grand total should increase when quantity increases"
        assert order_item.quantity == 3, "Item quantity should be updated to 3"

    def test_remove_order_item(
        self, tenant_a, admin_user_tenant_a, product_tenant_a, global_settings_tenant_a
    ):
        """
        Verify removing an item recalculates order totals

        Business Impact: Customers change their minds, items must be removable
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        # Add two items
        OrderService.add_item_to_order(order, product_tenant_a, quantity=2)
        order.refresh_from_db()

        assert order.items.count() == 1, "Should have 1 item"

        # Remove all items
        order.items.all().delete()
        OrderService.recalculate_order_totals(order)

        order.refresh_from_db()

        # Verify order is empty
        assert order.items.count() == 0, "Order should have no items"
        assert order.subtotal == Decimal('0.00'), "Subtotal should be $0.00"
        assert order.grand_total == Decimal('0.00'), "Grand total should be $0.00"


@pytest.mark.django_db
class TestOrderStatusTransitions:
    """Test order status lifecycle and transitions"""

    def test_valid_status_transition_pending_to_completed(
        self, tenant_a, admin_user_tenant_a, product_tenant_a, global_settings_tenant_a
    ):
        """
        Verify valid status transition from PENDING to COMPLETED

        Business Impact: Orders must transition through valid states
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        # Order starts as PENDING
        assert order.status == Order.OrderStatus.PENDING

        # Transition to COMPLETED (simulated - normally done through payment)
        OrderService.update_order_status(order, Order.OrderStatus.COMPLETED)

        order.refresh_from_db()
        assert order.status == Order.OrderStatus.COMPLETED, "Order status should transition to COMPLETED"

    def test_invalid_status_transition_completed_to_pending(
        self, tenant_a, admin_user_tenant_a, global_settings_tenant_a
    ):
        """
        Verify invalid status transition from COMPLETED to PENDING is rejected

        Business Impact: Completed orders cannot be reopened for editing
        Security Impact: Prevents order tampering after completion
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        # Complete the order
        order.status = Order.OrderStatus.COMPLETED
        order.save()

        # Try to transition back to PENDING (should fail)
        with pytest.raises(ValueError, match="Cannot transition"):
            OrderService.update_order_status(order, Order.OrderStatus.PENDING)

    def test_cancel_order(
        self, tenant_a, admin_user_tenant_a, product_tenant_a, global_settings_tenant_a
    ):
        """
        Verify order cancellation sets status to CANCELLED

        Business Impact: Cancelled orders must be tracked separately
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        OrderService.add_item_to_order(order, product_tenant_a, quantity=1)

        # Cancel order
        OrderService.cancel_order(order)

        order.refresh_from_db()
        assert order.status == Order.OrderStatus.CANCELLED, "Order should be CANCELLED"


@pytest.mark.django_db
class TestTaxCalculations:
    """Test per-tenant tax calculation"""

    def test_tax_calculation_tenant_a(
        self, tenant_a, admin_user_tenant_a, product_tenant_a, global_settings_tenant_a
    ):
        """
        Verify tenant A uses 10% tax rate

        Business Impact: Each tenant has independent tax rates based on jurisdiction
        """
        set_current_tenant(tenant_a)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_a,
            tenant=tenant_a
        )

        OrderService.add_item_to_order(order, product_tenant_a, quantity=1)
        order.refresh_from_db()

        # Tenant A has 10% tax rate
        expected_tax = order.subtotal * Decimal('0.10')
        assert abs(order.tax_total - expected_tax) < Decimal('0.01'), \
            f"Tenant A tax should be 10%: {order.tax_total} != {expected_tax}"

    def test_tax_calculation_tenant_b(
        self, tenant_b, admin_user_tenant_b, product_tenant_b, global_settings_tenant_b
    ):
        """
        Verify tenant B uses 8% tax rate (different from tenant A)

        Business Impact: Multi-tenant systems must support different tax rates per tenant
        """
        set_current_tenant(tenant_b)

        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=admin_user_tenant_b,
            tenant=tenant_b
        )

        OrderService.add_item_to_order(order, product_tenant_b, quantity=1)
        order.refresh_from_db()

        # Tenant B has 8% tax rate
        expected_tax = order.subtotal * Decimal('0.08')
        assert abs(order.tax_total - expected_tax) < Decimal('0.01'), \
            f"Tenant B tax should be 8%: {order.tax_total} != {expected_tax}"


@pytest.mark.django_db
class TestGuestOrders:
    """Test guest order creation and conversion"""

    def test_create_guest_order(self, tenant_a, global_settings_tenant_a):
        """
        Verify guest orders can be created without authentication

        Business Impact: Guest checkout increases conversion rates
        """
        set_current_tenant(tenant_a)

        # Mock request with session
        from django.test import RequestFactory
        from django.contrib.sessions.middleware import SessionMiddleware

        factory = RequestFactory()
        request = factory.get('/')
        request.tenant = tenant_a

        # Add session to request
        middleware = SessionMiddleware(lambda x: None)
        middleware.process_request(request)
        request.session.save()

        # Create guest order
        order = GuestSessionService.create_guest_order(request, order_type=Order.OrderType.WEB)

        # Verify guest order created
        assert order.tenant == tenant_a, "Guest order not assigned to correct tenant"
        assert order.guest_id is not None, "Guest order should have guest_id"
        assert order.customer is None, "Guest order should not have customer"
        assert order.status == Order.OrderStatus.PENDING, "Guest order should be PENDING"

    def test_convert_guest_order_to_user(
        self, tenant_a, customer_tenant_a, product_tenant_a, global_settings_tenant_a
    ):
        """
        Verify guest order can be converted to authenticated user order

        Business Impact: Allows users to create account after placing order
        """
        set_current_tenant(tenant_a)

        # Create guest order
        from django.test import RequestFactory
        from django.contrib.sessions.middleware import SessionMiddleware

        factory = RequestFactory()
        request = factory.get('/')
        request.tenant = tenant_a

        middleware = SessionMiddleware(lambda x: None)
        middleware.process_request(request)
        request.session.save()

        guest_order = GuestSessionService.create_guest_order(request)

        # Add item
        OrderService.add_item_to_order(guest_order, product_tenant_a, quantity=1)

        # Convert to customer order (Order.customer expects Customer, not User)
        GuestSessionService.convert_guest_to_user(guest_order, customer_tenant_a)

        guest_order.refresh_from_db()

        # Verify conversion
        assert guest_order.customer == customer_tenant_a, "Order should now be linked to customer"
        assert guest_order.guest_id is None, "guest_id should be cleared after conversion"
