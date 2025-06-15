from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from orders.models import Order
from orders.services import OrderService
from products.models import Product, Category
from users.models import User
from .models import Discount
from .services import DiscountService


class DiscountServiceTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test case."""
        cls.cashier = User.objects.create_user(
            email="cashier@test.com", password="password"
        )
        cls.food_category = Category.objects.create(name="Food")
        cls.drink_category = Category.objects.create(name="Drink")

        cls.product1 = Product.objects.create(
            name="Test Coffee", price=Decimal("10.00"), category=cls.drink_category
        )
        cls.product2 = Product.objects.create(
            name="Test Muffin", price=Decimal("5.00"), category=cls.food_category
        )

        # Create a basic order
        cls.order = OrderService.create_order(order_type="POS", cashier=cls.cashier)
        OrderService.add_item_to_order(
            cls.order, cls.product1, quantity=2
        )  # Subtotal: 20.00
        OrderService.add_item_to_order(
            cls.order, cls.product2, quantity=1
        )  # Subtotal: 5.00
        # Total Subtotal = 25.00

        # Create some discounts
        cls.ten_percent_off = Discount.objects.create(
            name="10% Off Order",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("10.00"),
        )
        cls.five_dollars_off = Discount.objects.create(
            name="$5 Off Order",
            type=Discount.DiscountType.FIXED_AMOUNT,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("5.00"),
        )
        cls.inactive_discount = Discount.objects.create(
            name="Inactive Discount",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("50.00"),
            is_active=False,
        )
        cls.expired_discount = Discount.objects.create(
            name="Expired Discount",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.ORDER,
            value=Decimal("20.00"),
            end_date=timezone.now() - timedelta(days=1),
        )

        # Product/Category specific discounts
        cls.product_discount_percent = Discount.objects.create(
            name="20% off Coffee",
            type=Discount.DiscountType.PERCENTAGE,
            scope=Discount.DiscountScope.PRODUCT,
            value=Decimal("20.00"),
        )
        cls.product_discount_percent.applicable_products.add(cls.product1)

        cls.category_discount_fixed = Discount.objects.create(
            name="$1 off Food items",
            type=Discount.DiscountType.FIXED_AMOUNT,
            scope=Discount.DiscountScope.CATEGORY,
            value=Decimal("1.00"),
        )
        cls.category_discount_fixed.applicable_categories.add(cls.food_category)

        cls.bogo_drinks = Discount.objects.create(
            name="BOGO on Drinks",
            type=Discount.DiscountType.BOGO,
            scope=Discount.DiscountScope.PRODUCT,
            value=Decimal("0.00"),
        )
        cls.bogo_drinks.applicable_products.add(cls.product1)  # Coffee at 10.00

    def setUp(self):
        """Refresh order object for each test to ensure isolation."""
        self.order.refresh_from_db()

    def test_apply_order_percentage_discount(self):
        """Test applying a valid percentage discount to an order."""
        DiscountService.apply_discount_to_order(self.order, self.ten_percent_off)

        self.order.refresh_from_db()
        # 10% of 25.00 is 2.50
        self.assertEqual(self.order.total_discounts_amount, Decimal("2.50"))
        self.assertEqual(self.order.grand_total, Decimal("22.50"))
        self.assertEqual(self.order.discounts.count(), 1)

    def test_apply_order_fixed_amount_discount(self):
        """Test applying a valid fixed amount discount to an order."""
        DiscountService.apply_discount_to_order(self.order, self.five_dollars_off)

        self.order.refresh_from_db()
        self.assertEqual(self.order.total_discounts_amount, Decimal("5.00"))
        self.assertEqual(self.order.grand_total, Decimal("20.00"))

    def test_apply_multiple_discounts(self):
        """Test applying multiple different discounts to the same order."""
        # Ensure we have the latest totals before starting
        self.order.refresh_from_db()

        DiscountService.apply_discount_to_order(
            self.order, self.ten_percent_off
        )  # 2.50 off

        # VERY IMPORTANT: Refresh the order so the service gets the updated subtotal
        # and grand_total from the first discount application.
        self.order.refresh_from_db()

        DiscountService.apply_discount_to_order(
            self.order, self.five_dollars_off
        )  # 5.00 off

        self.order.refresh_from_db()
        # Total discount is 2.50 + 5.00 = 7.50
        self.assertEqual(self.order.total_discounts_amount, Decimal("7.50"))
        # 25.00 - 7.50 = 17.50
        self.assertEqual(self.order.grand_total, Decimal("17.50"))
        self.assertEqual(self.order.discounts.count(), 2)

    def test_cannot_apply_same_discount_twice(self):
        """Test that applying the same discount more than once raises an error."""
        DiscountService.apply_discount_to_order(self.order, self.ten_percent_off)
        with self.assertRaisesMessage(
            ValueError, "This discount has already been applied to the order."
        ):
            DiscountService.apply_discount_to_order(self.order, self.ten_percent_off)

    def test_cannot_apply_inactive_discount(self):
        """Test that an inactive discount cannot be applied."""
        with self.assertRaisesMessage(
            ValueError, "This discount is not currently active."
        ):
            DiscountService.apply_discount_to_order(self.order, self.inactive_discount)

    def test_cannot_apply_expired_discount(self):
        """Test that an expired discount cannot be applied."""
        with self.assertRaisesMessage(
            ValueError, "This discount is not currently active."
        ):
            DiscountService.apply_discount_to_order(self.order, self.expired_discount)

    def test_apply_product_percentage_discount(self):
        """Test applying a percentage discount to a specific product."""
        # Order has 2 coffees at 10.00 each = 20.00. 20% off is 4.00
        DiscountService.apply_discount_to_order(
            self.order, self.product_discount_percent
        )
        self.order.refresh_from_db()
        self.assertEqual(self.order.total_discounts_amount, Decimal("4.00"))
        self.assertEqual(self.order.grand_total, Decimal("21.00"))

    def test_apply_category_fixed_discount(self):
        """Test applying a fixed amount discount to a specific category."""
        # Order has 1 muffin at 5.00. $1 off is 1.00 discount.
        DiscountService.apply_discount_to_order(
            self.order, self.category_discount_fixed
        )
        self.order.refresh_from_db()
        self.assertEqual(self.order.total_discounts_amount, Decimal("1.00"))
        self.assertEqual(self.order.grand_total, Decimal("24.00"))

    def test_apply_product_and_category_discounts(self):
        """Test stacking different types of scoped discounts."""
        # 4.00 off from coffee discount
        DiscountService.apply_discount_to_order(
            self.order, self.product_discount_percent
        )
        self.order.refresh_from_db()
        # 1.00 off from muffin discount
        DiscountService.apply_discount_to_order(
            self.order, self.category_discount_fixed
        )
        self.order.refresh_from_db()

        self.assertEqual(
            self.order.total_discounts_amount, Decimal("5.00")
        )  # 4.00 + 1.00
        self.assertEqual(self.order.grand_total, Decimal("20.00"))  # 25.00 - 5.00
        self.assertEqual(self.order.discounts.count(), 2)

    def test_apply_bogo_discount(self):
        """Test a Buy-One-Get-One-Free discount."""
        # Order already has 2 coffees at 10.00 each.
        # Let's add one more coffee to make it 3.
        OrderService.add_item_to_order(self.order, self.product1, quantity=1)
        self.order.refresh_from_db()

        # We now have 3 coffees at 10.00 each.
        # BOGO applies to one pair. The discount should be the price of one coffee.
        DiscountService.apply_discount_to_order(self.order, self.bogo_drinks)
        self.order.refresh_from_db()

        # Initial subtotal was 25.00. Added one coffee for 10.00. New subtotal = 35.00
        # BOGO discount should be 10.00
        self.assertEqual(self.order.total_discounts_amount, Decimal("10.00"))
        self.assertEqual(self.order.grand_total, Decimal("25.00"))
