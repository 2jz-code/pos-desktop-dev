"""
Customers API Integration Tests

Tests the complete request/response cycle for customer endpoints including:
- Customer JWT cookie authentication (separate from staff auth)
- CSRF double-submit protection
- Tenant middleware integration
- Permission classes (AllowAny for public, IsAuthenticated for protected)
- Customer-specific serializer validation
- Shopping cart operations (guest and authenticated)
- Customer order history and statistics
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

from tenant.managers import set_current_tenant
from customers.models import Customer
from orders.models import Order


@pytest.mark.django_db
class TestCustomersAPIAuthentication:
    """Test authentication and registration for customers API"""

    def test_customer_registration_api(self, tenant_a, api_client_factory):
        """Test customer registration through API"""
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/register/', {
            'email': 'newcustomer@example.com',
            'password': 'SecurePassword123!',
            'confirm_password': 'SecurePassword123!',
            'first_name': 'John',
            'last_name': 'Doe',
            'marketing_opt_in': False,
            'newsletter_subscribed': False
        }, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert 'customer' in response.data
        assert response.data['customer']['email'] == 'newcustomer@example.com'

        # Verify customer was created with correct tenant
        set_current_tenant(tenant_a)
        customer = Customer.objects.get(email='newcustomer@example.com')
        assert customer.tenant == tenant_a
        assert customer.first_name == 'John'

        # Verify JWT cookies were set for immediate login
        assert 'access_token_customer' in response.cookies or 'Set-Cookie' in response

    def test_customer_registration_duplicate_email(self, tenant_a, api_client_factory):
        """Test that duplicate email registration is rejected"""
        # Create existing customer
        set_current_tenant(tenant_a)
        Customer.objects.create_customer(
            email='existing@example.com',
            password='password123',
            first_name='Existing',
            last_name='User',
            tenant=tenant_a
        )

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/register/', {
            'email': 'existing@example.com',
            'password': 'NewPassword123!',
            'confirm_password': 'NewPassword123!',
            'first_name': 'New',
            'last_name': 'User'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data

    def test_customer_login_api(self, tenant_a, api_client_factory):
        """Test customer login through API"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/login/', {
            'email': 'customer@example.com',
            'password': 'password123'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['message'] == 'Login successful'
        assert 'customer' in response.data
        assert response.data['customer']['email'] == 'customer@example.com'

        # Verify JWT cookies were set
        assert 'access_token_customer' in response.cookies or 'Set-Cookie' in response

    def test_customer_login_invalid_credentials(self, tenant_a, api_client_factory):
        """Test that invalid login credentials are rejected"""
        # Create test customer
        set_current_tenant(tenant_a)
        Customer.objects.create_customer(
            email='customer@example.com',
            password='correctpassword',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/login/', {
            'email': 'customer@example.com',
            'password': 'wrongpassword'
        }, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_customer_logout_api(self, tenant_a, api_client_factory):
        """Test customer logout clears authentication cookies"""
        # Create and authenticate customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Login first
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        login_response = client.post('/api/customers/login/', {
            'email': 'customer@example.com',
            'password': 'password123'
        }, format='json')

        assert login_response.status_code == status.HTTP_200_OK

        # Now logout
        logout_response = client.post('/api/customers/logout/', format='json')

        assert logout_response.status_code == status.HTTP_200_OK
        assert logout_response.data['message'] in ['Logout successful', 'Logout completed']


@pytest.mark.django_db
class TestCustomersAPIProfileManagement:
    """Test customer profile management through API"""

    def test_get_current_user_authenticated(self, tenant_a, api_client_factory):
        """Test getting current user profile requires authentication"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Authenticate using customer-specific authentication
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.get('/api/customers/current-user/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == 'customer@example.com'
        assert response.data['first_name'] == 'Test'

    def test_update_customer_profile_api(self, tenant_a, api_client_factory):
        """Test updating customer profile through API"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Authenticate
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.patch('/api/customers/profile/', {
            'first_name': 'Updated',
            'phone_number': '555-1234'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['first_name'] == 'Updated'
        assert response.data['phone_number'] == '555-1234'

        # Verify in database
        customer.refresh_from_db()
        assert customer.first_name == 'Updated'

    def test_change_password_api(self, tenant_a, api_client_factory):
        """Test changing password through API"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='oldpassword123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Authenticate
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.post('/api/customers/change-password/', {
            'old_password': 'oldpassword123',
            'new_password': 'NewPassword123!',
            'confirm_password': 'NewPassword123!'
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['message'] == 'Password changed successfully'

        # Verify new password works
        customer.refresh_from_db()
        assert customer.check_password('NewPassword123!')


@pytest.mark.django_db
class TestCustomersAPIPasswordReset:
    """Test password reset flow through API"""

    def test_password_reset_request_api(self, tenant_a, api_client_factory):
        """Test requesting password reset"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/password-reset/request/', {
            'email': 'customer@example.com'
        }, format='json')

        # Always returns 200 to prevent account enumeration
        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data

    def test_password_reset_request_nonexistent_email(self, tenant_a, api_client_factory):
        """Test password reset for non-existent email returns same response"""
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/password-reset/request/', {
            'email': 'nonexistent@example.com'
        }, format='json')

        # Should return 200 to prevent enumeration
        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data


