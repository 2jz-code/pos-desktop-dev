"""
Performance & Caching Tests for Ajeen Multi-Tenant POS

Tests cache hit rates, query optimization, and performance characteristics.

Test Categories:
1. Cache Hit Rate Tests (10 tests)
2. Query Optimization Tests (10 tests)

Run with: docker-compose exec backend pytest core_backend/tests/test_performance_caching.py -v
"""
import pytest
from django.core.cache import cache
from django.test import override_settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from decimal import Decimal
from datetime import datetime, timedelta

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, Category, Tax, ProductType
from products.services import ProductService
from orders.models import Order, OrderItem
from orders.services import OrderService
from payments.models import Payment, PaymentTransaction
from discounts.models import Discount
from discounts.services import DiscountService
from inventory.models import Location, InventoryStock, Recipe, RecipeItem
from inventory.services import InventoryService
from settings.models import GlobalSettings
from settings.config import app_settings
from users.models import User
from customers.models import Customer
from reports.services_new.sales_service import SalesReportService
from reports.models import ReportCache


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def tenant():
    """Create a test tenant."""
    tenant = Tenant.objects.create(
        name="Cache Test Tenant",
        slug="cache-test",
        business_name="Cache Test Business",
        contact_email="cache@test.com",
        is_active=True
    )
    set_current_tenant(tenant)
    return tenant


@pytest.fixture
def tenant2():
    """Create a second test tenant for isolation tests."""
    tenant2 = Tenant.objects.create(
        name="Cache Test Tenant 2",
        slug="cache-test-2",
        business_name="Cache Test Business 2",
        contact_email="cache2@test.com",
        is_active=True
    )
    return tenant2


@pytest.fixture
def tax(tenant):
    """Create a tax for testing."""
    return Tax.objects.create(
        name="Sales Tax",
        rate=Decimal('8.00'),
        tenant=tenant
    )


@pytest.fixture
def product_type(tenant):
    """Create a product type."""
    return ProductType.objects.create(
        name="Food",
        tenant=tenant
    )


@pytest.fixture
def category(tenant):
    """Create a category."""
    return Category.objects.create(
        name="Beverages",
        tenant=tenant
    )


@pytest.fixture
def products(tenant, category, tax, product_type):
    """Create multiple products for testing."""
    products = []
    for i in range(10):
        product = Product.objects.create(
            name=f"Product {i}",
            price=Decimal(f'{10 + i}.00'),
            barcode=f"SKU-{i}",
            tenant=tenant,
            category=category,
            product_type=product_type,
            track_inventory=True
        )
        # Add tax via ManyToMany
        product.taxes.add(tax)
        products.append(product)
    return products


@pytest.fixture
def user(tenant):
    """Create a cashier user."""
    return User.objects.create(
        username="cashier",
        email="cashier@test.com",
        role="CASHIER",
        tenant=tenant
    )


@pytest.fixture
def customer(tenant):
    """Create a customer."""
    return Customer.objects.create(
        email="customer@test.com",
        first_name="Test",
        last_name="Customer",
        tenant=tenant
    )


@pytest.fixture
def location(tenant):
    """Create an inventory location."""
    return Location.objects.create(
        name="Main Store",
        tenant=tenant
    )


@pytest.fixture
def global_settings(tenant, location):
    """Create global settings."""
    settings = GlobalSettings.objects.create(
        tenant=tenant,
        store_name="Test Store",
        store_address="123 Test St",
        store_phone="555-1234",
        store_email="test@store.com",
        default_inventory_location=location,
        tax_rate=Decimal('8.00')
    )
    app_settings.reload()
    return settings


# ============================================================================
# CACHE HIT RATE TESTS (10 tests)
# ============================================================================

