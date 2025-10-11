"""
Shared test fixtures for all backend tests.

This module provides reusable pytest fixtures for common test objects
like tenants, users, products, etc.
"""
import pytest
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from users.models import User
from products.models import Product, Category, Tax, ProductType, ModifierSet, ModifierOption
from orders.models import Order, OrderItem
from payments.models import Payment, GiftCard
from discounts.models import Discount
from inventory.models import Location, InventoryStock
from settings.models import GlobalSettings, StoreLocation


# ============================================================================
# TENANT FIXTURES
# ============================================================================

@pytest.fixture
def tenant_a(db):
    """Create test tenant A (Pizza Place)"""
    return Tenant.objects.create(
        name='Pizza Place',
        slug='pizza-place',
        is_active=True
    )


@pytest.fixture
def tenant_b(db):
    """Create test tenant B (Burger Joint)"""
    return Tenant.objects.create(
        name='Burger Joint',
        slug='burger-joint',
        is_active=True
    )


@pytest.fixture
def inactive_tenant(db):
    """Create inactive test tenant"""
    return Tenant.objects.create(
        name='Closed Restaurant',
        slug='closed-restaurant',
        is_active=False
    )


# ============================================================================
# USER FIXTURES
# ============================================================================

@pytest.fixture
def admin_user_tenant_a(tenant_a):
    """Create admin user for tenant A"""
    return User.objects.create_user(
        email='admin@pizza.com',
        username='admin_pizza',
        password='password123',
        tenant=tenant_a,
        role=User.Role.OWNER,
        is_pos_staff=True
    )


@pytest.fixture
def admin_user_tenant_b(tenant_b):
    """Create admin user for tenant B"""
    return User.objects.create_user(
        email='admin@burger.com',
        username='admin_burger',
        password='password123',
        tenant=tenant_b,
        role=User.Role.OWNER,
        is_pos_staff=True
    )


@pytest.fixture
def manager_user_tenant_a(tenant_a):
    """Create manager user for tenant A"""
    return User.objects.create_user(
        email='manager@pizza.com',
        username='manager_pizza',
        password='password123',
        tenant=tenant_a,
        role=User.Role.MANAGER,
        is_pos_staff=True
    )


@pytest.fixture
def cashier_user_tenant_a(tenant_a):
    """Create cashier user for tenant A"""
    return User.objects.create_user(
        email='cashier@pizza.com',
        username='cashier_pizza',
        password='password123',
        tenant=tenant_a,
        role=User.Role.CASHIER,
        is_pos_staff=True
    )


# ============================================================================
# PRODUCT FIXTURES
# ============================================================================

@pytest.fixture
def tax_rate_tenant_a(tenant_a):
    """Create tax rate for tenant A (10%)"""
    return Tax.objects.create(
        name='Sales Tax',
        rate=Decimal('0.10'),
        tenant=tenant_a
    )


@pytest.fixture
def tax_rate_tenant_b(tenant_b):
    """Create tax rate for tenant B (8%)"""
    return Tax.objects.create(
        name='Sales Tax',
        rate=Decimal('0.08'),
        tenant=tenant_b
    )


@pytest.fixture
def category_tenant_a(tenant_a):
    """Create category for tenant A"""
    return Category.objects.create(
        name='Pizzas',
        tenant=tenant_a
    )


@pytest.fixture
def category_tenant_b(tenant_b):
    """Create category for tenant B"""
    return Category.objects.create(
        name='Burgers',
        tenant=tenant_b
    )


@pytest.fixture
def product_type_tenant_a(tenant_a):
    """Create product type for tenant A"""
    return ProductType.objects.create(
        name='Food',
        tenant=tenant_a
    )


@pytest.fixture
def product_type_tenant_b(tenant_b):
    """Create product type for tenant B"""
    return ProductType.objects.create(
        name='Food',
        tenant=tenant_b
    )


@pytest.fixture
def product_tenant_a(tenant_a, category_tenant_a, product_type_tenant_a):
    """Create sample product for tenant A (Pepperoni Pizza)"""
    return Product.objects.create(
        name='Pepperoni Pizza',
        price=Decimal('10.00'),
        tenant=tenant_a,
        category=category_tenant_a,
        product_type=product_type_tenant_a,
        is_active=True
    )


@pytest.fixture
def product_tenant_b(tenant_b, category_tenant_b, product_type_tenant_b):
    """Create sample product for tenant B (Cheeseburger)"""
    return Product.objects.create(
        name='Cheeseburger',
        price=Decimal('8.99'),
        tenant=tenant_b,
        category=category_tenant_b,
        product_type=product_type_tenant_b,
        is_active=True
    )


@pytest.fixture
def modifier_set_tenant_a(tenant_a):
    """Create modifier set for tenant A"""
    return ModifierSet.objects.create(
        name='Size',
        tenant=tenant_a
    )


@pytest.fixture
def modifier_option_tenant_a(tenant_a, modifier_set_tenant_a):
    """Create modifier option for tenant A"""
    return ModifierOption.objects.create(
        modifier_set=modifier_set_tenant_a,
        name='Large',
        price_delta=Decimal('3.00'),
        tenant=tenant_a
    )


