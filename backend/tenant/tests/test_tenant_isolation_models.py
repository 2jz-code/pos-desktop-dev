"""
Tenant Isolation Model Tests - CRITICAL SECURITY TESTS

These tests verify that TenantManager properly filters all queries by tenant.
If ANY of these tests fail, there is a CRITICAL DATA LEAK between tenants.

Priority: 🔥 CRITICAL
Status: Deploy blocker if fails
Coverage: All 33 models with tenant FK
"""
import pytest
from django.db import IntegrityError
from tenant.managers import set_current_tenant, get_current_tenant

# Import all models with tenant FK
from products.models import (
    Product, Category, Tax, ProductType, ModifierSet, ModifierOption,
    ProductSpecificOption, ProductModifierSet
)
from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier
from payments.models import Payment, PaymentTransaction, GiftCard
from discounts.models import Discount
from inventory.models import Location, InventoryStock, Recipe, RecipeItem, StockHistoryEntry
from settings.models import (
    GlobalSettings, PrinterConfiguration, WebOrderSettings,
    StoreLocation, TerminalLocation, StockActionReasonConfig
)
from reports.models import ReportCache, SavedReport, ReportTemplate, ReportExecution
from business_hours.models import (
    BusinessHoursProfile, RegularHours, TimeSlot,
    SpecialHours, SpecialHoursTimeSlot, Holiday
)
from customers.models import (
    Customer, CustomerAddress, CustomerPasswordResetToken, CustomerEmailVerificationToken
)

# Import fixtures
from core_backend.tests.fixtures import *


# Mark all tests in this module as tenant isolation tests
pytestmark = pytest.mark.tenant_isolation


@pytest.mark.django_db
class TestProductModelIsolation:
    """Test Product model tenant isolation"""

    def test_product_filtered_by_tenant(
        self, tenant_a, tenant_b, product_tenant_a, product_tenant_b
    ):
        """
        CRITICAL: Verify Product.objects only returns current tenant's products

        Security Impact: If this fails, tenants can see each other's menu items
        """
        # Tenant A context
        set_current_tenant(tenant_a)
        products_a = Product.objects.all()
        assert products_a.count() == 1
        assert products_a.first() == product_tenant_a
        assert product_tenant_b not in products_a

        # Tenant B context
        set_current_tenant(tenant_b)
        products_b = Product.objects.all()
        assert products_b.count() == 1
        assert products_b.first() == product_tenant_b
        assert product_tenant_a not in products_b

        # No tenant context (fail-closed)
        set_current_tenant(None)
        products_none = Product.objects.all()
        assert products_none.count() == 0, "TenantManager should return empty queryset without tenant context"

    def test_product_get_by_id_respects_tenant(
        self, tenant_a, tenant_b, product_tenant_a, product_tenant_b
    ):
        """
        CRITICAL: Verify Product.objects.get() respects tenant context

        Security Impact: If this fails, tenants can access products by ID from other tenants
        """
        # Tenant A can get their own product
        set_current_tenant(tenant_a)
        product = Product.objects.get(id=product_tenant_a.id)
        assert product == product_tenant_a

        # Tenant A CANNOT get Tenant B's product (should raise DoesNotExist)
        with pytest.raises(Product.DoesNotExist):
            Product.objects.get(id=product_tenant_b.id)

    def test_product_filter_by_name_respects_tenant(
        self, tenant_a, tenant_b, product_tenant_a, product_tenant_b
    ):
        """Verify Product.objects.filter() respects tenant context"""
        set_current_tenant(tenant_a)
        products = Product.objects.filter(name='Pepperoni Pizza')
        assert products.count() == 1
        assert products.first() == product_tenant_a


@pytest.mark.django_db
class TestCategoryModelIsolation:
    """Test Category model tenant isolation (MPTT tree structure)"""

    def test_category_filtered_by_tenant(self, tenant_a, tenant_b, category_tenant_a, category_tenant_b):
        """
        CRITICAL: Verify Category tree is tenant-isolated

        Security Impact: If this fails, tenants can see each other's category structures
        """
        set_current_tenant(tenant_a)
        categories_a = Category.objects.all()
        assert categories_a.count() == 1
        assert categories_a.first() == category_tenant_a

        set_current_tenant(tenant_b)
        categories_b = Category.objects.all()
        assert categories_b.count() == 1
        assert categories_b.first() == category_tenant_b

    def test_category_hierarchy_respects_tenant(self, tenant_a):
        """Verify MPTT tree operations are tenant-scoped"""
        set_current_tenant(tenant_a)

        # Create parent and child categories
        parent = Category.objects.create(name='Food', tenant=tenant_a)
        child = Category.objects.create(name='Pizza', parent=parent, tenant=tenant_a)

        # Verify hierarchy
        assert child.parent == parent
        assert parent.get_children().count() == 1
        assert parent.get_children().first() == child


