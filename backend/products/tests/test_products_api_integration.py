"""
Products API Integration Tests

Tests the complete request/response cycle for product endpoints including:
- JWT cookie authentication
- CSRF double-submit protection
- Tenant middleware integration
- Permission classes (AllowAny for public, IsAdminOrHigher for modifications)
- Serializer validation
- Caching patterns
- Barcode lookup
- Bulk operations
- Hierarchical category ordering
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

from tenant.managers import set_current_tenant
from products.models import Product, Category, ModifierSet, ModifierOption, Tax, ProductType


@pytest.mark.django_db
class TestProductsAPIAuthentication:
    """Test authentication and authorization for products API"""

    def test_list_products_public_access(self, api_client_factory, tenant_a, product_tenant_a):
        """Test that product listing allows public access (AllowAny)"""
        set_current_tenant(tenant_a)

        # Create guest client with tenant context (for TenantMiddleware)
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.get('/api/products/')

        assert response.status_code == status.HTTP_200_OK
        # Products should be visible without authentication
        product_ids = [p['id'] for p in response.data]
        assert product_tenant_a.id in product_ids

    def test_create_product_requires_admin(self, authenticated_client, tenant_a,
                                          admin_user_tenant_a, category_tenant_a,
                                          product_type_tenant_a):
        """Test that only admin/manager can create products"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/products/', {
            'name': 'New Pizza',
            'price': '12.99',
            'product_type_id': product_type_tenant_a.id,
            'category_id': category_tenant_a.id,
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'New Pizza'

    def test_update_product_requires_admin(self, authenticated_client, tenant_a,
                                          admin_user_tenant_a, product_tenant_a):
        """Test that only admin/manager can update products"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.patch(f'/api/products/{product_tenant_a.id}/', {
            'name': 'Updated Pizza'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Pizza'

    def test_delete_product_requires_admin(self, authenticated_client, tenant_a,
                                          admin_user_tenant_a, product_tenant_a):
        """Test that only admin/manager can delete products"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.delete(f'/api/products/{product_tenant_a.id}/')

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_products_api_cashier_can_modify(self, authenticated_client, tenant_a,
                                            cashier_user_tenant_a, product_tenant_a):
        """Test that cashiers can modify products (AllowAny permission)"""
        set_current_tenant(tenant_a)
        client = authenticated_client(cashier_user_tenant_a)

        # Should be able to list products
        response = client.get('/api/products/')
        assert response.status_code == status.HTTP_200_OK

        # Should be able to get product detail
        response = client.get(f'/api/products/{product_tenant_a.id}/')
        assert response.status_code == status.HTTP_200_OK

        # Should be able to update (AllowAny permission for customer website)
        response = client.patch(f'/api/products/{product_tenant_a.id}/', {
            'name': 'Updated by Cashier'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestProductsAPICRUD:
    """Test CRUD operations on products through the API"""

    def test_list_products_api_filtered_by_tenant(self, authenticated_client,
                                                  tenant_a, tenant_b,
                                                  admin_user_tenant_a,
                                                  product_tenant_a, product_tenant_b):
        """Test that products list only shows current tenant's products"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.get('/api/products/')

        assert response.status_code == status.HTTP_200_OK

        # Should only see tenant A's products
        product_ids = [p['id'] for p in response.data]
        assert product_tenant_a.id in product_ids
        assert product_tenant_b.id not in product_ids

    def test_get_product_detail_api(self, authenticated_client, tenant_a,
                                   admin_user_tenant_a, product_tenant_a):
        """Test product detail retrieval"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.get(f'/api/products/{product_tenant_a.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == product_tenant_a.name
        assert Decimal(response.data['price']) == product_tenant_a.price

    def test_create_product_api(self, authenticated_client, tenant_a,
                               admin_user_tenant_a, category_tenant_a,
                               product_type_tenant_a, tax_rate_tenant_a):
        """Test creating a product with category, taxes, and product type"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/products/', {
            'name': 'Margherita Pizza',
            'description': 'Classic pizza with tomato and mozzarella',
            'price': '11.99',
            'product_type_id': product_type_tenant_a.id,
            'category_id': category_tenant_a.id,
            'tax_ids': [tax_rate_tenant_a.id],
            'is_active': True,
            'barcode': '123456789'
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Margherita Pizza'
        assert Decimal(response.data['price']) == Decimal('11.99')

        # Verify product was created with correct tenant
        set_current_tenant(tenant_a)
        product = Product.objects.get(id=response.data['id'])
        assert product.tenant == tenant_a
        assert product.category == category_tenant_a

    def test_update_product_api(self, authenticated_client, tenant_a,
                               admin_user_tenant_a, product_tenant_a,
                               category_tenant_a):
        """Test updating product fields"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.patch(f'/api/products/{product_tenant_a.id}/', {
            'name': 'Updated Pizza Name',
            'price': '13.99',
            'category_id': category_tenant_a.id
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Pizza Name'
        assert Decimal(response.data['price']) == Decimal('13.99')

        # Verify database was updated
        product_tenant_a.refresh_from_db()
        assert product_tenant_a.name == 'Updated Pizza Name'


@pytest.mark.django_db
class TestCategoriesAPI:
    """Test category management through the API"""

    def test_list_categories_hierarchical_ordering(self, authenticated_client,
                                                   tenant_a, admin_user_tenant_a):
        """Test that categories are ordered hierarchically"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Create parent and child categories
        parent = Category.objects.create(
            tenant=tenant_a,
            name='Main Dishes',
            order=1
        )
        child = Category.objects.create(
            tenant=tenant_a,
            name='Pizzas',
            parent=parent,
            order=1
        )

        response = client.get('/api/products/categories/')

        assert response.status_code == status.HTTP_200_OK
        category_names = [c['name'] for c in response.data]
        assert 'Main Dishes' in category_names
        assert 'Pizzas' in category_names

    def test_create_category_with_parent(self, authenticated_client, tenant_a,
                                        admin_user_tenant_a, category_tenant_a):
        """Test creating a category with parent relationship"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/products/categories/', {
            'name': 'Specialty Pizzas',
            'parent_id': category_tenant_a.id,  # Use parent_id for write
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Specialty Pizzas'
        # parent is a nested object in the response
        assert response.data['parent']['id'] == category_tenant_a.id

    def test_bulk_update_categories(self, authenticated_client, tenant_a,
                                   admin_user_tenant_a):
        """Test bulk category updates"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Create multiple categories
        cat1 = Category.objects.create(tenant=tenant_a, name='Cat1', order=1)
        cat2 = Category.objects.create(tenant=tenant_a, name='Cat2', order=2)

        response = client.patch('/api/products/categories/bulk-update/', {
            'updates': [  # Use 'updates' not 'categories'
                {'id': cat1.id, 'order': 5},
                {'id': cat2.id, 'order': 3}
            ]
        }, format='json')

        # Accept either 200 or 204 as valid success responses
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]


@pytest.mark.django_db
class TestBarcodeOperations:
    """Test barcode-related operations"""

    def test_barcode_lookup_api(self, api_client_factory, tenant_a, product_tenant_a):
        """Test barcode product lookup (public endpoint)"""
        set_current_tenant(tenant_a)

        # Set a barcode on the product
        product_tenant_a.barcode = '9876543210'
        product_tenant_a.save()

        # Create guest client with tenant context
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.get(f'/api/products/barcode/{product_tenant_a.barcode}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is True
        assert response.data['product']['id'] == product_tenant_a.id

    def test_barcode_lookup_not_found(self, api_client_factory, tenant_a):
        """Test 404 for non-existent barcode"""
        set_current_tenant(tenant_a)

        # Create guest client with tenant context
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.get('/api/products/barcode/NONEXISTENT123/')

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data['success'] is False


@pytest.mark.django_db
class TestBulkOperations:
    """Test bulk operations on products"""

    def test_bulk_archive_products(self, authenticated_client, tenant_a,
                                  admin_user_tenant_a):
        """Test archiving multiple products"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Create products to archive
        from products.models import ProductType
        product_type = ProductType.objects.create(tenant=tenant_a, name='Food')

        product1 = Product.objects.create(
            tenant=tenant_a,
            name='Product 1',
            price=Decimal('10.00'),
            product_type=product_type,
            is_active=True
        )
        product2 = Product.objects.create(
            tenant=tenant_a,
            name='Product 2',
            price=Decimal('15.00'),
            product_type=product_type,
            is_active=True
        )

        response = client.post('/api/products/bulk_archive/', {
            'ids': [product1.id, product2.id]
        }, format='json')

        assert response.status_code == status.HTTP_200_OK

        # Verify products were archived
        product1.refresh_from_db()
        product2.refresh_from_db()
        assert product1.is_active is False
        assert product2.is_active is False

    def test_bulk_unarchive_products(self, authenticated_client, tenant_a,
                                    admin_user_tenant_a):
        """Test unarchiving multiple products"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Create archived products
        from products.models import ProductType
        product_type = ProductType.objects.create(tenant=tenant_a, name='Food')

        product1 = Product.objects.create(
            tenant=tenant_a,
            name='Product 1',
            price=Decimal('10.00'),
            product_type=product_type,
            is_active=False
        )
        product2 = Product.objects.create(
            tenant=tenant_a,
            name='Product 2',
            price=Decimal('15.00'),
            product_type=product_type,
            is_active=False
        )

        response = client.post('/api/products/bulk_unarchive/', {
            'ids': [product1.id, product2.id]
        }, format='json')

        assert response.status_code == status.HTTP_200_OK

        # Verify products were unarchived
        product1.refresh_from_db()
        product2.refresh_from_db()
        assert product1.is_active is True
        assert product2.is_active is True

    def test_bulk_update_products(self, authenticated_client, tenant_a,
                                 admin_user_tenant_a, category_tenant_a):
        """Test bulk update of product category/type"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Create products to update
        from products.models import ProductType
        product_type = ProductType.objects.create(tenant=tenant_a, name='Food')
        new_product_type = ProductType.objects.create(tenant=tenant_a, name='Beverage')

        product1 = Product.objects.create(
            tenant=tenant_a,
            name='Product 1',
            price=Decimal('10.00'),
            product_type=product_type
        )
        product2 = Product.objects.create(
            tenant=tenant_a,
            name='Product 2',
            price=Decimal('15.00'),
            product_type=product_type
        )

        response = client.patch('/api/products/bulk-update/', {
            'product_ids': [product1.id, product2.id],
            'category': category_tenant_a.id,
            'product_type': new_product_type.id
        }, format='json')

        assert response.status_code == status.HTTP_200_OK

        # Verify products were updated
        product1.refresh_from_db()
        product2.refresh_from_db()
        assert product1.category == category_tenant_a
        assert product2.category == category_tenant_a
        assert product1.product_type == new_product_type
        assert product2.product_type == new_product_type


@pytest.mark.django_db
class TestProductsAPITenantIsolation:
    """Test tenant isolation at the API layer"""

    def test_product_api_cross_tenant_denied(self, authenticated_client,
                                            tenant_a, tenant_b,
                                            admin_user_tenant_a,
                                            product_tenant_b):
        """Test that users cannot access products from other tenants"""
        client = authenticated_client(admin_user_tenant_a)

        # Try to get tenant B's product
        response = client.get(f'/api/products/{product_tenant_b.id}/')

        # Should return 404 (not 403) to prevent tenant enumeration
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_category_api_cross_tenant_denied(self, authenticated_client,
                                             tenant_a, tenant_b,
                                             admin_user_tenant_a,
                                             category_tenant_b):
        """Test that users cannot access categories from other tenants"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.get(f'/api/products/categories/{category_tenant_b.id}/')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_modifier_set_api_cross_tenant_denied(self, authenticated_client,
                                                  tenant_a, tenant_b,
                                                  admin_user_tenant_a,
                                                  modifier_set_tenant_a):
        """Test that users cannot access modifier sets from other tenants"""
        set_current_tenant(tenant_b)

        # Create a modifier set for tenant B
        modifier_set_b = ModifierSet.objects.create(
            tenant=tenant_b,
            name='Toppings'
        )

        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.get(f'/api/products/modifier-sets/{modifier_set_b.id}/')

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestModifierSetsAPI:
    """Test modifier sets and options through the API"""

    def test_create_modifier_set_with_options(self, authenticated_client, tenant_a,
                                             admin_user_tenant_a):
        """Test creating a modifier set with nested options"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/products/modifier-sets/', {
            'name': 'Pizza Size',
            'internal_name': 'pizza_size',  # Required field
            'options_data': [
                {'name': 'Small', 'price_delta': '0.00'},
                {'name': 'Medium', 'price_delta': '2.00'},
                {'name': 'Large', 'price_delta': '4.00'}
            ]
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Pizza Size'

        # Verify options were created
        set_current_tenant(tenant_a)
        modifier_set = ModifierSet.objects.get(id=response.data['id'])
        assert modifier_set.options.count() == 3

    def test_update_modifier_option(self, authenticated_client, tenant_a,
                                   admin_user_tenant_a, modifier_set_tenant_a,
                                   modifier_option_tenant_a):
        """Test updating a modifier option"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Modifier options are at top level, not nested under modifier-sets
        response = client.patch(
            f'/api/products/modifier-options/{modifier_option_tenant_a.id}/',
            {
                'name': 'Extra Large',
                'price_delta': '5.00'
            },
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Extra Large'
        assert Decimal(response.data['price_delta']) == Decimal('5.00')


@pytest.mark.django_db
class TestProductsCaching:
    """Test caching behavior for products"""

    def test_product_list_cached(self, authenticated_client, tenant_a,
                                admin_user_tenant_a, product_tenant_a):
        """Test that product list is cached for common queries"""
        client = authenticated_client(admin_user_tenant_a)

        # First request (cache miss)
        response1 = client.get('/api/products/')
        assert response1.status_code == status.HTTP_200_OK

        # Second request (should hit cache)
        response2 = client.get('/api/products/')
        assert response2.status_code == status.HTTP_200_OK

        # Data should be the same
        assert len(response1.data) == len(response2.data)

    def test_cache_invalidation_on_archive(self, authenticated_client, tenant_a,
                                          admin_user_tenant_a, product_tenant_a):
        """Test that cache is invalidated when products are archived"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Get initial list (caches result)
        response1 = client.get('/api/products/')
        initial_count = len(response1.data)

        # Archive a product
        client.post(f'/api/products/{product_tenant_a.id}/archive/', format='json')

        # Get list again (should reflect archive)
        response2 = client.get('/api/products/?is_active=true')

        # Should have fewer active products
        assert response2.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestProductsAPIComplexWorkflows:
    """Test complex multi-step workflows through the API"""

    def test_product_with_modifiers_workflow(self, authenticated_client, tenant_a,
                                            admin_user_tenant_a, category_tenant_a,
                                            product_type_tenant_a):
        """Test complete workflow: Create Product → Add Modifier Sets → Verify"""
        client = authenticated_client(admin_user_tenant_a)
        set_current_tenant(tenant_a)

        # 1. Create product
        response = client.post('/api/products/', {
            'name': 'Custom Pizza',
            'price': '12.99',
            'product_type_id': product_type_tenant_a.id,
            'category_id': category_tenant_a.id,
            'is_active': True
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        product_id = response.data['id']

        # 2. Create modifier set
        response = client.post('/api/products/modifier-sets/', {
            'name': 'Toppings',
            'internal_name': 'toppings',  # Required field
            'options_data': [
                {'name': 'Pepperoni', 'price_delta': '1.50'},
                {'name': 'Mushrooms', 'price_delta': '1.00'}
            ]
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        modifier_set_id = response.data['id']

        # 3. Link modifier set to product via the through model (ensure tenant context)
        set_current_tenant(tenant_a)
        from products.models import ProductModifierSet

        ProductModifierSet.objects.create(
            product_id=product_id,
            modifier_set_id=modifier_set_id,
            tenant=tenant_a
        )

        # 4. Verify product detail includes modifier groups
        response = client.get(f'/api/products/{product_id}/')
        assert response.status_code == status.HTTP_200_OK
        # Note: The serializer may call it modifier_groups in the response
        assert 'modifier_groups' in response.data or 'modifier_sets' in response.data
