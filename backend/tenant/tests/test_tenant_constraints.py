"""
Tenant Database Constraint Tests - CRITICAL SECURITY TESTS

These tests verify that database-level unique constraints are properly scoped to tenants.
Database constraints are the last line of defense against data conflicts.

Priority: 🔥 CRITICAL
Status: Deploy blocker if fails
Coverage: All tenant-scoped unique constraints
"""
import pytest
from django.db import IntegrityError
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from tenant.managers import set_current_tenant

# Import fixtures
from core_backend.tests.fixtures import *


# Mark all tests in this module as tenant isolation tests
pytestmark = pytest.mark.tenant_isolation


@pytest.mark.django_db
class TestUserEmailConstraints:
    """Test User email uniqueness per tenant"""

    def test_user_email_unique_per_tenant(self, tenant_a, tenant_b):
        """
        CRITICAL: Verify same email can exist in different tenants

        Business Impact: Each tenant can have their own "admin@restaurant.com"
        Security Impact: Email uniqueness must be scoped to prevent conflicts
        """
        from users.models import User

        # Tenant A creates user with email
        set_current_tenant(tenant_a)
        user_a = User.objects.create_user(
            email='john@example.com',
            username='john_a',
            password='password123',
            tenant=tenant_a,
            role='owner'
        )

        # Tenant B creates user with SAME email (should succeed)
        set_current_tenant(tenant_b)
        user_b = User.objects.create_user(
            email='john@example.com',  # Same email
            username='john_b',
            password='password123',
            tenant=tenant_b,
            role='owner'
        )

        # Verify both users exist
        assert user_a.email == user_b.email
        assert user_a.tenant != user_b.tenant

    def test_user_email_duplicate_same_tenant_blocked(self, tenant_a):
        """Verify duplicate email within SAME tenant is blocked"""
        from users.models import User

        set_current_tenant(tenant_a)

        # Create first user
        User.objects.create_user(
            email='duplicate@example.com',
            username='user1',
            password='password123',
            tenant=tenant_a
        )

        # Attempt to create second user with same email in same tenant
        with pytest.raises(IntegrityError):
            User.objects.create_user(
                email='duplicate@example.com',  # Duplicate in same tenant
                username='user2',
                password='password123',
                tenant=tenant_a
            )

    def test_user_username_unique_per_tenant(self, tenant_a, tenant_b):
        """Verify same username can exist in different tenants"""
        from users.models import User

        set_current_tenant(tenant_a)
        user_a = User.objects.create_user(
            email='usera@example.com',
            username='admin',  # Same username
            password='password123',
            tenant=tenant_a
        )

        set_current_tenant(tenant_b)
        user_b = User.objects.create_user(
            email='userb@example.com',
            username='admin',  # Same username, different tenant
            password='password123',
            tenant=tenant_b
        )

        assert user_a.username == user_b.username
        assert user_a.tenant != user_b.tenant