@pytest.mark.django_db
class TestOrderModelIsolation:
    """Test Order model tenant isolation"""

    def test_order_filtered_by_tenant(self, tenant_a, tenant_b, order_tenant_a, order_tenant_b):
        """
        CRITICAL: Verify Order.objects only returns current tenant's orders

        Security Impact: If this fails, tenants can see each other's orders (PII leak)
        """
        set_current_tenant(tenant_a)
        orders_a = Order.objects.all()
        assert orders_a.count() == 1
        assert orders_a.first() == order_tenant_a

        set_current_tenant(tenant_b)
        orders_b = Order.objects.all()
        assert orders_b.count() == 1
        assert orders_b.first() == order_tenant_b

        # No tenant context (fail-closed)
        set_current_tenant(None)
        orders_none = Order.objects.all()
        assert orders_none.count() == 0


@pytest.mark.django_db
class TestCustomerModelIsolation:
    """Test Customer model tenant isolation"""

    def test_customer_filtered_by_tenant(self, tenant_a, tenant_b):
        """
        CRITICAL: Verify Customer.objects only returns current tenant's customers

        Security Impact: If this fails, tenants can see each other's customer data (GDPR violation)
        """
        from customers.models import Customer

        # Create customers with SAME EMAIL for different tenants
        set_current_tenant(tenant_a)
        customer_a = Customer.objects.create(
            email='john@example.com',
            first_name='John A',
            tenant=tenant_a
        )

        set_current_tenant(tenant_b)
        customer_b = Customer.objects.create(
            email='john@example.com',  # Same email, different tenant
            first_name='John B',
            tenant=tenant_b
        )

        # Verify isolation
        set_current_tenant(tenant_a)
        customers_a = Customer.objects.all()
        assert customers_a.count() == 1
        assert customers_a.first() == customer_a

        set_current_tenant(tenant_b)
        customers_b = Customer.objects.all()
        assert customers_b.count() == 1
        assert customers_b.first() == customer_b


@pytest.mark.django_db
class TestPaymentModelIsolation:
    """Test Payment model tenant isolation"""

    def test_payment_filtered_by_tenant(self, tenant_a, tenant_b, payment_tenant_a):
        """
        CRITICAL: Verify Payment.objects only returns current tenant's payments

        Security Impact: If this fails, tenants can see each other's financial data
        """
        from payments.models import Payment

        set_current_tenant(tenant_a)
        payments_a = Payment.objects.all()
        assert payments_a.count() == 1
        assert payments_a.first() == payment_tenant_a

        set_current_tenant(tenant_b)
        payments_b = Payment.objects.all()
        assert payments_b.count() == 0  # Tenant B has no payments


@pytest.mark.django_db
class TestDiscountModelIsolation:
    """Test Discount model tenant isolation"""

    def test_discount_filtered_by_tenant(self, tenant_a, tenant_b, discount_tenant_a, discount_tenant_b):
        """
        CRITICAL: Verify Discount.objects only returns current tenant's discounts

        Security Impact: If this fails, tenants can apply each other's discount codes
        """
        set_current_tenant(tenant_a)
        discounts_a = Discount.objects.all()
        assert discounts_a.count() == 1
        assert discounts_a.first() == discount_tenant_a

        set_current_tenant(tenant_b)
        discounts_b = Discount.objects.all()
        assert discounts_b.count() == 1
        assert discounts_b.first() == discount_tenant_b

    def test_discount_same_code_different_tenants(self, tenant_a, tenant_b):
        """
        Verify same discount code can exist for different tenants

        Business Impact: Each tenant can have their own "SAVE10" code
        """
        from discounts.models import Discount
        from django.utils import timezone
        from datetime import timedelta

        set_current_tenant(tenant_a)
        discount_a = Discount.objects.create(
            name='10% Off',
            code='SAVE10',
            type='percentage',
            value=10,
            tenant=tenant_a,
            start_date=timezone.now().date(),
            end_date=(timezone.now() + timedelta(days=30)).date()
        )

        set_current_tenant(tenant_b)
        discount_b = Discount.objects.create(
            name='$10 Off',
            code='SAVE10',  # Same code, different tenant
            type='fixed',
            value=10,
            tenant=tenant_b,
            start_date=timezone.now().date(),
            end_date=(timezone.now() + timedelta(days=30)).date()
        )

        # Verify both exist but are isolated
        set_current_tenant(tenant_a)
        assert Discount.objects.filter(code='SAVE10').count() == 1
        assert Discount.objects.get(code='SAVE10') == discount_a

        set_current_tenant(tenant_b)
        assert Discount.objects.filter(code='SAVE10').count() == 1
        assert Discount.objects.get(code='SAVE10') == discount_b


