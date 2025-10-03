"""
Tenant isolation tests.

Tests for multi-tenancy infrastructure including:
- TenantManager filtering
- TenantMiddleware resolution
- Thread-local context management
- Tenant isolation across models
"""

from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import override_settings

from tenant.models import Tenant
from tenant.managers import set_current_tenant, get_current_tenant, TenantManager
from tenant.middleware import TenantMiddleware
from products.models import Product, Category, Tax, ProductType
from discounts.models import Discount
from orders.models import Order
from payments.models import Payment


User = get_user_model()


class TenantManagerTestCase(TestCase):
    """Test TenantManager automatic filtering."""

    def setUp(self):
        """Create test tenants and data."""
        # Create tenants
        self.tenant1 = Tenant.objects.create(
            slug='tenant1',
            name='Tenant 1',
            business_name='Tenant 1 Business',
            contact_email='tenant1@example.com',
            is_active=True
        )
        self.tenant2 = Tenant.objects.create(
            slug='tenant2',
            name='Tenant 2',
            business_name='Tenant 2 Business',
            contact_email='tenant2@example.com',
            is_active=True
        )

        # Create products for each tenant
        self.tax1 = Tax.objects.create(tenant=self.tenant1, name='VAT 1', rate=10.0)
        self.tax2 = Tax.objects.create(tenant=self.tenant2, name='VAT 2', rate=20.0)

    def tearDown(self):
        """Clean up tenant context after each test."""
        set_current_tenant(None)

    def test_no_tenant_context_returns_empty(self):
        """Test that queries return empty queryset when no tenant context is set."""
        set_current_tenant(None)

        # Should return empty queryset (fail-closed)
        self.assertEqual(Tax.objects.count(), 0)
        self.assertFalse(Tax.objects.exists())

    def test_tenant1_sees_only_own_data(self):
        """Test that tenant1 only sees their own data."""
        set_current_tenant(self.tenant1)

        taxes = Tax.objects.all()
        self.assertEqual(taxes.count(), 1)
        self.assertEqual(taxes.first().name, 'VAT 1')
        self.assertEqual(taxes.first().tenant, self.tenant1)

    def test_tenant2_sees_only_own_data(self):
        """Test that tenant2 only sees their own data."""
        set_current_tenant(self.tenant2)

        taxes = Tax.objects.all()
        self.assertEqual(taxes.count(), 1)
        self.assertEqual(taxes.first().name, 'VAT 2')
        self.assertEqual(taxes.first().tenant, self.tenant2)

    def test_switching_tenant_context(self):
        """Test switching between tenant contexts."""
        # Start with tenant1
        set_current_tenant(self.tenant1)
        self.assertEqual(Tax.objects.count(), 1)
        self.assertEqual(Tax.objects.first().name, 'VAT 1')

        # Switch to tenant2
        set_current_tenant(self.tenant2)
        self.assertEqual(Tax.objects.count(), 1)
        self.assertEqual(Tax.objects.first().name, 'VAT 2')

        # Clear context
        set_current_tenant(None)
        self.assertEqual(Tax.objects.count(), 0)

    def test_all_objects_manager_bypasses_filter(self):
        """Test that all_objects manager bypasses tenant filtering."""
        set_current_tenant(self.tenant1)

        # Default manager sees only tenant1 data
        self.assertEqual(Tax.objects.count(), 1)

        # all_objects manager sees all data
        self.assertEqual(Tax.all_objects.count(), 2)

    def test_filter_by_specific_tenant(self):
        """Test explicitly filtering by tenant."""
        set_current_tenant(self.tenant1)

        # Even with tenant1 context, can't query tenant2 data with default manager
        tenant2_taxes = Tax.objects.filter(tenant=self.tenant2)
        self.assertEqual(tenant2_taxes.count(), 0)

        # But can with all_objects
        tenant2_taxes_all = Tax.all_objects.filter(tenant=self.tenant2)
        self.assertEqual(tenant2_taxes_all.count(), 1)

    def test_get_by_id_respects_tenant(self):
        """Test that get() respects tenant filtering."""
        set_current_tenant(self.tenant1)

        # Can get tenant1's tax
        tax = Tax.objects.get(id=self.tax1.id)
        self.assertEqual(tax.name, 'VAT 1')

        # Cannot get tenant2's tax
        with self.assertRaises(Tax.DoesNotExist):
            Tax.objects.get(id=self.tax2.id)

    def test_create_uses_current_tenant(self):
        """Test that creating objects requires tenant context."""
        set_current_tenant(self.tenant1)

        # Create with explicit tenant works
        tax = Tax.objects.create(tenant=self.tenant1, name='GST', rate=5.0)
        self.assertEqual(tax.tenant, self.tenant1)

        # Can retrieve it
        self.assertEqual(Tax.objects.filter(name='GST').count(), 1)

    def test_update_respects_tenant(self):
        """Test that updates respect tenant filtering."""
        set_current_tenant(self.tenant1)

        # Can update tenant1's data
        Tax.objects.filter(id=self.tax1.id).update(rate=15.0)
        self.tax1.refresh_from_db()
        self.assertEqual(self.tax1.rate, 15.0)

        # Cannot update tenant2's data (filtered out)
        updated_count = Tax.objects.filter(id=self.tax2.id).update(rate=25.0)
        self.assertEqual(updated_count, 0)
        self.tax2.refresh_from_db()
        self.assertEqual(self.tax2.rate, 20.0)  # Unchanged

    def test_delete_respects_tenant(self):
        """Test that deletes respect tenant filtering."""
        set_current_tenant(self.tenant1)

        # Cannot delete tenant2's data (filtered out)
        deleted_count = Tax.objects.filter(id=self.tax2.id).delete()[0]
        self.assertEqual(deleted_count, 0)
        self.assertTrue(Tax.all_objects.filter(id=self.tax2.id).exists())