@pytest.mark.django_db
class TestDiscountCodeConstraints:
    """Test Discount code uniqueness per tenant"""

    def test_discount_code_unique_per_tenant(self, tenant_a, tenant_b):
        """
        CRITICAL: Verify same discount code can exist in different tenants

        Business Impact: Each tenant can have their own "SAVE10" code
        Revenue Impact: Prevents code conflicts between tenants
        """
        from discounts.models import Discount

        # Tenant A creates discount
        set_current_tenant(tenant_a)
        discount_a = Discount.objects.create(
            name='10% Off',
            code='SAVE10',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('10.00'),
            tenant=tenant_a,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Tenant B creates discount with SAME code (should succeed)
        set_current_tenant(tenant_b)
        discount_b = Discount.objects.create(
            name='$10 Off',
            code='SAVE10',  # Same code
            type='FIXED_AMOUNT',
            scope='ORDER',
            value=Decimal('10.00'),
            tenant=tenant_b,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Verify both exist but are different
        assert discount_a.code == discount_b.code
        assert discount_a.tenant != discount_b.tenant
        assert discount_a.type != discount_b.type

    def test_discount_code_duplicate_same_tenant_blocked(self, tenant_a):
        """Verify duplicate discount code within SAME tenant is blocked"""
        from discounts.models import Discount

        set_current_tenant(tenant_a)

        # Create first discount
        Discount.objects.create(
            name='First Discount',
            code='DUPLICATE',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('10.00'),
            tenant=tenant_a,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        # Attempt to create second discount with same code
        with pytest.raises(IntegrityError):
            Discount.objects.create(
                name='Second Discount',
                code='DUPLICATE',  # Same code in same tenant
                type='FIXED_AMOUNT',
                scope='ORDER',
                value=Decimal('5.00'),
                tenant=tenant_a,
                start_date=timezone.now(),
                end_date=timezone.now() + timedelta(days=30)
            )

    def test_discount_name_unique_per_tenant(self, tenant_a, tenant_b):
        """Verify same discount name can exist in different tenants"""
        from discounts.models import Discount

        set_current_tenant(tenant_a)
        discount_a = Discount.objects.create(
            name='Holiday Sale',
            code='HOLIDAY_A',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('20.00'),
            tenant=tenant_a,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        set_current_tenant(tenant_b)
        discount_b = Discount.objects.create(
            name='Holiday Sale',  # Same name
            code='HOLIDAY_B',
            type='PERCENTAGE',
            scope='ORDER',
            value=Decimal('15.00'),
            tenant=tenant_b,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30)
        )

        assert discount_a.name == discount_b.name
        assert discount_a.tenant != discount_b.tenant


@pytest.mark.django_db
class TestGiftCardCodeConstraints:
    """Test GiftCard code uniqueness per tenant"""

    def test_gift_card_code_unique_per_tenant(self, tenant_a, tenant_b):
        """
        CRITICAL: Verify same gift card code can exist in different tenants

        Business Impact: Each tenant can issue their own gift cards independently
        Security Impact: Prevents gift card fraud across tenants
        """
        from payments.models import GiftCard

        # Tenant A creates gift card
        set_current_tenant(tenant_a)
        card_a = GiftCard.objects.create(
            code='GIFT-12345',
            original_balance=Decimal('50.00'),
            current_balance=Decimal('50.00'),
            tenant=tenant_a,
            status='active'
        )

        # Tenant B creates gift card with SAME code (should succeed)
        set_current_tenant(tenant_b)
        card_b = GiftCard.objects.create(
            code='GIFT-12345',  # Same code
            original_balance=Decimal('100.00'),
            current_balance=Decimal('100.00'),
            tenant=tenant_b,
            status='active'
        )

        # Verify both exist but are different
        assert card_a.code == card_b.code
        assert card_a.tenant != card_b.tenant
        assert card_a.original_balance != card_b.original_balance

    def test_gift_card_code_duplicate_same_tenant_blocked(self, tenant_a):
        """Verify duplicate gift card code within SAME tenant is blocked"""
        from payments.models import GiftCard

        set_current_tenant(tenant_a)

        # Create first gift card
        GiftCard.objects.create(
            code='CARD-999',
            original_balance=Decimal('25.00'),
            current_balance=Decimal('25.00'),
            tenant=tenant_a,
            status='active'
        )

        # Attempt to create second gift card with same code
        with pytest.raises(IntegrityError):
            GiftCard.objects.create(
                code='CARD-999',  # Same code in same tenant
                original_balance=Decimal('50.00'),
                current_balance=Decimal('50.00'),
                tenant=tenant_a,
                status='active'
            )


@pytest.mark.django_db
class TestProductSKUConstraints:
    """Test Product SKU uniqueness per tenant"""

    def test_product_sku_unique_per_tenant(self, tenant_a, tenant_b, category_tenant_a, category_tenant_b, tax_rate_tenant_a, tax_rate_tenant_b):
        """
        CRITICAL: Verify same SKU can exist in different tenants

        Business Impact: Each tenant can use their own SKU system
        Inventory Impact: Prevents SKU conflicts between tenants
        """
        from products.models import Product

        from products.models import ProductType

        # Create product types for both tenants
        set_current_tenant(tenant_a)
        product_type_a = ProductType.objects.create(name='Food', tenant=tenant_a)

        set_current_tenant(tenant_b)
        product_type_b = ProductType.objects.create(name='Food', tenant=tenant_b)

        # Tenant A creates product
        set_current_tenant(tenant_a)
        product_a = Product.objects.create(
            name='Product A',
            barcode='ITEM-001',
            price=Decimal('10.00'),
            tenant=tenant_a,
            category=category_tenant_a,
            product_type=product_type_a
        )

        # Tenant B creates product with SAME barcode (should succeed)
        set_current_tenant(tenant_b)
        product_b = Product.objects.create(
            name='Product B',
            barcode='ITEM-001',  # Same barcode
            price=Decimal('15.00'),
            tenant=tenant_b,
            category=category_tenant_b,
            product_type=product_type_b
        )

        # Verify both exist but are different
        assert product_a.barcode == product_b.barcode
        assert product_a.tenant != product_b.tenant
        assert product_a.name != product_b.name

    def test_product_sku_duplicate_same_tenant_blocked(self, tenant_a, category_tenant_a, tax_rate_tenant_a):
        """Verify duplicate barcode within SAME tenant is blocked"""
        from products.models import Product, ProductType

        set_current_tenant(tenant_a)
        product_type = ProductType.objects.create(name='Food', tenant=tenant_a)

        # Create first product
        Product.objects.create(
            name='First Product',
            barcode='SKU-123',
            price=Decimal('20.00'),
            tenant=tenant_a,
            category=category_tenant_a,
            product_type=product_type
        )

        # Attempt to create second product with same barcode
        with pytest.raises(IntegrityError):
            Product.objects.create(
                name='Second Product',
                barcode='SKU-123',  # Same barcode in same tenant
                price=Decimal('25.00'),
                tenant=tenant_a,
                category=category_tenant_a,
                product_type=product_type
            )


@pytest.mark.django_db
class TestCustomerEmailConstraints:
    """Test Customer email uniqueness per tenant"""

    def test_customer_email_unique_per_tenant(self, tenant_a, tenant_b):
        """
        CRITICAL: Verify same customer email can exist in different tenants

        Business Impact: Customer at Pizza Place and Burger Joint can both be john@example.com
        GDPR Impact: Customer data must be isolated per tenant
        """
        from customers.models import Customer

        # Tenant A creates customer
        set_current_tenant(tenant_a)
        customer_a = Customer.objects.create(
            email='john@example.com',
            first_name='John',
            last_name='Doe',
            tenant=tenant_a
        )

        # Tenant B creates customer with SAME email (should succeed)
        set_current_tenant(tenant_b)
        customer_b = Customer.objects.create(
            email='john@example.com',  # Same email
            first_name='Jane',
            last_name='Smith',
            tenant=tenant_b
        )

        # Verify both exist but are different
        assert customer_a.email == customer_b.email
        assert customer_a.tenant != customer_b.tenant
        assert customer_a.first_name != customer_b.first_name

    def test_customer_email_duplicate_same_tenant_blocked(self, tenant_a):
        """Verify duplicate customer email within SAME tenant is blocked"""
        from customers.models import Customer

        set_current_tenant(tenant_a)

        # Create first customer
        Customer.objects.create(
            email='customer@example.com',
            first_name='First',
            tenant=tenant_a
        )

        # Attempt to create second customer with same email
        with pytest.raises(IntegrityError):
            Customer.objects.create(
                email='customer@example.com',  # Same email in same tenant
                first_name='Second',
                tenant=tenant_a
            )


@pytest.mark.django_db
class TestTenantForeignKeyRequired:
    """Test that tenant FK is required (NOT NULL) on all models"""

    def test_product_requires_tenant(self, category_tenant_a, product_type_tenant_a):
        """Verify Product cannot be created without tenant"""
        from products.models import Product

        with pytest.raises(IntegrityError):
            Product.objects.create(
                name='Invalid Product',
                price=Decimal('10.00'),
                category=category_tenant_a,
                product_type=product_type_tenant_a,
                tenant=None  # Should fail - tenant required
            )

    def test_order_requires_tenant(self):
        """Verify Order cannot be created without tenant"""
        from orders.models import Order

        with pytest.raises(IntegrityError):
            Order.objects.create(
                order_type='dine_in',
                status='pending',
                subtotal=Decimal('10.00'),
                grand_total=Decimal('10.00'),
                tenant=None  # Should fail - tenant required
            )

    def test_customer_requires_tenant(self):
        """Verify Customer cannot be created without tenant"""
        from customers.models import Customer

        with pytest.raises(IntegrityError):
            Customer.objects.create(
                email='test@example.com',
                first_name='Test',
                tenant=None  # Should fail - tenant required
            )

    def test_discount_requires_tenant(self):
        """Verify Discount cannot be created without tenant"""
        from discounts.models import Discount

        with pytest.raises(IntegrityError):
            Discount.objects.create(
                name='Invalid Discount',
                code='INVALID',
                type='PERCENTAGE',
                scope='ORDER',
                value=Decimal('10.00'),
                start_date=timezone.now(),
                end_date=timezone.now() + timedelta(days=30),
                tenant=None  # Should fail - tenant required
            )
