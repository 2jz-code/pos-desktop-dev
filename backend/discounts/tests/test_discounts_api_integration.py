"""
Discounts API Integration Tests

Tests the complete request/response cycle for discount endpoints including:
- JWT cookie authentication
- CSRF double-submit protection
- Tenant middleware integration
- Permission classes
- Serializer validation
- Discount types (PERCENTAGE, FIXED_AMOUNT, BUY_X_GET_Y)
- Discount scopes (ORDER, PRODUCT, CATEGORY)
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status

from tenant.managers import set_current_tenant
from discounts.models import Discount
from orders.models import Order


@pytest.mark.django_db
class TestDiscountsAPIAuthentication:
    """Test authentication and authorization for discounts API"""

    def test_create_discount_authenticated(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test discount creation through API with JWT cookie authentication"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': '10% Off',
            'type': 'PERCENTAGE',
            'scope': 'ORDER',
            'value': '10.00',
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert 'id' in response.data
        assert response.data['name'] == '10% Off'
        assert response.data['type'] == 'PERCENTAGE'

        # Verify discount was created with correct tenant (need tenant context for ORM query)
        set_current_tenant(tenant_a)
        discount = Discount.objects.get(id=response.data['id'])
        assert discount.tenant == tenant_a

    def test_discount_api_without_authentication(self, guest_client):
        """Test that unauthenticated requests are rejected"""
        response = guest_client.post('/api/discounts/', {
            'name': 'Test Discount',
            'type': 'PERCENTAGE',
            'value': '10.00'
        }, format='json')

        # Should be blocked by authentication
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]


@pytest.mark.django_db
class TestDiscountsAPICRUDOperations:
    """Test CRUD operations on discounts through the API"""

    def test_create_order_scoped_percentage_discount(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test creating an order-scoped percentage discount"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': 'Summer Sale',
            'code': 'SUMMER2025',
            'type': 'PERCENTAGE',
            'scope': 'ORDER',
            'value': '15.00',
            'is_active': True,
            'start_date': timezone.now().isoformat(),
            'end_date': (timezone.now() + timedelta(days=30)).isoformat()
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Summer Sale'
        assert response.data['code'] == 'SUMMER2025'
        assert response.data['type'] == 'PERCENTAGE'
        assert response.data['scope'] == 'ORDER'
        assert Decimal(response.data['value']) == Decimal('15.00')

    def test_create_product_scoped_fixed_amount_discount(self, authenticated_client, tenant_a,
                                                         admin_user_tenant_a, product_tenant_a):
        """Test creating a product-scoped fixed amount discount"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': '$5 Off Pizza',
            'type': 'FIXED_AMOUNT',
            'scope': 'PRODUCT',
            'value': '5.00',
            'write_applicable_products': [str(product_tenant_a.id)],
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == '$5 Off Pizza'
        assert response.data['type'] == 'FIXED_AMOUNT'
        assert response.data['scope'] == 'PRODUCT'

        # Check that product is linked (read serializer returns nested objects)
        assert len(response.data['applicable_products']) == 1
        assert response.data['applicable_products'][0]['id'] == product_tenant_a.id

    def test_create_category_scoped_discount(self, authenticated_client, tenant_a,
                                            admin_user_tenant_a, category_tenant_a):
        """Test creating a category-scoped discount"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': '20% Off Pizzas',
            'type': 'PERCENTAGE',
            'scope': 'CATEGORY',
            'value': '20.00',
            'write_applicable_categories': [str(category_tenant_a.id)],
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['scope'] == 'CATEGORY'
        assert len(response.data['applicable_categories']) == 1
        assert response.data['applicable_categories'][0]['id'] == category_tenant_a.id

    def test_create_buy_x_get_y_discount(self, authenticated_client, tenant_a,
                                        admin_user_tenant_a, product_tenant_a):
        """Test creating a Buy X Get Y discount"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': 'Buy 2 Get 1 Free',
            'type': 'BUY_X_GET_Y',
            'scope': 'PRODUCT',
            'value': '0.00',  # Not used for BOGO but required field
            'buy_quantity': 2,
            'get_quantity': 1,
            'write_applicable_products': [str(product_tenant_a.id)],
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['type'] == 'BUY_X_GET_Y'
        assert response.data['buy_quantity'] == 2
        assert response.data['get_quantity'] == 1

    def test_list_discounts(self, authenticated_client, tenant_a, admin_user_tenant_a, discount_tenant_a):
        """Test listing discounts via API"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.get('/api/discounts/')

        assert response.status_code == status.HTTP_200_OK
        # Check if response is paginated or not
        discount_ids = [d['id'] for d in response.data.get('results', response.data)]
        assert discount_tenant_a.id in discount_ids

    def test_update_discount(self, authenticated_client, tenant_a, admin_user_tenant_a, discount_tenant_a):
        """Test updating a discount via API"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.patch(f'/api/discounts/{discount_tenant_a.id}/', {
            'value': '15.00'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert Decimal(response.data['value']) == Decimal('15.00')

        # Verify update persisted
        discount_tenant_a.refresh_from_db()
        assert discount_tenant_a.value == Decimal('15.00')

    def test_archive_discount(self, authenticated_client, tenant_a, admin_user_tenant_a, discount_tenant_a):
        """Test archiving a discount via API"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Archive via DELETE
        response = client.delete(f'/api/discounts/{discount_tenant_a.id}/')

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify discount is archived (soft deleted)
        discount_tenant_a.refresh_from_db()
        assert discount_tenant_a.archived_at is not None


@pytest.mark.django_db
class TestDiscountsAPIValidation:
    """Test validation rules for discount creation"""

    def test_product_scoped_discount_requires_products(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test that product-scoped discounts must have products"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': 'Invalid Discount',
            'type': 'PERCENTAGE',
            'scope': 'PRODUCT',
            'value': '10.00',
            # Missing write_applicable_products
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'write_applicable_products' in response.data

    def test_category_scoped_discount_requires_categories(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test that category-scoped discounts must have categories"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': 'Invalid Discount',
            'type': 'PERCENTAGE',
            'scope': 'CATEGORY',
            'value': '10.00',
            # Missing write_applicable_categories
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'write_applicable_categories' in response.data

    def test_empty_code_converted_to_null(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test that empty string codes are converted to null"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/discounts/', {
            'name': 'No Code Discount',
            'code': '',  # Empty string should be converted to None
            'type': 'PERCENTAGE',
            'scope': 'ORDER',
            'value': '10.00',
            'is_active': True
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED

        # Verify code is None in database (need tenant context)
        set_current_tenant(tenant_a)
        discount = Discount.objects.get(id=response.data['id'])
        assert discount.code is None


@pytest.mark.django_db
class TestDiscountsAPIApplyCode:
    """Test applying discount codes to orders"""

    def test_apply_valid_discount_code(self, authenticated_client, tenant_a,
                                      admin_user_tenant_a, order_tenant_a, discount_tenant_a):
        """Test applying a valid discount code to an order"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/apply-code/', {
            'order_id': str(order_tenant_a.id),
            'code': discount_tenant_a.code
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('success') == True

    def test_apply_invalid_discount_code(self, authenticated_client, tenant_a,
                                        admin_user_tenant_a, order_tenant_a):
        """Test applying an invalid discount code"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/apply-code/', {
            'order_id': str(order_tenant_a.id),
            'code': 'INVALID_CODE'
        }, format='json')

        # Validation service returns 400 for invalid codes
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_apply_code_missing_parameters(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test applying discount code with missing parameters"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # Missing order_id
        response = client.post('/api/apply-code/', {
            'code': 'SAVE10'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestDiscountsAPIAvailableDiscounts:
    """Test available discounts endpoint"""

    def test_list_available_discounts_active_only(self, authenticated_client, tenant_a,
                                                  admin_user_tenant_a, discount_tenant_a):
        """Test that available endpoint only shows active discounts"""
        set_current_tenant(tenant_a)

        # Create inactive discount
        inactive_discount = Discount.objects.create(
            tenant=tenant_a,
            name='Inactive Discount',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('5.00'),
            is_active=False
        )

        client = authenticated_client(admin_user_tenant_a)
        response = client.get('/api/available/')

        assert response.status_code == status.HTTP_200_OK

        # Check if response is paginated or not
        discount_ids = [d['id'] for d in response.data.get('results', response.data)]

        # Active discount should be present
        assert discount_tenant_a.id in discount_ids
        # Inactive discount should NOT be present
        assert inactive_discount.id not in discount_ids

    def test_archived_discounts_not_in_available(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test that archived discounts don't show in available endpoint"""
        set_current_tenant(tenant_a)

        # Create and archive discount
        discount = Discount.objects.create(
            tenant=tenant_a,
            name='Archived Discount',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('10.00'),
            is_active=True
        )
        # Archive by calling delete() which triggers soft delete
        discount.delete()

        client = authenticated_client(admin_user_tenant_a)
        response = client.get('/api/available/')

        assert response.status_code == status.HTTP_200_OK

        discount_ids = [d['id'] for d in response.data.get('results', response.data)]
        assert str(discount.id) not in discount_ids


