"""
Inventory Management Tests

Tests for inventory operations including stock management, transfers,
recipe ingredient deductions, and low stock notifications.
"""
import pytest
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

from tenant.managers import set_current_tenant
from inventory.services import InventoryService
from inventory.models import InventoryStock, StockHistoryEntry
from products.models import Product, ProductType
from orders.models import Order
from orders.services import OrderService


@pytest.mark.django_db
class TestInventoryManagement:
    """Test inventory stock management operations"""

    def test_add_stock_to_location(self, tenant_a, product_tenant_a, location_tenant_a):
        """Test adding stock to a location"""
        set_current_tenant(tenant_a)

        # Add 100 units of product to location
        stock = InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=100,
            reason="Initial stock"
        )

        assert stock.quantity == Decimal("100.00")
        assert stock.product == product_tenant_a
        assert stock.location == location_tenant_a

        # Verify history entry was created
        history = StockHistoryEntry.objects.filter(
            product=product_tenant_a,
            location=location_tenant_a,
            operation_type='CREATED'
        ).first()

        assert history is not None
        assert history.quantity_change == Decimal("100.00")

    def test_deduct_stock_from_location(self, tenant_a, product_tenant_a, location_tenant_a):
        """Test deducting stock from a location"""
        set_current_tenant(tenant_a)

        # Add initial stock
        InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=100
        )

        # Deduct 30 units
        stock = InventoryService.decrement_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=30,
            reason="Sale"
        )

        assert stock.quantity == Decimal("70.00")

        # Verify history entry
        history = StockHistoryEntry.objects.filter(
            product=product_tenant_a,
            location=location_tenant_a,
            operation_type='ADJUSTED_SUBTRACT'
        ).first()

        assert history is not None
        assert history.quantity_change == Decimal("-30.00")

    def test_insufficient_stock_raises_error(self, tenant_a, product_tenant_a, location_tenant_a):
        """Test that attempting to deduct more stock than available raises an error"""
        set_current_tenant(tenant_a)

        # Add only 10 units
        InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=10
        )

        # Try to deduct 50 units (should fail)
        with pytest.raises(ValueError, match="Insufficient stock"):
            InventoryService.decrement_stock(
                product=product_tenant_a,
                location=location_tenant_a,
                quantity=50
            )

    def test_transfer_stock_between_locations(self, tenant_a, product_tenant_a, location_tenant_a):
        """Test transferring stock from one location to another"""
        set_current_tenant(tenant_a)

        # Create a second location
        from inventory.models import Location
        location_b = Location.objects.create(
            tenant=tenant_a,
            name='Secondary Store',
            description='Second location'
        )

        # Add stock to location A
        InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=100
        )

        # Transfer 40 units from A to B
        source_stock, destination_stock = InventoryService.transfer_stock(
            product=product_tenant_a,
            from_location=location_tenant_a,
            to_location=location_b,
            quantity=40,
            reason="Restocking secondary location"
        )

        # Verify stock levels
        assert source_stock.quantity == Decimal("60.00")
        assert destination_stock.quantity == Decimal("40.00")

        # Verify transfer history entries
        transfer_from = StockHistoryEntry.objects.filter(
            product=product_tenant_a,
            location=location_tenant_a,
            operation_type='TRANSFER_FROM'
        ).first()

        transfer_to = StockHistoryEntry.objects.filter(
            product=product_tenant_a,
            location=location_b,
            operation_type='TRANSFER_TO'
        ).first()

        assert transfer_from is not None
        assert transfer_to is not None
        assert transfer_from.reference_id == transfer_to.reference_id

    def test_transfer_to_same_location_raises_error(self, tenant_a, product_tenant_a, location_tenant_a):
        """Test that transferring stock to the same location raises an error"""
        set_current_tenant(tenant_a)

        # Add stock
        InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=100
        )

        # Try to transfer to same location (should fail)
        with pytest.raises(ValueError, match="Source and destination locations cannot be the same"):
            InventoryService.transfer_stock(
                product=product_tenant_a,
                from_location=location_tenant_a,
                to_location=location_tenant_a,
                quantity=10
            )

    def test_get_stock_level(self, tenant_a, product_tenant_a, location_tenant_a):
        """Test getting current stock level for a product at a location"""
        set_current_tenant(tenant_a)

        # Initially should be 0
        level = InventoryService.get_stock_level(product_tenant_a, location_tenant_a)
        assert level == Decimal("0.0")

        # Add stock
        InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=75
        )

        # Should now show 75
        level = InventoryService.get_stock_level(product_tenant_a, location_tenant_a)
        assert level == Decimal("75.00")

    def test_check_stock_availability(self, tenant_a, product_tenant_a, location_tenant_a):
        """Test checking if sufficient stock is available"""
        set_current_tenant(tenant_a)

        # Add 50 units
        InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=50
        )

        # Check if 30 units available (should be True)
        available = InventoryService.check_stock_availability(
            product=product_tenant_a,
            location=location_tenant_a,
            required_quantity=30
        )
        assert available is True

        # Check if 60 units available (should be False)
        available = InventoryService.check_stock_availability(
            product=product_tenant_a,
            location=location_tenant_a,
            required_quantity=60
        )
        assert available is False

    def test_low_stock_threshold_detection(self, tenant_a, product_tenant_a, location_tenant_a, global_settings_tenant_a):
        """Test low stock threshold detection"""
        set_current_tenant(tenant_a)

        # Set global low stock threshold
        global_settings_tenant_a.default_low_stock_threshold = Decimal("10.00")
        global_settings_tenant_a.save()

        # Add stock above threshold
        stock = InventoryService.add_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=20
        )

        # Should not be low stock
        assert stock.is_low_stock is False

        # Deduct to bring below threshold
        stock = InventoryService.decrement_stock(
            product=product_tenant_a,
            location=location_tenant_a,
            quantity=15
        )

        stock.refresh_from_db()

        # Should now be low stock (5 <= 10)
        assert stock.is_low_stock is True
        assert stock.quantity == Decimal("5.00")

    def test_recipe_ingredient_deduction(self, tenant_a, location_tenant_a, product_type_tenant_a, category_tenant_a, cashier_user_tenant_a):
        """Test deducting ingredients for a recipe-based menu item"""
        set_current_tenant(tenant_a)
        from inventory.models import Recipe, RecipeItem

        # Create menu item product type
        menu_type = ProductType.objects.create(
            tenant=tenant_a,
            name='menu'
        )

        # Create ingredients (regular products)
        cheese = Product.objects.create(
            tenant=tenant_a,
            name='Cheese',
            price=Decimal('5.00'),
            product_type=product_type_tenant_a,
            category=category_tenant_a
        )

        dough = Product.objects.create(
            tenant=tenant_a,
            name='Pizza Dough',
            price=Decimal('3.00'),
            product_type=product_type_tenant_a,
            category=category_tenant_a
        )

        # Create menu item
        pizza = Product.objects.create(
            tenant=tenant_a,
            name='Cheese Pizza',
            price=Decimal('15.00'),
            product_type=menu_type,
            category=category_tenant_a
        )

        # Create recipe
        recipe = Recipe.objects.create(
            tenant=tenant_a,
            menu_item=pizza,
            name='Cheese Pizza Recipe'
        )

        # Add ingredients to recipe (using RecipeItem)
        RecipeItem.objects.create(
            tenant=tenant_a,
            recipe=recipe,
            product=cheese,
            quantity=Decimal('0.5'),  # 0.5 units of cheese per pizza
            unit='units'
        )

        RecipeItem.objects.create(
            tenant=tenant_a,
            recipe=recipe,
            product=dough,
            quantity=Decimal('1.0'),  # 1 unit of dough per pizza
            unit='units'
        )

        # Add stock for ingredients
        InventoryService.add_stock(cheese, location_tenant_a, 10)
        InventoryService.add_stock(dough, location_tenant_a, 20)

        # Deduct ingredients for 2 pizzas
        InventoryService.deduct_recipe_ingredients(
            menu_item=pizza,
            quantity=2,
            location=location_tenant_a,
            reference_id="test-order-123"
        )

        # Verify ingredient stock was deducted
        cheese_stock = InventoryService.get_stock_level(cheese, location_tenant_a)
        dough_stock = InventoryService.get_stock_level(dough, location_tenant_a)

        assert cheese_stock == Decimal("9.00")  # 10 - (2 * 0.5) = 9
        assert dough_stock == Decimal("18.00")  # 20 - (2 * 1.0) = 18

    def test_check_recipe_availability(self, tenant_a, location_tenant_a, product_type_tenant_a, category_tenant_a):
        """Test checking if a menu item with recipe can be made"""
        set_current_tenant(tenant_a)
        from inventory.models import Recipe, RecipeItem

        # Create menu item product type
        menu_type = ProductType.objects.create(
            tenant=tenant_a,
            name='menu'
        )

        # Create ingredients
        tomato = Product.objects.create(
            tenant=tenant_a,
            name='Tomato',
            price=Decimal('2.00'),
            product_type=product_type_tenant_a,
            category=category_tenant_a
        )

        lettuce = Product.objects.create(
            tenant=tenant_a,
            name='Lettuce',
            price=Decimal('1.50'),
            product_type=product_type_tenant_a,
            category=category_tenant_a
        )

        # Create menu item (salad)
        salad = Product.objects.create(
            tenant=tenant_a,
            name='Garden Salad',
            price=Decimal('8.00'),
            product_type=menu_type,
            category=category_tenant_a
        )

        # Create recipe
        recipe = Recipe.objects.create(
            tenant=tenant_a,
            menu_item=salad,
            name='Garden Salad Recipe'
        )

        # Add ingredients to recipe
        RecipeItem.objects.create(
            tenant=tenant_a,
            recipe=recipe,
            product=tomato,
            quantity=Decimal('2.0'),  # 2 tomatoes per salad
            unit='units'
        )

        RecipeItem.objects.create(
            tenant=tenant_a,
            recipe=recipe,
            product=lettuce,
            quantity=Decimal('1.0'),  # 1 lettuce per salad
            unit='units'
        )

        # Add stock for ingredients
        InventoryService.add_stock(tomato, location_tenant_a, 10)
        InventoryService.add_stock(lettuce, location_tenant_a, 5)

        # Check if recipe can be made (should return True for menu items)
        # Menu items allow cook-to-order, so this should always be True
        available = InventoryService.check_recipe_availability(
            menu_item=salad,
            location=location_tenant_a,
            quantity=3
        )

        # For menu items, should always allow cook-to-order
        assert available is True
