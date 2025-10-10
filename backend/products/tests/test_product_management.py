"""
Product Management Tests

Tests for product CRUD operations, categorization, modifiers,
barcode handling, and archiving functionality.
"""
import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError

from tenant.managers import set_current_tenant
from products.models import Product, Category, Tax, ModifierSet, ModifierOption, ProductModifierSet
from products.services import ProductService, ProductValidationService, ProductSearchService


@pytest.mark.django_db
class TestProductManagement:
    """Test product management operations"""

    def test_create_product_with_category_and_taxes(self, tenant_a, category_tenant_a, tax_rate_tenant_a, product_type_tenant_a):
        """Test creating a product with category and taxes"""
        set_current_tenant(tenant_a)

        # Create product using service
        product = ProductService.create_product(
            tenant=tenant_a,
            name='Deluxe Burger',
            price=Decimal('12.99'),
            description='Premium beef burger with toppings',
            category_id=category_tenant_a.id,
            tax_ids=[tax_rate_tenant_a.id],
            product_type=product_type_tenant_a,
            is_public=True
        )

        # Verify product was created correctly
        assert product.name == 'Deluxe Burger'
        assert product.price == Decimal('12.99')
        assert product.category == category_tenant_a
        assert product.tenant == tenant_a
        assert product.is_active is True
        assert product.is_public is True

        # Verify taxes were assigned
        assert product.taxes.count() == 1
        assert product.taxes.first() == tax_rate_tenant_a

    def test_archive_and_unarchive_product(self, tenant_a, product_tenant_a):
        """Test archiving (soft delete) and unarchiving a product"""
        set_current_tenant(tenant_a)

        # Initially product should be active
        assert product_tenant_a.is_active is True
        assert product_tenant_a.is_archived is False

        # Archive the product
        product_tenant_a.archive()
        product_tenant_a.refresh_from_db()

        # Product should now be archived
        assert product_tenant_a.is_active is False
        assert product_tenant_a.is_archived is True
        assert product_tenant_a.archived_at is not None

        # Unarchive the product
        product_tenant_a.unarchive()
        product_tenant_a.refresh_from_db()

        # Product should be active again
        assert product_tenant_a.is_active is True
        assert product_tenant_a.is_archived is False
        assert product_tenant_a.archived_at is None

    def test_create_category_hierarchy(self, tenant_a):
        """Test creating parent and child categories"""
        set_current_tenant(tenant_a)

        # Create parent category
        food = Category.objects.create(
            tenant=tenant_a,
            name='Food',
            description='All food items',
            order=1,
            is_public=True
        )

        # Create child categories
        appetizers = Category.objects.create(
            tenant=tenant_a,
            name='Appetizers',
            parent=food,
            order=1,
            is_public=True
        )

        entrees = Category.objects.create(
            tenant=tenant_a,
            name='Entrees',
            parent=food,
            order=2,
            is_public=True
        )

        # Verify hierarchy
        assert appetizers.parent == food
        assert entrees.parent == food
        assert food.children.count() == 2
        assert list(food.children.all().order_by('order')) == [appetizers, entrees]

    def test_create_modifier_set_and_attach_to_product(self, tenant_a, product_tenant_a):
        """Test creating a modifier set with options and attaching to product"""
        set_current_tenant(tenant_a)

        # Create modifier set
        size_modifiers = ModifierSet.objects.create(
            tenant=tenant_a,
            name='Choose Size',
            internal_name='drink-size',
            selection_type=ModifierSet.SelectionType.SINGLE,
            min_selections=1,
            max_selections=1
        )

        # Create modifier options
        small = ModifierOption.objects.create(
            tenant=tenant_a,
            modifier_set=size_modifiers,
            name='Small',
            price_delta=Decimal('0.00'),
            display_order=1
        )

        large = ModifierOption.objects.create(
            tenant=tenant_a,
            modifier_set=size_modifiers,
            name='Large',
            price_delta=Decimal('2.00'),
            display_order=2
        )

        # Attach modifier set to product
        product_modifier = ProductModifierSet.objects.create(
            tenant=tenant_a,
            product=product_tenant_a,
            modifier_set=size_modifiers,
            display_order=1
        )

        # Verify modifier set is attached
        assert product_tenant_a.modifier_sets.count() == 1
        assert product_tenant_a.modifier_sets.first() == size_modifiers
        assert size_modifiers.options.count() == 2

    def test_barcode_validation_and_lookup(self, tenant_a, category_tenant_a, product_type_tenant_a):
        """Test barcode format validation and product lookup by barcode"""
        set_current_tenant(tenant_a)

        # Create product with valid barcode
        product = ProductService.create_product(
            tenant=tenant_a,
            name='Barcode Test Product',
            price=Decimal('5.99'),
            barcode='123456789',
            product_type=product_type_tenant_a,
            category_id=category_tenant_a.id
        )

        # Verify barcode was set
        assert product.barcode == '123456789'

        # Test barcode lookup
        found_product = ProductSearchService.search_products_by_barcode('123456789')
        assert found_product is not None
        assert found_product.id == product.id

        # Test invalid barcode (too short)
        with pytest.raises(ValidationError):
            ProductValidationService.validate_barcode_format('12')

        # Test invalid barcode (invalid characters)
        with pytest.raises(ValidationError):
            ProductValidationService.validate_barcode_format('ABC@123!')

    def test_product_bulk_update(self, tenant_a, category_tenant_a, product_type_tenant_a):
        """Test bulk updating multiple products at once"""
        set_current_tenant(tenant_a)

        # Create multiple products
        products = []
        for i in range(5):
            product = ProductService.create_product(
                tenant=tenant_a,
                name=f'Bulk Test Product {i}',
                price=Decimal('10.00'),
                product_type=product_type_tenant_a,
                category_id=None  # No category initially
            )
            products.append(product)

        # Bulk update to assign category
        product_ids = [p.id for p in products]
        result = ProductService.bulk_update_products(
            product_ids=product_ids,
            update_fields={'category': category_tenant_a.id}
        )

        # Verify bulk update was successful
        assert result['success'] is True
        assert result['updated_count'] == 5

        # Verify all products now have the category
        for product in products:
            product.refresh_from_db()
            assert product.category == category_tenant_a

    def test_category_archiving_handles_products(self, tenant_a, category_tenant_a, product_type_tenant_a):
        """Test that archiving a category properly handles dependent products"""
        set_current_tenant(tenant_a)

        # Create products in category
        product1 = ProductService.create_product(
            tenant=tenant_a,
            name='Product in Category 1',
            price=Decimal('5.00'),
            category_id=category_tenant_a.id,
            product_type=product_type_tenant_a
        )

        product2 = ProductService.create_product(
            tenant=tenant_a,
            name='Product in Category 2',
            price=Decimal('6.00'),
            category_id=category_tenant_a.id,
            product_type=product_type_tenant_a
        )

        # Archive category with force=True and handle_products='set_null'
        category_tenant_a.archive(force=True, handle_products='set_null')

        # Verify category is archived
        assert category_tenant_a.is_active is False

        # Verify products category was set to None
        product1.refresh_from_db()
        product2.refresh_from_db()
        assert product1.category is None
        assert product2.category is None

    def test_product_with_inventory_tracking(self, tenant_a, category_tenant_a, product_type_tenant_a, location_tenant_a):
        """Test creating a product with inventory tracking enabled"""
        set_current_tenant(tenant_a)

        # Create product with inventory tracking and initial stock
        product = ProductService.create_product(
            tenant=tenant_a,
            name='Tracked Product',
            price=Decimal('8.99'),
            category_id=category_tenant_a.id,
            product_type=product_type_tenant_a,
            track_inventory=True,
            initial_stock=50,
            location_id=location_tenant_a.id
        )

        # Verify product was created
        assert product.track_inventory is True

        # Verify inventory stock was created
        from inventory.models import InventoryStock
        stock = InventoryStock.objects.filter(
            product=product,
            location=location_tenant_a
        ).first()

        assert stock is not None
        assert stock.quantity == Decimal('50.00')

    def test_product_price_validation(self, tenant_a):
        """Test product price validation rules"""
        set_current_tenant(tenant_a)

        # Test negative price
        with pytest.raises(ValidationError):
            ProductValidationService.validate_product_data({
                'name': 'Test Product',
                'price': Decimal('-5.00')
            })

        # Test price exceeding maximum
        with pytest.raises(ValidationError):
            ProductValidationService.validate_product_data({
                'name': 'Test Product',
                'price': Decimal('100000.00')
            })

        # Test valid price
        valid_data = ProductValidationService.validate_product_data({
            'name': 'Test Product',
            'price': Decimal('25.00')
        })
        assert valid_data['price'] == Decimal('25.00')

    def test_barcode_uniqueness_per_tenant(self, tenant_a, tenant_b, product_type_tenant_a, product_type_tenant_b, category_tenant_a, category_tenant_b):
        """Test that barcodes can be reused across different tenants"""
        set_current_tenant(tenant_a)

        # Create product in tenant A with barcode
        product_a = ProductService.create_product(
            tenant=tenant_a,
            name='Product A',
            price=Decimal('10.00'),
            barcode='SAME123',
            product_type=product_type_tenant_a,
            category_id=category_tenant_a.id
        )

        # Switch to tenant B
        set_current_tenant(tenant_b)

        # Should be able to use same barcode in different tenant
        product_b = ProductService.create_product(
            tenant=tenant_b,
            name='Product B',
            price=Decimal('15.00'),
            barcode='SAME123',
            product_type=product_type_tenant_b,
            category_id=category_tenant_b.id
        )

        # Verify both products have the same barcode but different tenants
        assert product_a.barcode == product_b.barcode
        assert product_a.tenant != product_b.tenant

        # Switch back to tenant A
        set_current_tenant(tenant_a)

        # Should NOT be able to use same barcode in same tenant
        with pytest.raises((ValidationError, Exception)):
            ProductService.create_product(
                tenant=tenant_a,
                name='Duplicate Product',
                price=Decimal('12.00'),
                barcode='SAME123',
                product_type=product_type_tenant_a,
                category_id=category_tenant_a.id
            )