@pytest.mark.django_db
class TestDiscountsAPITenantIsolation:
    """Test tenant isolation at the API layer"""

    def test_cannot_access_cross_tenant_discount(self, authenticated_client, tenant_a, tenant_b,
                                                 admin_user_tenant_a, discount_tenant_b):
        """Test that users cannot access discounts from other tenants"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.get(f'/api/discounts/{discount_tenant_b.id}/')

        # Should return 404 (not 403) to prevent tenant enumeration
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_list_discounts_filtered_by_tenant(self, authenticated_client, tenant_a, tenant_b,
                                               admin_user_tenant_a, discount_tenant_a, discount_tenant_b):
        """Test that discounts list only shows current tenant's discounts"""
        client = authenticated_client(admin_user_tenant_a)

        response = client.get('/api/discounts/')

        assert response.status_code == status.HTTP_200_OK

        # Should only see tenant A's discounts
        discount_ids = [d['id'] for d in response.data.get('results', response.data)]
        assert discount_tenant_a.id in discount_ids
        assert discount_tenant_b.id not in discount_ids

    def test_cannot_apply_cross_tenant_discount(self, authenticated_client, tenant_a,
                                               admin_user_tenant_a, order_tenant_a, discount_tenant_b):
        """Test that discounts from other tenants cannot be applied"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        response = client.post('/api/apply-code/', {
            'order_id': str(order_tenant_a.id),
            'code': discount_tenant_b.code
        }, format='json')

        # Should fail - discount not found in tenant A's scope (returns 400 from validation service)
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestDiscountsAPIFiltering:
    """Test filtering capabilities for discounts"""

    def test_filter_by_type(self, authenticated_client, tenant_a, admin_user_tenant_a):
        """Test filtering discounts by type"""
        set_current_tenant(tenant_a)

        # Create discounts of different types
        percentage_discount = Discount.objects.create(
            tenant=tenant_a,
            name='Percentage Discount',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('10.00'),
            is_active=True
        )
        fixed_discount = Discount.objects.create(
            tenant=tenant_a,
            name='Fixed Discount',
            type='FIXED_AMOUNT',
            scope='ORDER',
            value=Decimal('5.00'),
            is_active=True
        )

        client = authenticated_client(admin_user_tenant_a)

        # Filter for PERCENTAGE only
        response = client.get('/api/discounts/', {'type': 'PERCENTAGE'})

        assert response.status_code == status.HTTP_200_OK
        discount_ids = [d['id'] for d in response.data.get('results', response.data)]

        assert percentage_discount.id in discount_ids
        assert fixed_discount.id not in discount_ids

    def test_filter_by_scope(self, authenticated_client, tenant_a, admin_user_tenant_a, product_tenant_a):
        """Test filtering discounts by scope"""
        set_current_tenant(tenant_a)

        # Create discounts with different scopes
        order_discount = Discount.objects.create(
            tenant=tenant_a,
            name='Order Discount',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('10.00'),
            is_active=True
        )
        product_discount = Discount.objects.create(
            tenant=tenant_a,
            name='Product Discount',
            type='PERCENTAGE',
            scope='PRODUCT',
            value=Decimal('15.00'),
            is_active=True
        )
        product_discount.applicable_products.add(product_tenant_a)

        client = authenticated_client(admin_user_tenant_a)

        # Filter for PRODUCT scope only
        response = client.get('/api/discounts/', {'scope': 'PRODUCT'})

        assert response.status_code == status.HTTP_200_OK
        discount_ids = [d['id'] for d in response.data.get('results', response.data)]

        assert product_discount.id in discount_ids
        assert order_discount.id not in discount_ids


@pytest.mark.django_db
class TestDiscountsAPISyncSerializer:
    """Test sync-specific serializer functionality"""

    def test_sync_parameter_uses_simplified_serializer(self, authenticated_client, tenant_a,
                                                       admin_user_tenant_a, discount_tenant_a, product_tenant_a):
        """Test that sync=true parameter returns simplified data"""
        set_current_tenant(tenant_a)

        # Create product-scoped discount to test nested object handling
        discount = Discount.objects.create(
            tenant=tenant_a,
            name='Product Discount',
            type='PERCENTAGE',
            scope='PRODUCT',
            value=Decimal('20.00'),
            is_active=True
        )
        discount.applicable_products.add(product_tenant_a)

        client = authenticated_client(admin_user_tenant_a)

        # Request with sync=true
        response = client.get(f'/api/discounts/{discount.id}/', {'sync': 'true'})

        assert response.status_code == status.HTTP_200_OK

        # Sync serializer should NOT include nested objects
        assert 'applicable_products' not in response.data
        assert 'applicable_categories' not in response.data

        # Should still have basic fields
        assert response.data['name'] == 'Product Discount'
        assert response.data['type'] == 'PERCENTAGE'


@pytest.mark.django_db
class TestDiscountsAPIComplexWorkflows:
    """Test complex multi-step workflows through the API"""

    def test_discount_creation_and_application_workflow(self, authenticated_client, tenant_a,
                                                       admin_user_tenant_a, product_tenant_a):
        """Test complete workflow: Create Discount → Create Order → Apply Discount → Verify"""
        set_current_tenant(tenant_a)
        client = authenticated_client(admin_user_tenant_a)

        # 1. Create discount
        response = client.post('/api/discounts/', {
            'name': 'Flash Sale',
            'code': 'FLASH20',
            'type': 'PERCENTAGE',
            'scope': 'ORDER',
            'value': '20.00',
            'is_active': True
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        discount_id = response.data['id']

        # 2. Create order
        response = client.post('/api/orders/', {
            'order_type': 'POS',
            'dining_preference': 'DINE_IN'
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        order_id = response.data['id']

        # 3. Add items to order
        response = client.post(f'/api/orders/{order_id}/items/', {
            'product_id': str(product_tenant_a.id),
            'quantity': 2
        }, format='json')
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]

        # 4. Apply discount
        response = client.post('/api/apply-code/', {
            'order_id': order_id,
            'code': 'FLASH20'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('success') == True

        # 5. Verify discount is applied to order (need tenant context for query)
        set_current_tenant(tenant_a)
        from orders.models import OrderDiscount
        assert OrderDiscount.objects.filter(
            order_id=order_id,
            discount_id=discount_id
        ).exists()