# ============================================================================
# ORDER FIXTURES
# ============================================================================

@pytest.fixture
def customer_tenant_a(tenant_a):
    """Create sample customer for tenant A"""
    from customers.models import Customer
    return Customer.objects.create(
        email='customer_a@example.com',
        first_name='Alice',
        last_name='Smith',
        tenant=tenant_a
    )


@pytest.fixture
def order_tenant_a(tenant_a, customer_tenant_a):
    """Create sample order for tenant A"""
    return Order.objects.create(
        tenant=tenant_a,
        order_type=Order.OrderType.POS,
        status=Order.OrderStatus.PENDING,
        customer=customer_tenant_a,
        subtotal=Decimal('0.00'),
        tax_total=Decimal('0.00'),
        grand_total=Decimal('0.00')
    )


@pytest.fixture
def customer_tenant_b(tenant_b):
    """Create sample customer for tenant B"""
    from customers.models import Customer
    return Customer.objects.create(
        email='customer_b@example.com',
        first_name='Bob',
        last_name='Jones',
        tenant=tenant_b
    )


@pytest.fixture
def order_tenant_b(tenant_b, customer_tenant_b):
    """Create sample order for tenant B"""
    return Order.objects.create(
        tenant=tenant_b,
        order_type='takeout',
        status='pending',
        customer=customer_tenant_b,
        subtotal=Decimal('8.99'),
        tax_total=Decimal('0.72'),
        grand_total=Decimal('9.71')
    )


# ============================================================================
# PAYMENT FIXTURES
# ============================================================================

@pytest.fixture
def payment_tenant_a(tenant_a, order_tenant_a):
    """Create payment for tenant A"""
    return Payment.objects.create(
        tenant=tenant_a,
        order=order_tenant_a,
        status='pending',
        total_amount_due=order_tenant_a.grand_total,
        amount_paid=Decimal('0.00')
    )


@pytest.fixture
def gift_card_tenant_a(tenant_a):
    """Create gift card for tenant A"""
    return GiftCard.objects.create(
        tenant=tenant_a,
        code='GIFT-A-12345',
        original_balance=Decimal('50.00'),
        current_balance=Decimal('50.00'),
        status=GiftCard.GiftCardStatus.ACTIVE
    )


@pytest.fixture
def gift_card_tenant_b(tenant_b):
    """Create gift card for tenant B"""
    return GiftCard.objects.create(
        tenant=tenant_b,
        code='GIFT-B-12345',
        original_balance=Decimal('100.00'),
        current_balance=Decimal('100.00'),
        status='active'
    )


# ============================================================================
# DISCOUNT FIXTURES
# ============================================================================

@pytest.fixture
def discount_tenant_a(tenant_a):
    """Create percentage discount for tenant A"""
    return Discount.objects.create(
        tenant=tenant_a,
        name='10% Off',
        code='SAVE10',
        type='PERCENTAGE',
        scope='ORDER',
        value=Decimal('10.00'),
        is_active=True,
        start_date=timezone.now().date(),
        end_date=(timezone.now() + timedelta(days=30)).date()
    )


@pytest.fixture
def discount_tenant_b(tenant_b):
    """Create fixed amount discount for tenant B"""
    return Discount.objects.create(
        tenant=tenant_b,
        name='$5 Off',
        code='SAVE5',
        type='FIXED_AMOUNT',
        scope='ORDER',
        value=Decimal('5.00'),
        is_active=True,
        start_date=timezone.now().date(),
        end_date=(timezone.now() + timedelta(days=30)).date()
    )


# ============================================================================
# INVENTORY FIXTURES
# ============================================================================

@pytest.fixture
def location_tenant_a(tenant_a):
    """Create inventory location for tenant A"""
    return Location.objects.create(
        tenant=tenant_a,
        name='Main Store',
        description='Main store location'
    )


@pytest.fixture
def location_tenant_b(tenant_b):
    """Create inventory location for tenant B"""
    return Location.objects.create(
        tenant=tenant_b,
        name='Main Store',
        description='Main store location'
    )


@pytest.fixture
def inventory_stock_tenant_a(tenant_a, product_tenant_a, location_tenant_a):
    """Create inventory stock for tenant A"""
    return InventoryStock.objects.create(
        tenant=tenant_a,
        product=product_tenant_a,
        location=location_tenant_a,
        quantity=100
    )


@pytest.fixture
def inventory_stock_tenant_b(tenant_b, product_tenant_b, location_tenant_b):
    """Create inventory stock for tenant B"""
    return InventoryStock.objects.create(
        tenant=tenant_b,
        product=product_tenant_b,
        location=location_tenant_b,
        quantity=50
    )


@pytest.fixture
def stock_action_reason(db):
    """Create a global system stock action reason for testing"""
    from settings.models import StockActionReasonConfig
    return StockActionReasonConfig.objects.create(
        name='Test Stock Adjustment',
        category='MANUAL',
        description='Stock adjustment for testing purposes',
        is_active=True,
        is_system_reason=True,  # Must be True for tenant=None
        tenant=None  # Global reason
    )