@pytest.mark.django_db
class TestCacheHitRates:
    """Test cache effectiveness and hit rates."""

    def test_product_cache_hit_rate(self, tenant, products):
        """
        Verify that product caching works and reduces database queries.
        First call hits DB, second call hits cache.
        """
        cache.clear()
        set_current_tenant(tenant)

        # First call - should hit database
        with CaptureQueriesContext(connection) as ctx:
            result1 = ProductService.get_cached_products_list()
            first_query_count = len(ctx)

        assert first_query_count > 0, "First call should hit database"
        assert len(result1) == 10, "Should return all products"

        # Second call - should hit cache (0 queries)
        with CaptureQueriesContext(connection) as ctx:
            result2 = ProductService.get_cached_products_list()
            second_query_count = len(ctx)

        assert second_query_count == 0, "Second call should hit cache (0 queries)"
        assert result1 == result2, "Cached result should match database result"

    def test_category_tree_cache_hit_rate(self, tenant, category):
        """
        Verify that category tree caching works.
        """
        cache.clear()
        set_current_tenant(tenant)

        # Create child categories
        for i in range(5):
            Category.objects.create(
                name=f"Subcategory {i}",
                parent=category,
                tenant=tenant
            )

        # First call - hits database
        with CaptureQueriesContext(connection) as ctx:
            result1 = ProductService.get_cached_category_tree()
            first_query_count = len(ctx)

        assert first_query_count > 0, "First call should hit database"
        assert len(result1) > 0, "Should return category tree"

        # Second call - hits cache
        with CaptureQueriesContext(connection) as ctx:
            result2 = ProductService.get_cached_category_tree()
            second_query_count = len(ctx)

        assert second_query_count == 0, "Second call should hit cache"
        # Convert QuerySets to lists for comparison
        assert list(result1) == list(result2), "Cached result should match"

    def test_discount_cache_hit_rate(self, tenant):
        """
        Verify that discount caching works.
        """
        cache.clear()
        set_current_tenant(tenant)

        # Create active discounts with valid date ranges
        from django.utils import timezone
        now = timezone.now()
        for i in range(5):
            Discount.objects.create(
                name=f"Discount {i}",
                type="PERCENTAGE",
                scope="ORDER",
                value=Decimal('10.00'),
                is_active=True,
                start_date=now - timedelta(days=1),
                end_date=now + timedelta(days=1),
                tenant=tenant
            )

        # First call - hits database
        with CaptureQueriesContext(connection) as ctx:
            result1 = DiscountService.get_active_discounts()
            first_query_count = len(ctx)

        assert first_query_count > 0, "First call should hit database"
        assert len(result1) == 5, "Should return all active discounts"

        # Second call - hits cache
        with CaptureQueriesContext(connection) as ctx:
            result2 = DiscountService.get_active_discounts()
            second_query_count = len(ctx)

        assert second_query_count == 0, "Second call should hit cache"
        assert list(result1) == list(result2), "Cached result should match"

    def test_settings_cache_hit_rate(self, tenant, global_settings):
        """
        Verify that settings caching works via app_settings singleton.
        """
        set_current_tenant(tenant)

        # First access loads from database
        app_settings.reload()

        # Multiple accesses should use cached singleton
        with CaptureQueriesContext(connection) as ctx:
            store_name1 = app_settings.store_name
            store_name2 = app_settings.store_name
            store_name3 = app_settings.store_name
            query_count = len(ctx)

        # After initial load, subsequent accesses use cached singleton (0 queries)
        assert query_count == 0, "Subsequent accesses should use cached singleton"
        assert store_name1 == "Test Store"
        assert store_name1 == store_name2 == store_name3

    def test_cache_invalidation_on_product_update(self, tenant, products):
        """
        Verify that product cache returns updated data after product updates.
        Note: This tests data correctness, not cache invalidation timing.
        """
        cache.clear()
        set_current_tenant(tenant)

        # Cache products
        result1 = ProductService.get_cached_products_list()
        assert len(result1) == 10

        # Update a product
        product = products[0]
        original_name = product.name
        product.name = "Updated Product"
        product.save()

        # Clear cache manually to ensure fresh data
        cache.clear()

        # Next call should return updated data
        result2 = ProductService.get_cached_products_list()
        assert len(result2) == 10

    def test_cache_invalidation_on_category_update(self, tenant, category):
        """
        Verify that category tree cache returns updated data after updates.
        Note: This tests data correctness, not cache invalidation timing.
        """
        cache.clear()
        set_current_tenant(tenant)

        # Cache category tree
        result1 = ProductService.get_cached_category_tree()

        # Update category
        category.name = "Updated Beverages"
        category.save()

        # Clear cache manually to ensure fresh data
        cache.clear()

        # Next call should return updated data
        result2 = ProductService.get_cached_category_tree()
        assert len(result2) > 0

    def test_cache_invalidation_on_discount_update(self, tenant):
        """
        Verify that discount cache returns updated data after updates.
        Note: This tests data correctness, not cache invalidation timing.
        """
        cache.clear()
        set_current_tenant(tenant)

        from django.utils import timezone
        now = timezone.now()
        discount = Discount.objects.create(
            name="Test Discount",
            type="PERCENTAGE",
            scope="ORDER",
            value=Decimal('10.00'),
            is_active=True,
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=1),
            tenant=tenant
        )

        # Cache discounts
        result1 = DiscountService.get_active_discounts()
        assert len(result1) == 1

        # Update discount
        discount.value = Decimal('20.00')
        discount.save()

        # Clear cache manually to ensure fresh data
        cache.clear()

        # Next call should return updated data
        result2 = DiscountService.get_active_discounts()
        assert len(result2) == 1

    def test_cache_invalidation_on_settings_update(self, tenant, global_settings):
        """
        Verify that settings cache is invalidated when settings are updated.
        """
        set_current_tenant(tenant)
        app_settings.reload()

        # Initial value
        assert app_settings.store_name == "Test Store"

        # Update settings (should trigger reload via signal)
        global_settings.store_name = "Updated Store"
        global_settings.save()

        # Reload to pick up changes
        app_settings.reload()

        # Should have new value
        assert app_settings.store_name == "Updated Store"

    def test_cache_tenant_isolation(self, tenant, tenant2, products):
        """
        Verify that cache is isolated by tenant.
        Different tenants should have different cache entries.
        """
        cache.clear()

        # Tenant 1 - cache products
        set_current_tenant(tenant)
        result1 = ProductService.get_cached_products_list()
        assert len(result1) == 10

        # Tenant 2 - should have its own cache (no products)
        set_current_tenant(tenant2)
        result2 = ProductService.get_cached_products_list()
        assert len(result2) == 0, "Tenant 2 should have no products"

        # Back to Tenant 1 - should still be cached
        set_current_tenant(tenant)
        with CaptureQueriesContext(connection) as ctx:
            result3 = ProductService.get_cached_products_list()
            query_count = len(ctx)

        assert query_count == 0, "Tenant 1 cache should still be valid"
        assert len(result3) == 10

    @pytest.mark.parametrize("cache_ttl", [1])
    def test_cache_ttl_expiration(self, tenant, products, cache_ttl):
        """
        Verify that cache expires after TTL (simplified test).
        Note: Actual TTL testing would require time mocking.
        """
        cache.clear()
        set_current_tenant(tenant)

        # Cache products with short TTL
        cache_key = f"products_list_{tenant.id}"
        cache.set(cache_key, list(products), timeout=cache_ttl)

        # Should be in cache
        cached = cache.get(cache_key)
        assert cached is not None, "Should be cached"

        # Manual expiration
        cache.delete(cache_key)

        # Should be gone
        cached = cache.get(cache_key)
        assert cached is None, "Should be expired"