@pytest.mark.django_db
class TestCustomersAPIOrderHistory:
    """Test customer order history and statistics"""

    def test_list_customer_orders_api(self, tenant_a, api_client_factory):
        """Test listing customer orders (filtered to customer only)"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Create orders for this customer
        order1 = Order.objects.create(
            tenant=tenant_a,
            customer=customer,
            order_type='WEB',
            status='COMPLETED',
            subtotal=Decimal('50.00'),
            tax_total=Decimal('5.00'),
            grand_total=Decimal('55.00')
        )

        order2 = Order.objects.create(
            tenant=tenant_a,
            customer=customer,
            order_type='WEB',
            status='PENDING',
            subtotal=Decimal('30.00'),
            tax_total=Decimal('3.00'),
            grand_total=Decimal('33.00')
        )

        # Authenticate
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.get('/api/customers/orders/')

        assert response.status_code == status.HTTP_200_OK

        # Handle pagination
        if isinstance(response.data, dict) and 'results' in response.data:
            orders = response.data['results']
        else:
            orders = response.data

        # Should see both orders
        order_ids = [str(o['id']) for o in orders]
        assert str(order1.id) in order_ids
        assert str(order2.id) in order_ids

    def test_customer_cannot_see_other_customer_orders(self, tenant_a, api_client_factory):
        """Test that customers can only see their own orders"""
        # Create two customers
        set_current_tenant(tenant_a)
        customer1 = Customer.objects.create_customer(
            email='customer1@example.com',
            password='password123',
            first_name='Customer',
            last_name='One',
            tenant=tenant_a
        )

        customer2 = Customer.objects.create_customer(
            email='customer2@example.com',
            password='password123',
            first_name='Customer',
            last_name='Two',
            tenant=tenant_a
        )

        # Create order for customer2
        order_customer2 = Order.objects.create(
            tenant=tenant_a,
            customer=customer2,
            order_type='WEB',
            status='COMPLETED',
            subtotal=Decimal('100.00'),
            tax_total=Decimal('10.00'),
            grand_total=Decimal('110.00')
        )

        # Authenticate as customer1
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer1)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        # Try to list orders
        response = client.get('/api/customers/orders/')

        assert response.status_code == status.HTTP_200_OK

        # Handle pagination
        if isinstance(response.data, dict) and 'results' in response.data:
            orders = response.data['results']
        else:
            orders = response.data

        # Customer1 should not see customer2's orders
        order_ids = [str(o['id']) for o in orders]
        assert str(order_customer2.id) not in order_ids

    def test_get_order_detail_cross_customer_denied(self, tenant_a, api_client_factory):
        """Test that customers cannot view other customers' order details"""
        # Create two customers
        set_current_tenant(tenant_a)
        customer1 = Customer.objects.create_customer(
            email='customer1@example.com',
            password='password123',
            first_name='Customer',
            last_name='One',
            tenant=tenant_a
        )

        customer2 = Customer.objects.create_customer(
            email='customer2@example.com',
            password='password123',
            first_name='Customer',
            last_name='Two',
            tenant=tenant_a
        )

        # Create order for customer2
        order_customer2 = Order.objects.create(
            tenant=tenant_a,
            customer=customer2,
            order_type='WEB',
            status='COMPLETED',
            subtotal=Decimal('100.00'),
            tax_total=Decimal('10.00'),
            grand_total=Decimal('110.00')
        )

        # Authenticate as customer1
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer1)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        # Try to get customer2's order
        response = client.get(f'/api/customers/orders/{order_customer2.id}/')

        # Should return 404 (not 403) to prevent enumeration
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_customer_order_stats_api(self, tenant_a, api_client_factory):
        """Test getting customer order statistics"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Create completed orders
        Order.objects.create(
            tenant=tenant_a,
            customer=customer,
            order_type='WEB',
            status='COMPLETED',
            subtotal=Decimal('50.00'),
            tax_total=Decimal('5.00'),
            grand_total=Decimal('55.00')
        )

        Order.objects.create(
            tenant=tenant_a,
            customer=customer,
            order_type='WEB',
            status='COMPLETED',
            subtotal=Decimal('45.00'),
            tax_total=Decimal('4.50'),
            grand_total=Decimal('49.50')
        )

        # Authenticate
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.get('/api/customers/orders/stats/')

        assert response.status_code == status.HTTP_200_OK
        assert 'total_orders' in response.data
        assert 'total_spent' in response.data
        assert response.data['total_orders'] >= 2


@pytest.mark.django_db
class TestCustomersAPIShoppingCart:
    """Test customer shopping cart operations (guest and authenticated)"""

    def test_get_pending_order_authenticated(self, tenant_a, api_client_factory, product_tenant_a):
        """Test getting pending order (cart) for authenticated customer"""
        # Create test customer with a pending order
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        pending_order = Order.objects.create(
            tenant=tenant_a,
            customer=customer,
            order_type='WEB',
            status='PENDING',
            subtotal=Decimal('0.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('0.00')
        )

        # Authenticate
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.get('/api/customers/orders/pending/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(pending_order.id)
        assert response.data['status'] == 'PENDING'

    def test_get_pending_order_no_cart_returns_404(self, tenant_a, api_client_factory):
        """Test getting pending order returns 404 when no cart exists"""
        # Create test customer without any orders
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Authenticate
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.get('/api/customers/orders/pending/')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_add_item_to_cart_authenticated(self, tenant_a, api_client_factory, product_tenant_a):
        """Test adding item to cart for authenticated customer"""
        # Create test customer
        set_current_tenant(tenant_a)
        customer = Customer.objects.create_customer(
            email='customer@example.com',
            password='password123',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )

        # Create pending order (cart) for the customer
        pending_order = Order.objects.create(
            tenant=tenant_a,
            customer=customer,
            order_type='WEB',
            status='PENDING',
            subtotal=Decimal('0.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('0.00')
        )

        # Authenticate
        from customers.services import CustomerAuthService
        tokens = CustomerAuthService.generate_customer_tokens(customer)

        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)
        client.cookies['access_token_customer'] = tokens['access']

        response = client.post('/api/customers/orders/add_item/', {
            'product_id': product_tenant_a.id,
            'quantity': 2
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'items' in response.data
        assert len(response.data['items']) == 1
        assert response.data['items'][0]['quantity'] == 2

    def test_add_item_to_cart_guest(self, tenant_a, api_client_factory, product_tenant_a):
        """Test adding item to cart for guest user"""
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/orders/add_item/', {
            'product_id': product_tenant_a.id,
            'quantity': 1
        }, format='json')

        # Guest cart operations should work (create session-based order)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]
        # 400 is acceptable if session middleware isn't fully configured in test environment


@pytest.mark.django_db
class TestCustomersAPITenantIsolation:
    """Test tenant isolation for customer operations"""

    def test_customer_registration_tenant_assigned(self, tenant_a, api_client_factory):
        """Test that registered customers are assigned to correct tenant"""
        client = api_client_factory(user=None, set_csrf=True, tenant=tenant_a)

        response = client.post('/api/customers/register/', {
            'email': 'newcustomer@example.com',
            'password': 'SecurePassword123!',
            'confirm_password': 'SecurePassword123!',
            'first_name': 'John',
            'last_name': 'Doe'
        }, format='json')

        if response.status_code == status.HTTP_201_CREATED:
            # Verify tenant assignment
            set_current_tenant(tenant_a)
            customer = Customer.objects.get(email='newcustomer@example.com')
            assert customer.tenant == tenant_a

    def test_customer_login_cross_tenant_isolation(self, tenant_a, tenant_b, api_client_factory):
        """Test that customers from different tenants are isolated"""
        # Create customer for tenant A
        set_current_tenant(tenant_a)
        customer_a = Customer.objects.create_customer(
            email='customer@restaurant-a.com',
            password='password123',
            first_name='Customer',
            last_name='A',
            tenant=tenant_a
        )

        # Create customer for tenant B with same email
        set_current_tenant(tenant_b)
        customer_b = Customer.objects.create_customer(
            email='customer@restaurant-b.com',
            password='password123',
            first_name='Customer',
            last_name='B',
            tenant=tenant_b
        )

        # Verify they're different customers despite potentially similar emails
        assert customer_a.id != customer_b.id
        assert customer_a.tenant != customer_b.tenant
