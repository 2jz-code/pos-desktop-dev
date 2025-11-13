"""
Discount Application Tests

Tests for discount application functionality including:
- Percentage discounts
- Fixed amount discounts
- BOGO (Buy X Get Y) discounts
- Minimum purchase requirements
- Product/category scoped discounts
- Discount stacking
- Expiration and validation
"""
import pytest
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone

from discounts.models import Discount
from discounts.services import DiscountService
from orders.models import Order, OrderItem
from orders.services import OrderService
from products.models import Product, Category
from tenant.managers import set_current_tenant


@pytest.mark.django_db
class TestDiscountApplication:
    """Test discount application functionality"""

    def test_apply_percentage_discount(self, tenant_a, order_tenant_a, product_tenant_a):
        """Test applying a 10% percentage discount to an order"""
        set_current_tenant(tenant_a)

        # Add items to order to have $100 subtotal
        # product_tenant_a is $10, so add 10 of them
        OrderService.add_item_to_order(
            order=order_tenant_a,
            product=product_tenant_a,
            quantity=10
        )

        # Create a 10% discount
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="10% Off",
            code="SAVE10",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("10.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Apply the discount
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount
        )

        # Refresh order from database to get updated totals
        order_tenant_a.refresh_from_db()

        # Verify discount amount: 10% of $100 = $10
        assert order_tenant_a.total_discounts_amount == Decimal("10.00")
        assert order_tenant_a.total_discounts_amount > 0

    def test_apply_fixed_amount_discount(self, tenant_a, order_tenant_a, product_tenant_a):
        """Test applying a $5 fixed amount discount to an order"""
        set_current_tenant(tenant_a)

        # Add items to order to have $50 subtotal
        # product_tenant_a is $10, so add 5 of them
        OrderService.add_item_to_order(
            order=order_tenant_a,
            product=product_tenant_a,
            quantity=5
        )

        # Create a $5 off discount
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="$5 Off",
            code="SAVE5",
            type=Discount.DiscountType.FIXED_AMOUNT,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("5.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Apply the discount
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount
        )

        # Refresh order from database to get updated totals
        order_tenant_a.refresh_from_db()

        # Verify discount amount: $5 off
        assert order_tenant_a.total_discounts_amount == Decimal("5.00")
        assert order_tenant_a.total_discounts_amount > 0

    def test_apply_buy_x_get_y_discount(self, tenant_a, product_tenant_a, cashier_user_tenant_a):
        """Test applying a Buy 2 Get 1 Free discount"""
        set_current_tenant(tenant_a)

        # Create a Buy 2 Get 1 Free discount
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="Buy 2 Get 1 Free",
            code="BOGO",
            type=Discount.DiscountType.BUY_X_GET_Y,
            scope=Discount.DiscountScope.PRODUCT,
            value=Decimal("0.00"),  # Required field but not used for BOGO
            buy_quantity=2,
            get_quantity=1,
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )
        discount.applicable_products.add(product_tenant_a)

        # Create order and add 3 items of the same product
        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=cashier_user_tenant_a,
            tenant=tenant_a
        )

        OrderService.add_item_to_order(
            order=order,
            product=product_tenant_a,
            quantity=3
        )

        # Apply the discount
        DiscountService.apply_discount_to_order(
            order=order,
            discount=discount
        )

        # Refresh order from database to get updated totals
        order.refresh_from_db()

        # Verify discount applied (1 item free = product price)
        expected_discount = product_tenant_a.price
        assert order.total_discounts_amount == expected_discount

    def test_apply_discount_with_minimum_purchase(self, tenant_a, order_tenant_a, product_tenant_a):
        """Test discount with minimum purchase requirement"""
        set_current_tenant(tenant_a)

        # Create discount with $50 minimum
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="$10 Off $50+",
            code="MIN50",
            type=Discount.DiscountType.FIXED_AMOUNT,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("10.00"),
            min_purchase_amount=Decimal("50.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Test with order below minimum ($40 subtotal)
        # product_tenant_a is $10, so add 4 of them
        OrderService.add_item_to_order(
            order=order_tenant_a,
            product=product_tenant_a,
            quantity=4
        )

        # Try to apply discount (should not be applied due to minimum)
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount
        )
        order_tenant_a.refresh_from_db()

        # Discount should not be applied
        assert order_tenant_a.total_discounts_amount == Decimal("0.00")

        # Add 2 more items to meet minimum ($60 total)
        OrderService.add_item_to_order(
            order=order_tenant_a,
            product=product_tenant_a,
            quantity=2
        )

        # Refresh order to get updated subtotal
        order_tenant_a.refresh_from_db()

        # Should succeed now - subtotal should be $60
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount
        )
        order_tenant_a.refresh_from_db()

        assert order_tenant_a.total_discounts_amount == Decimal("10.00")

    def test_apply_discount_to_specific_products(self, tenant_a, product_tenant_a, cashier_user_tenant_a, product_type_tenant_a):
        """Test product-scoped discount (only applies to specific products)"""
        set_current_tenant(tenant_a)

        # Create a second product for tenant A (not eligible for discount)
        product_tenant_a_2 = Product.objects.create(
            tenant=tenant_a,
            name="Drink",
            price=Decimal("5.00"),
            product_type=product_type_tenant_a
        )

        # Create a discount that only applies to product_tenant_a (Pizza)
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="20% Off Pizza",
            code="PIZZA20",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.PRODUCT,
            value=Decimal("20.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )
        discount.applicable_products.add(product_tenant_a)

        # Create order with both pizza and drink
        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=cashier_user_tenant_a,
            tenant=tenant_a
        )

        OrderService.add_item_to_order(order=order, product=product_tenant_a, quantity=1)  # Pizza $10
        OrderService.add_item_to_order(order=order, product=product_tenant_a_2, quantity=1)  # Drink $5 (not discounted)

        # Apply the discount
        DiscountService.apply_discount_to_order(
            order=order,
            discount=discount
        )

        # Refresh order from database to get updated totals
        order.refresh_from_db()

        # Verify discount only applies to pizza: 20% of $10 = $2
        expected_discount = product_tenant_a.price * Decimal("0.20")
        assert order.total_discounts_amount == expected_discount

    def test_apply_discount_to_category(self, tenant_a, category_tenant_a, product_tenant_a, cashier_user_tenant_a, product_type_tenant_a):
        """Test category-scoped discount (applies to all products in category)"""
        set_current_tenant(tenant_a)

        # Associate product with category
        product_tenant_a.category = category_tenant_a
        product_tenant_a.save()

        # Create another product in the same category
        product2 = Product.objects.create(
            tenant=tenant_a,
            name="Another Pizza",
            price=Decimal("15.00"),
            category=category_tenant_a,
            product_type=product_type_tenant_a
        )

        # Create a category-scoped discount
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="20% Off Pizzas",
            code="PIZZA20",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.CATEGORY,
            value=Decimal("20.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )
        discount.applicable_categories.add(category_tenant_a)

        # Create order with both products from the category
        order = OrderService.create_order(
            order_type=Order.OrderType.POS,
            cashier=cashier_user_tenant_a,
            tenant=tenant_a
        )

        OrderService.add_item_to_order(order=order, product=product_tenant_a, quantity=1)  # $10
        OrderService.add_item_to_order(order=order, product=product2, quantity=1)  # $15

        # Apply the discount
        DiscountService.apply_discount_to_order(
            order=order,
            discount=discount
        )

        # Refresh order from database to get updated totals
        order.refresh_from_db()

        # Verify discount applies to both: 20% of ($10 + $15) = $5
        total_price = product_tenant_a.price + product2.price
        expected_discount = total_price * Decimal("0.20")
        assert order.total_discounts_amount == expected_discount

    def test_stacked_discounts_allowed(self, tenant_a, order_tenant_a, global_settings_tenant_a, product_tenant_a):
        """Test that multiple discounts can be applied when stacking is enabled"""
        set_current_tenant(tenant_a)

        # Enable discount stacking in settings
        global_settings_tenant_a.allow_discount_stacking = True
        global_settings_tenant_a.save()

        # Reload settings cache to pick up the change
        from settings.config import app_settings
        app_settings.reload()

        # Add items to order to have $100 subtotal
        # product_tenant_a is $10, so add 10 of them
        OrderService.add_item_to_order(
            order=order_tenant_a,
            product=product_tenant_a,
            quantity=10
        )

        # Create two discounts
        discount1 = Discount.objects.create(
            tenant=tenant_a,
            name="10% Off",
            code="SAVE10",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("10.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        discount2 = Discount.objects.create(
            tenant=tenant_a,
            name="$5 Off",
            code="SAVE5",
            type=Discount.DiscountType.FIXED_AMOUNT,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("5.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Apply first discount
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount1
        )
        order_tenant_a.refresh_from_db()

        # Apply second discount (should be allowed)
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount2
        )
        order_tenant_a.refresh_from_db()

        # Verify both discounts applied: 10% of $100 + $5 = $15 total
        assert order_tenant_a.total_discounts_amount == Decimal("15.00")

    def test_stacked_discounts_blocked(self, tenant_a, order_tenant_a, global_settings_tenant_a, product_tenant_a):
        """Test that multiple discounts are blocked when stacking is disabled"""
        set_current_tenant(tenant_a)

        # Disable discount stacking in settings
        global_settings_tenant_a.allow_discount_stacking = False
        global_settings_tenant_a.save()

        # Add items to order to have $100 subtotal
        # product_tenant_a is $10, so add 10 of them
        OrderService.add_item_to_order(
            order=order_tenant_a,
            product=product_tenant_a,
            quantity=10
        )

        # Create two discounts
        discount1 = Discount.objects.create(
            tenant=tenant_a,
            name="10% Off",
            code="SAVE10",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("10.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        discount2 = Discount.objects.create(
            tenant=tenant_a,
            name="$5 Off",
            code="SAVE5",
            type=Discount.DiscountType.FIXED_AMOUNT,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("5.00"),
            is_active=True,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Apply first discount
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount1
        )
        order_tenant_a.refresh_from_db()

        # Verify first discount applied: 10% of $100 = $10
        assert order_tenant_a.total_discounts_amount == Decimal("10.00")
        assert order_tenant_a.applied_discounts.count() == 1

        # Apply second discount (when stacking disabled, it replaces the first)
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount2
        )
        order_tenant_a.refresh_from_db()

        # Verify only second discount is applied (first was removed): $5 only
        assert order_tenant_a.total_discounts_amount == Decimal("5.00")
        assert order_tenant_a.applied_discounts.count() == 1
        assert order_tenant_a.applied_discounts.first().discount == discount2

    def test_expired_discount_rejected(self, tenant_a, order_tenant_a):
        """Test that expired discounts are rejected"""
        set_current_tenant(tenant_a)

        # Create an expired discount (ended yesterday)
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="Expired Discount",
            code="EXPIRED",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("10.00"),
            is_active=True,
            start_date=timezone.now() - timedelta(days=30),
            end_date=timezone.now() - timedelta(days=1)  # Expired yesterday
        )

        # Set order total
        order_tenant_a.subtotal = Decimal("100.00")
        order_tenant_a.grand_total = Decimal("110.00")
        order_tenant_a.save()

        # Try to apply expired discount (should not be applied)
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount
        )
        order_tenant_a.refresh_from_db()

        # Verify discount was not applied
        assert order_tenant_a.total_discounts_amount == Decimal("0.00")
        assert order_tenant_a.applied_discounts.count() == 0

    def test_inactive_discount_rejected(self, tenant_a, order_tenant_a):
        """Test that inactive discounts are rejected"""
        set_current_tenant(tenant_a)

        # Create an inactive discount
        discount = Discount.objects.create(
            tenant=tenant_a,
            name="Inactive Discount",
            code="INACTIVE",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("10.00"),
            is_active=False,  # Inactive
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Set order total
        order_tenant_a.subtotal = Decimal("100.00")
        order_tenant_a.grand_total = Decimal("110.00")
        order_tenant_a.save()

        # Try to apply inactive discount (should not be applied)
        DiscountService.apply_discount_to_order(
            order=order_tenant_a,
            discount=discount
        )
        order_tenant_a.refresh_from_db()

        # Verify discount was not applied
        assert order_tenant_a.total_discounts_amount == Decimal("0.00")
        assert order_tenant_a.applied_discounts.count() == 0