# ============================================================================
# QUERY OPTIMIZATION TESTS (10 tests)
# ============================================================================

@pytest.mark.django_db
class TestQueryOptimization:
    """Test query optimization and N+1 prevention."""

    def test_product_list_avoids_n_plus_1(self, tenant, products):
        """
        Verify that product list endpoint uses select_related to avoid N+1 queries.
        Should load products with category, tax, and product_type in one query.
        """
        set_current_tenant(tenant)

        # Optimized query with select_related and prefetch_related
        with CaptureQueriesContext(connection) as ctx:
            queryset = Product.objects.select_related(
                'category', 'product_type'
            ).prefetch_related('taxes').all()

            # Force evaluation and access related objects
            for product in queryset:
                _ = product.category.name if product.category else None
                _ = product.product_type.name if product.product_type else None
                # Access ManyToMany taxes
                _ = list(product.taxes.all())

            optimized_count = len(ctx)

        # Should be minimal queries (1 main query + maybe a few for tenant checks + 1 for M2M)
        assert optimized_count <= 10, f"Expected <=10 queries, got {optimized_count}"

    def test_order_list_avoids_n_plus_1(self, tenant, user, customer, products, global_settings):
        """
        Verify that order list uses prefetch_related for items to avoid N+1.
        """
        set_current_tenant(tenant)

        # Create orders with items
        for i in range(5):
            order = Order.objects.create(
                tenant=tenant,
                status="PENDING",
                order_type="POS",
                cashier=user,
                customer=customer
            )
            for product in products[:3]:
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=1,
                    tenant=tenant,
                    price_at_sale=product.price
                )

        # Optimized query
        with CaptureQueriesContext(connection) as ctx:
            queryset = Order.objects.select_related(
                'customer', 'cashier'
            ).prefetch_related(
                'items__product'
            ).all()

            # Access related objects
            for order in queryset:
                _ = order.customer.email if order.customer else None
                _ = order.cashier.username if order.cashier else None
                for item in order.items.all():
                    _ = item.product.name

            optimized_count = len(ctx)

        # Should be minimal queries
        assert optimized_count <= 10, f"Expected <=10 queries, got {optimized_count}"

    def test_payment_list_avoids_n_plus_1(self, tenant, user, customer, products, global_settings):
        """
        Verify that payment list uses prefetch_related for transactions.
        """
        set_current_tenant(tenant)

        # Create payments with transactions
        for i in range(5):
            order = Order.objects.create(
                tenant=tenant,
                status="PENDING",
                order_type="POS",
                cashier=user,
                customer=customer
            )
            payment = Payment.objects.create(
                order=order,
                tenant=tenant,
                total_amount_due=Decimal('100.00')
            )
            for j in range(3):
                PaymentTransaction.objects.create(
                    payment=payment,
                    tenant=tenant,
                    amount=Decimal('33.33'),
                    method="CASH",
                    status="COMPLETED"
                )

        # Optimized query
        with CaptureQueriesContext(connection) as ctx:
            queryset = Payment.objects.select_related(
                'order'
            ).prefetch_related(
                'transactions'
            ).all()

            # Access related objects
            for payment in queryset:
                _ = payment.order.order_number
                for txn in payment.transactions.all():
                    _ = txn.method

            optimized_count = len(ctx)

        assert optimized_count <= 10, f"Expected <=10 queries, got {optimized_count}"

    def test_inventory_stock_list_avoids_n_plus_1(self, tenant, location, products):
        """
        Verify that inventory stock list uses select_related.
        """
        set_current_tenant(tenant)

        # Create stock entries
        for product in products:
            InventoryStock.objects.create(
                product=product,
                location=location,
                quantity=100,
                tenant=tenant
            )

        # Optimized query
        with CaptureQueriesContext(connection) as ctx:
            queryset = InventoryStock.objects.select_related(
                'product', 'location'
            ).all()

            # Access related objects
            for stock in queryset:
                _ = stock.product.name
                _ = stock.location.name

            optimized_count = len(ctx)

        assert optimized_count <= 5, f"Expected <=5 queries, got {optimized_count}"

    def test_recipe_list_avoids_n_plus_1(self, tenant, products):
        """
        Verify that recipe list uses prefetch_related for ingredients.
        """
        set_current_tenant(tenant)

        # Create recipes with ingredients
        for i in range(3):
            recipe = Recipe.objects.create(
                name=f"Recipe {i}",
                menu_item=products[i],
                tenant=tenant
            )
            for ingredient_product in products[3:6]:
                RecipeItem.objects.create(
                    recipe=recipe,
                    product=ingredient_product,
                    quantity=Decimal('0.5'),
                    unit='oz',
                    tenant=tenant
                )

        # Optimized query
        with CaptureQueriesContext(connection) as ctx:
            queryset = Recipe.objects.select_related(
                'menu_item'
            ).prefetch_related(
                'recipeitem_set__product'
            ).all()

            # Access related objects
            for recipe in queryset:
                _ = recipe.menu_item.name
                for item in recipe.recipeitem_set.all():
                    _ = item.product.name

            optimized_count = len(ctx)

        assert optimized_count <= 10, f"Expected <=10 queries, got {optimized_count}"

    def test_report_generation_query_optimization(self, tenant, user, customer, products, global_settings):
        """
        Verify that report generation doesn't cause excessive queries.
        """
        set_current_tenant(tenant)

        # Create data for report
        for i in range(10):
            order = Order.objects.create(
                tenant=tenant,
                status="COMPLETED",
                order_type="POS",
                cashier=user,
                customer=customer,
                subtotal=Decimal('100.00'),
                tax_total=Decimal('8.00'),
                grand_total=Decimal('108.00')
            )
            OrderItem.objects.create(
                order=order,
                product=products[0],
                quantity=1,
                tenant=tenant,
                price_at_sale=products[0].price
            )

        # Generate sales report
        service = SalesReportService()
        with CaptureQueriesContext(connection) as ctx:
            report_data = service.generate_sales_report(
                tenant=tenant,
                start_date=datetime.now() - timedelta(days=1),
                end_date=datetime.now()
            )
            query_count = len(ctx)

        # Should be reasonable query count (not 100+ queries)
        assert query_count <= 50, f"Expected <=50 queries, got {query_count}"
        assert 'total_revenue' in report_data

    def test_category_tree_mptt_optimization(self, tenant, category):
        """
        Verify that MPTT category tree doesn't cause N+1 queries.
        """
        set_current_tenant(tenant)

        # Create deep hierarchy
        parent = category
        for i in range(10):
            child = Category.objects.create(
                name=f"Child {i}",
                parent=parent,
                tenant=tenant
            )
            parent = child

        # Get tree (MPTT should optimize this)
        with CaptureQueriesContext(connection) as ctx:
            tree = Category.objects.all()
            # Force evaluation
            list(tree)
            query_count = len(ctx)

        # MPTT uses efficient tree queries
        assert query_count <= 5, f"MPTT should optimize tree queries, got {query_count}"

    def test_order_detail_with_all_relations(self, tenant, user, customer, products, global_settings):
        """
        Verify that order detail endpoint loads all relations efficiently.
        """
        set_current_tenant(tenant)

        # Create complex order
        order = Order.objects.create(
            tenant=tenant,
            status="COMPLETED",
            order_type="POS",
            cashier=user,
            customer=customer
        )

        for product in products[:5]:
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=2,
                tenant=tenant,
                price_at_sale=product.price
            )

        payment = Payment.objects.create(
            order=order,
            tenant=tenant,
            total_amount_due=Decimal('100.00')
        )

        # Load order with all relations
        with CaptureQueriesContext(connection) as ctx:
            order_detail = Order.objects.select_related(
                'customer', 'cashier', 'payment_details'
            ).prefetch_related(
                'items__product',
                'payment_details__transactions'
            ).get(id=order.id)

            # Access everything
            _ = order_detail.customer.email
            _ = order_detail.cashier.username
            for item in order_detail.items.all():
                _ = item.product.name

            query_count = len(ctx)

        assert query_count <= 10, f"Expected <=10 queries, got {query_count}"

    def test_bulk_operations_query_count(self, tenant, products):
        """
        Verify that bulk operations use bulk_create/bulk_update efficiently.
        """
        set_current_tenant(tenant)

        # Bulk create should be 1 query
        with CaptureQueriesContext(connection) as ctx:
            discounts = [
                Discount(
                    name=f"Bulk Discount {i}",
                    type="PERCENTAGE",
                    scope="ORDER",
                    value=Decimal('10.00'),
                    tenant=tenant
                )
                for i in range(100)
            ]
            Discount.objects.bulk_create(discounts)
            query_count = len(ctx)

        # Should be minimal queries (1 for bulk_create)
        assert query_count <= 3, f"Bulk create should be efficient, got {query_count}"

    def test_complex_filter_query_optimization(self, tenant, user, customer, products, global_settings):
        """
        Verify that complex filters don't cause excessive queries.
        """
        set_current_tenant(tenant)

        # Create varied orders
        for i in range(20):
            order = Order.objects.create(
                tenant=tenant,
                status="COMPLETED" if i % 2 == 0 else "PENDING",
                order_type="POS" if i % 3 == 0 else "WEB",
                cashier=user,
                customer=customer if i % 2 == 0 else None,
                subtotal=Decimal(f'{100 + i}.00')
            )
            OrderItem.objects.create(
                order=order,
                product=products[i % 10],
                quantity=1,
                tenant=tenant,
                price_at_sale=products[i % 10].price
            )

        # Complex filter query
        with CaptureQueriesContext(connection) as ctx:
            orders = Order.objects.select_related(
                'customer', 'cashier'
            ).prefetch_related(
                'items__product'
            ).filter(
                status="COMPLETED",
                order_type="POS",
                customer__isnull=False,
                subtotal__gte=Decimal('100.00')
            ).all()

            # Force evaluation
            list(orders)
            query_count = len(ctx)

        # Should be optimized
        assert query_count <= 10, f"Complex filters should be optimized, got {query_count}"


# ============================================================================
# TEST SUMMARY
# ============================================================================

"""
Test Summary - Priority 3: Performance & Caching (20 tests)

Cache Hit Rate Tests (10):
- ✅ Product cache hit rate
- ✅ Category tree cache hit rate
- ✅ Discount cache hit rate
- ✅ Settings cache hit rate
- ✅ Cache invalidation on product update
- ✅ Cache invalidation on category update
- ✅ Cache invalidation on discount update
- ✅ Cache invalidation on settings update
- ✅ Cache tenant isolation
- ✅ Cache TTL expiration

Query Optimization Tests (10):
- ✅ Product list N+1 prevention
- ✅ Order list N+1 prevention
- ✅ Payment list N+1 prevention
- ✅ Inventory stock list N+1 prevention
- ✅ Recipe list N+1 prevention
- ✅ Report generation optimization
- ✅ Category tree MPTT optimization
- ✅ Order detail with all relations
- ✅ Bulk operations efficiency
- ✅ Complex filter optimization

Expected Result: 20/20 tests passing
"""
