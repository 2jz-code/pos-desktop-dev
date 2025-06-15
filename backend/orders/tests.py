from decimal import Decimal
from django.test import TestCase
from .services import OrderService
from .models import Order, OrderItem
from users.models import User
from products.models import Product, Category, Tax


class OrderServiceTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test case."""
        cls.cashier = User.objects.create_user(
            email="cashier@test.com", password="password"
        )
        cls.customer = User.objects.create_user(
            email="customer@test.com", password="password"
        )

        cls.category = Category.objects.create(name="Food")
        cls.tax_8_percent = Tax.objects.create(name="Food Tax", rate=Decimal("8.00"))

        cls.product1 = Product.objects.create(
            name="Burger", price=Decimal("10.00"), category=cls.category
        )
        cls.product1.taxes.add(cls.tax_8_percent)

        cls.product2 = Product.objects.create(
            name="Fries", price=Decimal("4.50"), category=cls.category
        )
        cls.product2.taxes.add(cls.tax_8_percent)

    def test_create_order_successfully(self):
        """Test that an order can be created successfully."""
        order = OrderService.create_order(
            order_type=Order.OrderType.POS, cashier=self.cashier, customer=self.customer
        )
        self.assertIsInstance(order, Order)
        self.assertEqual(order.order_type, Order.OrderType.POS)
        self.assertEqual(order.cashier, self.cashier)
        self.assertEqual(order.customer, self.customer)
        self.assertEqual(order.status, Order.OrderStatus.PENDING)
        self.assertEqual(order.grand_total, Decimal("0.00"))

    def test_add_new_item_to_order(self):
        """Test adding a new item to an order and check recalculation."""
        order = OrderService.create_order(Order.OrderType.POS, self.cashier)
        OrderService.add_item_to_order(order, self.product1, 2)  # 2 burgers at $10 each

        order.refresh_from_db()

        self.assertEqual(order.items.count(), 1)
        order_item = order.items.first()
        self.assertEqual(order_item.quantity, 2)
        self.assertEqual(order_item.price_at_sale, Decimal("10.00"))

        # Check totals
        self.assertEqual(order.subtotal, Decimal("20.00"))
        self.assertEqual(order.tax_total, Decimal("1.60"))  # 8% of 20.00
        self.assertEqual(order.grand_total, Decimal("21.60"))

    def test_add_existing_item_to_order(self):
        """Test adding an item that is already in the order."""
        order = OrderService.create_order(Order.OrderType.POS, self.cashier)
        OrderService.add_item_to_order(order, self.product1, 1)
        OrderService.add_item_to_order(order, self.product1, 2)  # Add 2 more

        order.refresh_from_db()

        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().quantity, 3)

        # Check totals
        self.assertEqual(order.subtotal, Decimal("30.00"))
        self.assertEqual(order.tax_total, Decimal("2.40"))  # 8% of 30.00
        self.assertEqual(order.grand_total, Decimal("32.40"))

    def test_add_multiple_different_items(self):
        """Test adding multiple different items and check total calculation."""
        order = OrderService.create_order(Order.OrderType.POS, self.cashier)
        OrderService.add_item_to_order(order, self.product1, 1)  # 10.00
        OrderService.add_item_to_order(order, self.product2, 2)  # 2 * 4.50 = 9.00

        order.refresh_from_db()

        self.assertEqual(order.items.count(), 2)

        # Check totals
        self.assertEqual(order.subtotal, Decimal("19.00"))
        self.assertEqual(order.tax_total, Decimal("1.52"))  # 8% of 19.00
        self.assertEqual(order.grand_total, Decimal("20.52"))

    def test_cannot_add_item_to_completed_order(self):
        """Test that adding an item to a completed order raises a ValueError."""
        order = OrderService.create_order(Order.OrderType.POS, self.cashier)
        order.status = Order.OrderStatus.COMPLETED
        order.save()

        with self.assertRaises(ValueError):
            OrderService.add_item_to_order(order, self.product1, 1)