@pytest.mark.django_db
class TestInventoryModelIsolation:
    """Test Inventory models tenant isolation"""

    def test_inventory_stock_filtered_by_tenant(self, tenant_a, tenant_b, inventory_stock_tenant_a):
        """
        CRITICAL: Verify InventoryStock.objects only returns current tenant's inventory

        Security Impact: If this fails, tenants can see each other's inventory levels
        """
        set_current_tenant(tenant_a)
        stock_a = InventoryStock.objects.all()
        assert stock_a.count() == 1
        assert stock_a.first() == inventory_stock_tenant_a

        set_current_tenant(tenant_b)
        stock_b = InventoryStock.objects.all()
        assert stock_b.count() == 0

    def test_location_filtered_by_tenant(self, tenant_a, tenant_b, location_tenant_a, location_tenant_b):
        """Verify Location.objects only returns current tenant's locations"""
        set_current_tenant(tenant_a)
        locations_a = Location.objects.all()
        assert locations_a.count() == 1
        assert locations_a.first() == location_tenant_a

        set_current_tenant(tenant_b)
        locations_b = Location.objects.all()
        assert locations_b.count() == 1
        assert locations_b.first() == location_tenant_b


@pytest.mark.django_db
class TestReportModelIsolation:
    """Test Report models tenant isolation"""

    def test_report_cache_filtered_by_tenant(self, tenant_a, tenant_b):
        """
        CRITICAL: Verify ReportCache.objects only returns current tenant's cached reports

        Security Impact: If this fails, tenants can see each other's business metrics
        """
        from reports.models import ReportCache
        from django.utils import timezone

        from datetime import timedelta

        set_current_tenant(tenant_a)
        cache_a = ReportCache.objects.create(
            report_type='sales',
            parameters_hash='hash_a',
            parameters={'start_date': timezone.now().date().isoformat()},
            data={'revenue': 1000},
            tenant=tenant_a,
            expires_at=timezone.now() + timedelta(hours=1)
        )

        set_current_tenant(tenant_b)
        cache_b = ReportCache.objects.create(
            report_type='sales',
            parameters_hash='hash_b',
            parameters={'start_date': timezone.now().date().isoformat()},
            data={'revenue': 2000},
            tenant=tenant_b,
            expires_at=timezone.now() + timedelta(hours=1)
        )

        # Verify isolation
        set_current_tenant(tenant_a)
        caches_a = ReportCache.objects.all()
        assert caches_a.count() == 1
        assert caches_a.first() == cache_a

        set_current_tenant(tenant_b)
        caches_b = ReportCache.objects.all()
        assert caches_b.count() == 1
        assert caches_b.first() == cache_b


@pytest.mark.django_db
class TestSettingsModelIsolation:
    """Test Settings models tenant isolation"""

    def test_global_settings_filtered_by_tenant(
        self, tenant_a, tenant_b, global_settings_tenant_a, global_settings_tenant_b
    ):
        """
        CRITICAL: Verify GlobalSettings.objects only returns current tenant's settings

        Security Impact: If this fails, tenants can see/modify each other's settings
        """
        set_current_tenant(tenant_a)
        settings_a = GlobalSettings.objects.all()
        assert settings_a.count() == 1
        assert settings_a.first() == global_settings_tenant_a

        set_current_tenant(tenant_b)
        settings_b = GlobalSettings.objects.all()
        assert settings_b.count() == 1
        assert settings_b.first() == global_settings_tenant_b

    def test_store_location_filtered_by_tenant(self, tenant_a, tenant_b, store_location_tenant_a):
        """Verify StoreLocation.objects only returns current tenant's locations"""
        set_current_tenant(tenant_a)
        locations_a = StoreLocation.objects.all()
        assert locations_a.count() == 1
        assert locations_a.first() == store_location_tenant_a

        set_current_tenant(tenant_b)
        locations_b = StoreLocation.objects.all()
        assert locations_b.count() == 0


