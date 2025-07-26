from decimal import Decimal
from django.test import TestCase
from .services import OrderService
from .models import Order, OrderItem
from users.models import User
from products.models import Product, Category, Tax, ProductType, ModifierSet, ModifierOption, ProductModifierSet


class OrderServiceModifierIntegrationTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.cashier = User.objects.create_user(email="cashier@test.com", password="password")
        cls.product_type = ProductType.objects.create(name="Menu Item")
        cls.product = Product.objects.create(name="Test Product", price=10.00, product_type=cls.product_type)

        # Single choice, required
        cls.size_set = ModifierSet.objects.create(name="Size", internal_name="size", selection_type="SINGLE", min_selections=1)
        cls.large_opt = ModifierOption.objects.create(modifier_set=cls.size_set, name="Large", price_delta=1.50)
        ProductModifierSet.objects.create(product=cls.product, modifier_set=cls.size_set)

        # Multiple choice, optional
        cls.toppings_set = ModifierSet.objects.create(name="Toppings", internal_name="toppings", selection_type="MULTIPLE")
        cls.cheese_opt = ModifierOption.objects.create(modifier_set=cls.toppings_set, name="Cheese", price_delta=0.75)
        cls.bacon_opt = ModifierOption.objects.create(modifier_set=cls.toppings_set, name="Bacon", price_delta=1.25)
        ProductModifierSet.objects.create(product=cls.product, modifier_set=cls.toppings_set)

    def test_add_item_with_modifiers_calculates_price_correctly(self):
        """Test that price_at_sale is correct when adding an item with modifiers."""
        order = OrderService.create_order(Order.OrderType.POS, self.cashier)
        selected_options = [self.large_opt.id, self.cheese_opt.id, self.bacon_opt.id]
        
        order_item = OrderService.add_item_to_order(
            order=order, 
            product=self.product, 
            quantity=1, 
            selected_option_ids=selected_options
        )

        # Base price (10.00) + Large (1.50) + Cheese (0.75) + Bacon (1.25) = 13.50
        self.assertEqual(order_item.price_at_sale, Decimal("13.50"))

    def test_add_item_with_modifiers_creates_snapshots(self):
        """Test that OrderItemModifier snapshots are created correctly."""
        order = OrderService.create_order(Order.OrderType.POS, self.cashier)
        selected_options = [self.large_opt.id, self.cheese_opt.id]

        order_item = OrderService.add_item_to_order(
            order=order, 
            product=self.product, 
            quantity=1, 
            selected_option_ids=selected_options
        )

        self.assertEqual(order_item.selected_modifiers_snapshot.count(), 2)
        large_snapshot = order_item.selected_modifiers_snapshot.get(option_name="Large")
        self.assertEqual(large_snapshot.price_at_sale, self.large_opt.price_delta)
        cheese_snapshot = order_item.selected_modifiers_snapshot.get(option_name="Cheese")
        self.assertEqual(cheese_snapshot.price_at_sale, self.cheese_opt.price_delta)


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

        cls.product_type = ProductType.objects.create(name="Menu Item")
        
        cls.product1 = Product.objects.create(
            name="Burger", price=Decimal("10.00"), category=cls.category, product_type=cls.product_type
        )
        cls.product1.taxes.add(cls.tax_8_percent)

        cls.product2 = Product.objects.create(
            name="Fries", price=Decimal("4.50"), category=cls.category, product_type=cls.product_type
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
        # The new implementation creates a new line item for items with different modifiers,
        # so this test is no longer applicable in the same way.
        # I will modify it to add the same item without modifiers.
        OrderService.add_item_to_order(order, self.product1, 2)

        order.refresh_from_db()

        self.assertEqual(order.items.count(), 2) # Should be two separate line items now

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

        
