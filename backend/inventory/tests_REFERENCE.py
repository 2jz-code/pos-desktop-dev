from django.test import TestCase
from django.db import IntegrityError
from .services import InventoryService
from .models import Location, InventoryStock
from products.models import GroceryItem


class InventoryServiceTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test case."""
        cls.product = GroceryItem.objects.create(name="Coffee Beans", price="10.00")
        cls.location1 = Location.objects.create(name="Back Storeroom")
        cls.location2 = Location.objects.create(name="Front Shelf")

    def test_add_stock_to_new_location(self):
        """Test adding stock to a location where the product doesn't exist yet."""
        stock = InventoryService.add_stock(self.product, self.location1, 100.0)

        self.assertEqual(stock.product, self.product)
        self.assertEqual(stock.location, self.location1)
        self.assertEqual(stock.quantity, 100.0)

        # Verify it's in the database
        db_stock = InventoryStock.objects.get(
            product=self.product, location=self.location1
        )
        self.assertEqual(db_stock.quantity, 100.0)

    def test_add_stock_to_existing_location(self):
        """Test adding stock to a location that already has some."""
        InventoryService.add_stock(self.product, self.location1, 50.0)
        stock = InventoryService.add_stock(self.product, self.location1, 25.0)

        self.assertEqual(stock.quantity, 75.0)

    def test_decrement_stock_successfully(self):
        """Test that stock can be decremented correctly."""
        InventoryService.add_stock(self.product, self.location1, 100.0)
        stock = InventoryService.decrement_stock(self.product, self.location1, 40.0)
        self.assertEqual(stock.quantity, 60.0)

    def test_decrement_stock_insufficient_quantity(self):
        """Test that decrementing more stock than available raises a ValueError."""
        InventoryService.add_stock(self.product, self.location1, 10.0)

        with self.assertRaises(ValueError):
            InventoryService.decrement_stock(self.product, self.location1, 15.0)

    def test_transfer_stock_successfully(self):
        """Test a successful transfer of stock between two locations."""
        InventoryService.add_stock(self.product, self.location1, 100.0)
        InventoryService.add_stock(self.product, self.location2, 20.0)

        source_stock, dest_stock = InventoryService.transfer_stock(
            self.product, self.location1, self.location2, 30.0
        )

        self.assertEqual(source_stock.quantity, 70.0)
        self.assertEqual(dest_stock.quantity, 50.0)

        # Verify final state in DB
        self.assertEqual(
            InventoryStock.objects.get(location=self.location1).quantity, 70.0
        )
        self.assertEqual(
            InventoryStock.objects.get(location=self.location2).quantity, 50.0
        )

    def test_transfer_stock_insufficient_source_quantity(self):
        """Test that transferring more stock than available raises a ValueError."""
        InventoryService.add_stock(self.product, self.location1, 20.0)

        with self.assertRaises(ValueError):
            InventoryService.transfer_stock(
                self.product, self.location1, self.location2, 25.0
            )

        # Verify that no stock was changed
        self.assertEqual(
            InventoryStock.objects.get(location=self.location1).quantity, 20.0
        )
        self.assertFalse(
            InventoryStock.objects.filter(location=self.location2).exists()
        )

    def test_transfer_stock_to_same_location(self):
        """Test that transferring to the same location raises a ValueError."""
        InventoryService.add_stock(self.product, self.location1, 100.0)

        with self.assertRaises(ValueError):
            InventoryService.transfer_stock(
                self.product, self.location1, self.location1, 50.0
            )