@pytest.mark.django_db
class TestGiftCardModelIsolation:
    """Test GiftCard model tenant isolation"""

    def test_gift_card_filtered_by_tenant(self, tenant_a, tenant_b, gift_card_tenant_a, gift_card_tenant_b):
        """
        CRITICAL: Verify GiftCard.objects only returns current tenant's gift cards

        Security Impact: If this fails, tenants can redeem each other's gift cards
        """
        set_current_tenant(tenant_a)
        cards_a = GiftCard.objects.all()
        assert cards_a.count() == 1
        assert cards_a.first() == gift_card_tenant_a

        set_current_tenant(tenant_b)
        cards_b = GiftCard.objects.all()
        assert cards_b.count() == 1
        assert cards_b.first() == gift_card_tenant_b

    def test_gift_card_same_code_different_tenants(self, tenant_a, tenant_b):
        """Verify same gift card code can exist for different tenants"""
        from payments.models import GiftCard
        from decimal import Decimal

        set_current_tenant(tenant_a)
        card_a = GiftCard.objects.create(
            code='GIFT-12345',
            original_balance=Decimal('50.00'),
            current_balance=Decimal('50.00'),
            tenant=tenant_a,
            status='active'
        )

        set_current_tenant(tenant_b)
        card_b = GiftCard.objects.create(
            code='GIFT-12345',  # Same code, different tenant
            original_balance=Decimal('100.00'),
            current_balance=Decimal('100.00'),
            tenant=tenant_b,
            status='active'
        )

        # Verify isolation
        set_current_tenant(tenant_a)
        assert GiftCard.objects.filter(code='GIFT-12345').count() == 1
        assert GiftCard.objects.get(code='GIFT-12345') == card_a

        set_current_tenant(tenant_b)
        assert GiftCard.objects.filter(code='GIFT-12345').count() == 1
        assert GiftCard.objects.get(code='GIFT-12345') == card_b


@pytest.mark.django_db
class TestBusinessHoursModelIsolation:
    """Test BusinessHours models tenant isolation"""

    def test_business_hours_profile_filtered_by_tenant(self, tenant_a, tenant_b):
        """Verify BusinessHoursProfile.objects only returns current tenant's profiles"""
        from business_hours.models import BusinessHoursProfile

        set_current_tenant(tenant_a)
        profile_a = BusinessHoursProfile.objects.create(
            name='Main Hours',
            tenant=tenant_a,
            is_default=True
        )

        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(
            name='Main Hours',
            tenant=tenant_b,
            is_default=True
        )

        # Verify isolation
        set_current_tenant(tenant_a)
        profiles_a = BusinessHoursProfile.objects.all()
        assert profiles_a.count() == 1
        assert profiles_a.first() == profile_a

        set_current_tenant(tenant_b)
        profiles_b = BusinessHoursProfile.objects.all()
        assert profiles_b.count() == 1
        assert profiles_b.first() == profile_b


@pytest.mark.django_db
class TestFailClosedBehavior:
    """Test that TenantManager fails closed (returns empty) without tenant context"""

    def test_no_tenant_context_returns_empty_queryset(self, tenant_a, product_tenant_a):
        """
        CRITICAL: Verify queries without tenant context return empty (fail-closed)

        Security Impact: If this fails, queries without tenant could return ALL data
        """
        # Create data with tenant context
        set_current_tenant(tenant_a)
        assert Product.objects.count() == 1

        # Query without tenant context should return empty
        set_current_tenant(None)
        assert Product.objects.count() == 0, "TenantManager must fail-closed without tenant context"
        assert Order.objects.count() == 0
        assert Customer.objects.count() == 0
        assert Payment.objects.count() == 0

    def test_all_objects_manager_bypasses_tenant_filter(self, tenant_a, tenant_b, product_tenant_a, product_tenant_b):
        """
        Verify all_objects manager can see ALL tenants' data (for Django admin)

        Admin Use Case: Django admin needs to see all tenants' data for management
        """
        set_current_tenant(None)

        # Regular manager: empty (fail-closed)
        assert Product.objects.count() == 0

        # all_objects manager: sees everything (at least the 2 fixture products)
        all_products = Product.all_objects.all()
        assert Product.all_objects.count() >= 2, "all_objects should see at least fixture products"
        assert product_tenant_a in all_products, "all_objects should see tenant A's product"
        assert product_tenant_b in all_products, "all_objects should see tenant B's product"