class TenantMiddlewareTestCase(TestCase):
    """Test TenantMiddleware resolution logic."""

    def setUp(self):
        """Set up test tenants and request factory."""
        self.factory = RequestFactory()
        self.middleware = TenantMiddleware(get_response=lambda r: None)

        # Add test hosts to ALLOWED_HOSTS for this test
        from django.conf import settings
        self.original_allowed_hosts = settings.ALLOWED_HOSTS
        settings.ALLOWED_HOSTS = ['*']  # Allow all hosts for testing

        self.tenant1 = Tenant.objects.create(
            slug='joespizza',
            name='Joe\'s Pizza',
            business_name='Joe\'s Pizza Restaurant',
            contact_email='joe@joespizza.com',
            is_active=True
        )
        self.tenant2 = Tenant.objects.create(
            slug='mariacafe',
            name='Maria\'s Cafe',
            business_name='Maria\'s Cafe',
            contact_email='maria@mariacafe.com',
            is_active=True
        )
        self.inactive_tenant = Tenant.objects.create(
            slug='inactive',
            name='Inactive Tenant',
            business_name='Inactive Business',
            contact_email='inactive@example.com',
            is_active=False
        )

        # Create user with tenant
        self.user = User.objects.create_user(
            email='staff@joespizza.com',
            username='staffuser',
            password='testpass123',
            tenant=self.tenant1
        )

    def tearDown(self):
        """Clean up tenant context."""
        set_current_tenant(None)

        # Restore original ALLOWED_HOSTS
        from django.conf import settings
        settings.ALLOWED_HOSTS = self.original_allowed_hosts

    def test_subdomain_resolution(self):
        """Test tenant resolution from subdomain."""
        request = self.factory.get('/', HTTP_HOST='joespizza.ajeen.com')
        request.session = {}

        # Mock anonymous user
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        tenant = self.middleware.get_tenant_from_request(request)
        self.assertEqual(tenant, self.tenant1)

    def test_authenticated_user_tenant(self):
        """Test tenant resolution from authenticated user."""
        request = self.factory.get('/', HTTP_HOST='localhost')
        request.user = self.user

        tenant = self.middleware.get_tenant_from_request(request)
        self.assertEqual(tenant, self.tenant1)

    def test_admin_path_resolution(self):
        """Test tenant resolution from admin path."""
        request = self.factory.get('/mariacafe/products/', HTTP_HOST='admin.ajeen.com')
        request.session = {}

        # Mock anonymous user
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        tenant = self.middleware.get_tenant_from_request(request)
        self.assertEqual(tenant, self.tenant2)

    @override_settings(DEFAULT_TENANT_SLUG='joespizza')
    def test_development_fallback(self):
        """Test fallback to DEFAULT_TENANT_SLUG for localhost."""
        request = self.factory.get('/', HTTP_HOST='localhost:8000')
        request.session = {}

        # Mock anonymous user
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        tenant = self.middleware.get_tenant_from_request(request)
        self.assertEqual(tenant, self.tenant1)

    def test_inactive_tenant_returns_none(self):
        """Test that inactive tenants are not resolved."""
        request = self.factory.get('/', HTTP_HOST='inactive.ajeen.com')
        request.session = {}

        # Mock anonymous user
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        # Should raise TenantNotFoundError for inactive tenant
        from tenant.middleware import TenantNotFoundError
        with self.assertRaises(TenantNotFoundError):
            self.middleware.get_tenant_from_request(request)

    def test_nonexistent_tenant_returns_none(self):
        """Test that non-existent tenants return None."""
        request = self.factory.get('/', HTTP_HOST='doesnotexist.ajeen.com')
        request.session = {}

        # Mock anonymous user
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        # Should raise TenantNotFoundError for non-existent tenant
        from tenant.middleware import TenantNotFoundError
        with self.assertRaises(TenantNotFoundError):
            self.middleware.get_tenant_from_request(request)

    def test_django_admin_skips_resolution(self):
        """Test that /admin/ URLs skip tenant resolution."""
        # Create a stub that records the request
        def stub_get_response(request):
            # Store the request for later inspection
            stub_get_response.captured_request = request
            return None

        middleware = TenantMiddleware(get_response=stub_get_response)
        request = self.factory.get('/admin/products/product/')
        request.session = {}

        # Call middleware
        middleware(request)

        # Assert tenant was not set
        self.assertIsNone(request.tenant)

        # Assert thread-local context is also None (cleaned up)
        self.assertIsNone(get_current_tenant())


