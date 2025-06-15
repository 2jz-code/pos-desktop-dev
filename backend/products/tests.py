from django.test import TestCase
from .models import Category, Tax, MenuItem, GroceryItem, Product
from .services import ProductService


class ProductServiceTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        """Set up non-modified objects used by all test methods."""
        cls.category = Category.objects.create(name="Beverages")
        cls.tax = Tax.objects.create(name="Sales Tax", rate=8.00)

    def test_create_menu_item_successfully(self):
        """Test that a MenuItem can be created successfully with valid data."""
        product_data = {
            "name": "Coffee",
            "price": "2.50",
            "category_id": self.category.id,
            "tax_ids": [self.tax.id],
        }

        menu_item = ProductService.create_product("menu", **product_data)

        self.assertIsInstance(menu_item, MenuItem)
        self.assertEqual(menu_item.name, "Coffee")
        self.assertEqual(menu_item.category, self.category)
        self.assertEqual(menu_item.taxes.count(), 1)
        self.assertEqual(menu_item.taxes.first(), self.tax)
        self.assertTrue(Product.objects.filter(name="Coffee").exists())

    def test_create_grocery_item_successfully(self):
        """Test that a GroceryItem can be created successfully."""
        product_data = {
            "name": "Coffee Beans",
            "price": "10.00",
            "category_id": self.category.id,
        }

        grocery_item = ProductService.create_product("grocery", **product_data)

        self.assertIsInstance(grocery_item, GroceryItem)
        self.assertEqual(grocery_item.name, "Coffee Beans")
        self.assertEqual(grocery_item.category, self.category)
        self.assertEqual(grocery_item.taxes.count(), 0)

    def test_create_product_with_invalid_type(self):
        """Test that creating a product with an invalid type raises a ValueError."""
        with self.assertRaises(ValueError):
            ProductService.create_product("invalid_type", name="Test", price="1.00")

    def test_create_product_transaction_atomicity(self):
        """Test that the transaction is rolled back if an error occurs."""
        invalid_data = {
            "name": "Tea",
            "price": "2.00",
            "category_id": 999,  # Non-existent category
        }

        initial_product_count = Product.objects.count()

        with self.assertRaises(Category.DoesNotExist):
            ProductService.create_product("menu", **invalid_data)

        final_product_count = Product.objects.count()
        self.assertEqual(
            initial_product_count,
            final_product_count,
            "Product should not be created if category does not exist.",
        )