# ============================================================================
# SETTINGS FIXTURES
# ============================================================================

@pytest.fixture
def global_settings_tenant_a(tenant_a):
    """Create global settings for tenant A"""
    from tenant.managers import set_current_tenant
    set_current_tenant(tenant_a)
    return GlobalSettings.objects.create(
        tenant=tenant_a,
        store_name='Pizza Place',
        store_email='info@pizza.com',
        store_phone='555-0100',
        tax_rate=Decimal('0.10')
    )


@pytest.fixture
def global_settings_tenant_b(tenant_b):
    """Create global settings for tenant B"""
    from tenant.managers import set_current_tenant
    set_current_tenant(tenant_b)
    return GlobalSettings.objects.create(
        tenant=tenant_b,
        store_name='Burger Joint',
        store_email='info@burger.com',
        store_phone='555-0200',
        tax_rate=Decimal('0.08')
    )


@pytest.fixture
def store_location_tenant_a(tenant_a):
    """Create store location for tenant A"""
    return StoreLocation.objects.create(
        tenant=tenant_a,
        name='Main Location',
        address='123 Pizza St, New York, NY 10001',
        phone='555-0100',
        email='info@pizza.com',
        is_default=True
    )


@pytest.fixture
def store_location_tenant_b(tenant_b):
    """Create store location for tenant B"""
    return StoreLocation.objects.create(
        tenant=tenant_b,
        name='Main Location',
        address='456 Burger Ave, Los Angeles, CA 90001',
        phone='555-0200',
        email='info@burger.com',
        is_default=True
    )


# ============================================================================
# API CLIENT FIXTURES (for API Integration Tests)
# ============================================================================

@pytest.fixture
def api_client_factory():
    """
    Factory fixture for creating authenticated API clients.

    Handles:
    - JWT token generation and cookie setting
    - CSRF double-submit protection (cookie + header)
    - Tenant context from JWT claims
    - Session tenant_id for customer endpoints

    Usage:
        def test_create_order(api_client_factory, admin_user_tenant_a):
            client = api_client_factory(admin_user_tenant_a)
            response = client.post('/api/orders/', {'order_type': 'dine_in'})

        def test_customer_register(api_client_factory, tenant_a):
            client = api_client_factory(user=None, tenant=tenant_a)
            response = client.post('/api/customers/register/', {...})
    """
    import secrets
    from rest_framework.test import APIClient
    from users.services import UserService

    def _create_client(user=None, set_csrf=True, tenant=None):
        """
        Create an API client with authentication and CSRF protection.

        Args:
            user: User instance to authenticate as (None for guest client)
            set_csrf: Whether to set CSRF token (default True)
            tenant: Tenant instance to set in session (for customer endpoints)

        Returns:
            APIClient configured with authentication cookies and headers
        """
        client = APIClient()

        if user:
            # Generate JWT tokens (includes tenant_id and tenant_slug claims)
            tokens = UserService.generate_tokens_for_user(user)

            # Set JWT in cookies (matches production behavior)
            client.cookies['access_token'] = tokens['access']
            client.cookies['refresh_token'] = tokens['refresh']

        if set_csrf:
            # Generate CSRF token for double-submit protection
            csrf_token = secrets.token_urlsafe(32)

            # Set CSRF cookie (for double-submit CSRF check)
            client.cookies['csrf_token'] = csrf_token
            client.cookies['csrftoken'] = csrf_token  # Django's default cookie name

            # Set CSRF header (RequiresAntiCSRFHeader expects X-CSRF-Token)
            client.credentials(HTTP_X_CSRF_TOKEN=csrf_token)

        if tenant:
            # Set tenant in session for customer endpoints (TenantMiddleware resolution)
            # Force session creation by accessing it
            session = client.session
            session['tenant_id'] = str(tenant.id)
            session.save()

        return client

    return _create_client


@pytest.fixture
def authenticated_client(api_client_factory):
    """
    Convenience fixture that returns a factory for authenticated clients.

    This is an alias for api_client_factory for backwards compatibility
    and clearer test code.

    Usage:
        def test_example(authenticated_client, admin_user_tenant_a):
            client = authenticated_client(admin_user_tenant_a)
            response = client.get('/api/orders/')
    """
    return api_client_factory


@pytest.fixture
def guest_client(api_client_factory):
    """
    Create a guest API client (unauthenticated but with CSRF).

    Usage:
        def test_guest_order(guest_client):
            response = guest_client.post('/api/orders/', {...})
    """
    return api_client_factory(user=None, set_csrf=True)


@pytest.fixture
def csrf_exempt_client():
    """
    Create an API client without CSRF protection.

    Useful for testing endpoints that are CSRF-exempt (like login).

    Usage:
        def test_login(csrf_exempt_client):
            response = csrf_exempt_client.post('/api/auth/login/', {...})
    """
    from rest_framework.test import APIClient
    return APIClient()