class ThreadLocalCleanupTestCase(TestCase):
    """Test thread-local tenant context cleanup."""

    def setUp(self):
        """Create test tenant."""
        self.factory = RequestFactory()

        self.tenant = Tenant.objects.create(
            slug='testcafe',
            name='Test Cafe',
            business_name='Test Cafe Business',
            contact_email='test@cafe.com',
            is_active=True
        )

        # Add test hosts to ALLOWED_HOSTS for this test
        from django.conf import settings
        self.original_allowed_hosts = settings.ALLOWED_HOSTS
        settings.ALLOWED_HOSTS = ['*']

    def tearDown(self):
        """Clean up tenant context."""
        set_current_tenant(None)

        # Restore original ALLOWED_HOSTS
        from django.conf import settings
        settings.ALLOWED_HOSTS = self.original_allowed_hosts

    def test_set_and_get_current_tenant(self):
        """Test setting and getting current tenant."""
        set_current_tenant(self.tenant)
        self.assertEqual(get_current_tenant(), self.tenant)

    def test_clear_tenant_context(self):
        """Test clearing tenant context."""
        set_current_tenant(self.tenant)
        self.assertIsNotNone(get_current_tenant())

        set_current_tenant(None)
        self.assertIsNone(get_current_tenant())

    def test_tenant_context_isolation_between_tests(self):
        """Test that tenant context doesn't leak between tests."""
        # This test should start with no tenant context
        self.assertIsNone(get_current_tenant())

        # Set tenant
        set_current_tenant(self.tenant)
        self.assertEqual(get_current_tenant(), self.tenant)

    def test_exception_cleanup(self):
        """Test that tenant context is cleaned up even after exception."""
        # Create a get_response that always raises
        def error_response(request):
            raise ValueError("View exploded")

        middleware = TenantMiddleware(get_response=error_response)

        # Create request that resolves to a real tenant
        request = self.factory.get('/', HTTP_HOST='testcafe.ajeen.com')
        request.session = {}

        # Mock anonymous user
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()

        # Middleware should raise the error but clean up context in finally block
        with self.assertRaises(ValueError):
            middleware(request)

        # Context should be cleaned up despite the exception
        self.assertIsNone(get_current_tenant())


class CrossTenantIsolationTestCase(TestCase):
    """Test isolation between tenants across different models."""

    def setUp(self):
        """Create test tenants and data."""
        self.tenant1 = Tenant.objects.create(
            slug='restaurant1',
            name='Restaurant 1',
            business_name='Restaurant 1 Business',
            contact_email='contact@restaurant1.com',
            is_active=True
        )
        self.tenant2 = Tenant.objects.create(
            slug='restaurant2',
            name='Restaurant 2',
            business_name='Restaurant 2 Business',
            contact_email='contact@restaurant2.com',
            is_active=True
        )

        # Create users
        self.user1 = User.objects.create_user(
            email='user@restaurant1.com',
            username='user1',
            password='pass123',
            tenant=self.tenant1
        )
        self.user2 = User.objects.create_user(
            email='user@restaurant2.com',
            username='user2',
            password='pass123',
            tenant=self.tenant2
        )

        # Create products
        self.tax1 = Tax.objects.create(tenant=self.tenant1, name='VAT', rate=10.0)
        self.tax2 = Tax.objects.create(tenant=self.tenant2, name='VAT', rate=10.0)

        self.product_type1 = ProductType.objects.create(
            tenant=self.tenant1,
            name='Food',
            description='Food products'
        )
        self.product_type2 = ProductType.objects.create(
            tenant=self.tenant2,
            name='Food',
            description='Food products'
        )

    def tearDown(self):
        """Clean up tenant context."""
        set_current_tenant(None)

    def test_users_isolated_by_tenant(self):
        """Test that users are isolated by tenant."""
        set_current_tenant(self.tenant1)

        users = User.objects.all()
        self.assertEqual(users.count(), 1)
        self.assertEqual(users.first().email, 'user@restaurant1.com')

    def test_products_isolated_by_tenant(self):
        """Test that products are isolated by tenant."""
        set_current_tenant(self.tenant1)

        product_types = ProductType.objects.all()
        self.assertEqual(product_types.count(), 1)
        self.assertEqual(product_types.first().tenant, self.tenant1)

    def test_same_name_different_tenants(self):
        """Test that same names can exist across different tenants."""
        # Both tenants have 'VAT' tax and 'Food' product type
        set_current_tenant(self.tenant1)
        self.assertEqual(Tax.objects.filter(name='VAT').count(), 1)
        self.assertEqual(ProductType.objects.filter(name='Food').count(), 1)

        set_current_tenant(self.tenant2)
        self.assertEqual(Tax.objects.filter(name='VAT').count(), 1)
        self.assertEqual(ProductType.objects.filter(name='Food').count(), 1)

    def test_foreign_key_relationships_respect_tenant(self):
        """Test that FK relationships respect tenant boundaries."""
        set_current_tenant(self.tenant1)

        # Create product for tenant1
        product1 = Product.objects.create(
            tenant=self.tenant1,
            name='Product 1',
            product_type=self.product_type1,
            price=10.00
        )
        product1.taxes.add(self.tax1)

        # Verify same-tenant relationships work
        self.assertEqual(product1.taxes.count(), 1)
        self.assertEqual(product1.taxes.first(), self.tax1)

        # Try to add tenant2's tax to tenant1's product
        product1.taxes.add(self.tax2)

        # Verify cross-tenant tax is filtered out when querying
        # (Manager filters apply to M2M relationships too)
        self.assertEqual(product1.taxes.count(), 1)  # Still only sees tax1
        self.assertEqual(product1.taxes.first(), self.tax1)

        # The cross-tenant tax is silently filtered from the M2M relationship
        # This demonstrates fail-safe filtering: relationships respect tenant boundaries
        # even when the DB physically allows the relationship


class TenantUniqueConstraintTestCase(TestCase):
    """Test tenant-scoped unique constraints."""

    def setUp(self):
        """Create test tenants."""
        self.tenant1 = Tenant.objects.create(
            slug='tenant1',
            name='Tenant 1',
            business_name='Tenant 1 Business',
            contact_email='contact@tenant1.com',
            is_active=True
        )
        self.tenant2 = Tenant.objects.create(
            slug='tenant2',
            name='Tenant 2',
            business_name='Tenant 2 Business',
            contact_email='contact@tenant2.com',
            is_active=True
        )

    def tearDown(self):
        """Clean up tenant context."""
        set_current_tenant(None)

    def test_same_email_different_tenants(self):
        """Test that same email can exist in different tenants."""
        # Create user with same email in both tenants
        user1 = User.objects.create_user(
            email='manager@restaurant.com',
            username='manager1',
            password='pass123',
            tenant=self.tenant1
        )
        user2 = User.objects.create_user(
            email='manager@restaurant.com',
            username='manager2',
            password='pass123',
            tenant=self.tenant2
        )

        self.assertEqual(user1.email, user2.email)
        self.assertNotEqual(user1.tenant, user2.tenant)

    def test_duplicate_email_same_tenant_fails(self):
        """Test that duplicate email in same tenant fails."""
        User.objects.create_user(
            email='user@tenant1.com',
            username='user1',
            password='pass123',
            tenant=self.tenant1
        )

        # Try to create another user with same email in same tenant
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            User.objects.create_user(
                email='user@tenant1.com',
                username='user2',
                password='pass123',
                tenant=self.tenant1
            )

    def test_same_tax_name_different_tenants(self):
        """Test that same tax name can exist in different tenants."""
        tax1 = Tax.objects.create(tenant=self.tenant1, name='Sales Tax', rate=8.0)
        tax2 = Tax.objects.create(tenant=self.tenant2, name='Sales Tax', rate=10.0)

        self.assertEqual(tax1.name, tax2.name)
        self.assertNotEqual(tax1.rate, tax2.rate)
        self.assertNotEqual(tax1.tenant, tax2.tenant)
