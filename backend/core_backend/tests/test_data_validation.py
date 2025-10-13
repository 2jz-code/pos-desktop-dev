"""
Data Validation Tests

This module tests how the system validates user input and prevents bad data
from entering the database. These tests are critical for data integrity and security.

Priority: 4 (Medium for Production Readiness)

Test Categories:
1. Product Price/Quantity Validation
2. Customer Email/Phone Validation
3. Discount Value Validation
4. Date Range Validation
5. SQL Injection Protection
"""
import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from datetime import date, timedelta

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, ProductType
from customers.models import Customer
from discounts.models import Discount
from inventory.models import InventoryStock, Location

User = get_user_model()


# ============================================================================
# PRODUCT PRICE/QUANTITY VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestProductPriceQuantityValidation:
    """Test validation of product prices and quantities."""

    def test_negative_price_rejected(self):
        """
        CRITICAL: Verify negative prices are rejected.

        Scenario:
        - Try to create product with negative price
        - Expected: ValidationError

        Value: Prevents pricing errors
        """
        # Create tenant and product type
        tenant = Tenant.objects.create(
            slug="price-validation-test",
            name="Price Validation Test",
            is_active=True
        )

        set_current_tenant(tenant)

        product_type = ProductType.objects.create(
            name="Simple",
            tenant=tenant
        )

        # Try to create product with negative price
        product = Product(
            name="Invalid Product",
            price=Decimal("-10.00"),  # Negative price!
            tenant=tenant,
            product_type=product_type
        )

        # Should raise validation error
        with pytest.raises(ValidationError):
            product.full_clean()

    def test_zero_price_allowed_for_free_items(self):
        """
        IMPORTANT: Verify $0.00 prices are allowed (free items).

        Scenario:
        - Create product with $0.00 price
        - Expected: Success

        Value: Allows promotional free items
        """
        # Create tenant and product type
        tenant = Tenant.objects.create(
            slug="zero-price-test",
            name="Zero Price Test",
            is_active=True
        )

        set_current_tenant(tenant)

        product_type = ProductType.objects.create(
            name="Simple",
            tenant=tenant
        )

        # Create product with zero price - should succeed
        product = Product.objects.create(
            name="Free Sample",
            price=Decimal("0.00"),  # Free!
            tenant=tenant,
            product_type=product_type
        )

        assert product.price == Decimal("0.00")

    def test_extremely_large_price_rejected(self):
        """
        IMPORTANT: Verify unreasonably large prices are rejected.

        Scenario:
        - Try to create product with price > $1 million
        - Expected: ValidationError

        Value: Prevents data entry errors
        """
        # Create tenant and product type
        tenant = Tenant.objects.create(
            slug="large-price-test",
            name="Large Price Test",
            is_active=True
        )

        set_current_tenant(tenant)

        product_type = ProductType.objects.create(
            name="Simple",
            tenant=tenant
        )

        # Try to create product with extremely large price
        product = Product(
            name="Overpriced Item",
            price=Decimal("9999999.99"),  # Nearly $10 million!
            tenant=tenant,
            product_type=product_type
        )

        # Should raise validation error
        with pytest.raises(ValidationError):
            product.full_clean()


# ============================================================================
# CUSTOMER EMAIL/PHONE VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestCustomerEmailPhoneValidation:
    """Test validation of customer email and phone numbers."""

    def test_invalid_email_format_rejected(self):
        """
        CRITICAL: Verify malformed emails are rejected.

        Scenario:
        - Try to create customer with invalid email
        - Expected: ValidationError

        Value: Ensures data quality for communications
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="email-validation-test",
            name="Email Validation Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Try to create customer with invalid email
        customer = Customer(
            tenant=tenant,
            first_name="Test",
            last_name="Customer",
            email="not-an-email",  # Invalid format!
            phone_number="555-1234",
            password="password123"
        )

        # Should raise validation error
        with pytest.raises(ValidationError):
            customer.full_clean()

    def test_duplicate_email_allowed_across_tenants(self):
        """
        IMPORTANT: Verify same email can exist in different tenants.

        Scenario:
        - Create customer with email in tenant A
        - Create customer with same email in tenant B
        - Expected: Success (emails are scoped per tenant)

        Value: Ensures proper tenant isolation for customer data
        """
        # Create tenant A
        tenant_a = Tenant.objects.create(
            slug="tenant-a-customer",
            name="Tenant A",
            is_active=True
        )

        # Create customer in tenant A
        customer_a = Customer.objects.create(
            tenant=tenant_a,
            first_name="John",
            last_name="Doe A",
            email="john@example.com",
            phone_number="555-1234",
            password="password123"
        )

        # Create tenant B
        tenant_b = Tenant.objects.create(
            slug="tenant-b-customer",
            name="Tenant B",
            is_active=True
        )

        # Create customer with SAME email in tenant B - should succeed
        customer_b = Customer.objects.create(
            tenant=tenant_b,
            first_name="John",
            last_name="Doe B",
            email="john@example.com",  # Same email!
            phone_number="555-5678",
            password="password123"
        )

        assert customer_a.email == customer_b.email
        assert customer_a.tenant != customer_b.tenant

    def test_valid_phone_formats_accepted(self):
        """
        IMPORTANT: Verify various valid phone formats are accepted.

        Scenario:
        - Create customers with different valid phone formats
        - Expected: All succeed

        Value: Ensures flexibility in phone number entry
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="phone-validation-test",
            name="Phone Validation Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Various valid phone formats
        valid_phones = [
            "555-1234",
            "(555) 123-4567",
            "555.123.4567",
            "+1-555-123-4567",
            "5551234567",
        ]

        for i, phone in enumerate(valid_phones):
            customer = Customer.objects.create(
                tenant=tenant,
                first_name=f"Customer",
                last_name=f"{i}",
                email=f"customer{i}@example.com",
                phone_number=phone,
                password="password123"
            )
            assert customer.phone_number == phone


# ============================================================================
# DISCOUNT VALUE VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestDiscountValueValidation:
    """Test validation of discount percentages and amounts."""

    def test_percentage_over_100_rejected(self):
        """
        CRITICAL: Verify discounts over 100% are rejected.

        Scenario:
        - Try to create percentage discount > 100%
        - Expected: ValidationError

        Value: Prevents giving away money
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="discount-validation-test",
            name="Discount Validation Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Try to create discount > 100%
        discount = Discount(
            tenant=tenant,
            name="Over 100%",
            code="OVER100",
            type="PERCENTAGE",
            value=Decimal("150.00"),  # 150% off!
            is_active=True
        )

        # Should raise validation error
        with pytest.raises(ValidationError):
            discount.full_clean()

    def test_negative_discount_rejected(self):
        """
        CRITICAL: Verify negative discounts are rejected.

        Scenario:
        - Try to create discount with negative value
        - Expected: ValidationError

        Value: Prevents charging extra instead of discounting
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="negative-discount-test",
            name="Negative Discount Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Try to create negative discount
        discount = Discount(
            tenant=tenant,
            name="Negative Discount",
            code="NEGATIVE",
            type="FIXED_AMOUNT",
            value=Decimal("-10.00"),  # Negative value!
            is_active=True
        )

        # Should raise validation error
        with pytest.raises(ValidationError):
            discount.full_clean()

    def test_zero_discount_rejected(self):
        """
        IMPORTANT: Verify zero-value discounts are rejected.

        Scenario:
        - Try to create discount with $0 or 0% value
        - Expected: ValidationError

        Value: Prevents useless discount codes
        """
        # Create tenant
        tenant = Tenant.objects.create(
            slug="zero-discount-test",
            name="Zero Discount Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Try to create zero discount
        discount = Discount(
            tenant=tenant,
            name="Zero Discount",
            code="ZERO",
            type="FIXED_AMOUNT",
            value=Decimal("0.00"),  # Zero value!
            is_active=True
        )

        # Should raise validation error
        with pytest.raises(ValidationError):
            discount.full_clean()


# ============================================================================
# INVENTORY QUANTITY VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestInventoryQuantityValidation:
    """Test validation of inventory stock quantities."""

    def test_negative_stock_quantity_rejected(self):
        """
        CRITICAL: Verify negative stock quantities are rejected.

        Scenario:
        - Try to create inventory with negative quantity
        - Expected: ValidationError or prevention at service level

        Value: Prevents inventory data corruption
        """
        from inventory.services import InventoryService

        # Create tenant
        tenant = Tenant.objects.create(
            slug="inventory-validation-test",
            name="Inventory Validation Test",
            is_active=True
        )

        set_current_tenant(tenant)

        # Create location and product
        location = Location.objects.create(
            tenant=tenant,
            name="Main Warehouse"
        )

        product_type = ProductType.objects.create(
            name="Simple",
            tenant=tenant
        )

        product = Product.objects.create(
            name="Test Product",
            price=Decimal("10.00"),
            tenant=tenant,
            product_type=product_type
        )

        # Try to add negative stock - should fail
        with pytest.raises(ValueError):
            InventoryService.add_stock(
                product=product,
                location=location,
                quantity=-10  # Negative!
            )


# ============================================================================
# DATE RANGE VALIDATION TESTS
# ============================================================================

@pytest.mark.django_db
class TestDateRangeValidation:
    """Test validation of date ranges in business hours and reports."""

    def test_closing_time_before_opening_time_allowed_for_overnight(self):
        """
        IMPORTANT: Verify overnight hours are allowed (closing < opening).

        Scenario:
        - Create business hours with closing time before opening (11pm - 2am)
        - Expected: Success (overnight operation)

        Value: Supports 24-hour businesses
        """
        from business_hours.models import BusinessHoursProfile, RegularHours, TimeSlot
        from datetime import time

        # Create tenant and profile
        tenant = Tenant.objects.create(
            slug="overnight-hours-test",
            name="Overnight Hours Test",
            is_active=True
        )

        set_current_tenant(tenant)

        profile = BusinessHoursProfile.objects.create(
            tenant=tenant,
            name="24/7 Store",
            is_active=True
        )

        # Create overnight hours (11pm - 2am)
        regular_hours = RegularHours.objects.create(
            tenant=tenant,
            profile=profile,
            day_of_week=0,  # Monday
            is_closed=False
        )

        # Create overnight time slot - should succeed
        time_slot = TimeSlot.objects.create(
            tenant=tenant,
            regular_hours=regular_hours,
            opening_time=time(23, 0),  # 11 PM
            closing_time=time(2, 0),   # 2 AM (next day)
            slot_type='regular'
        )

        assert time_slot.closing_time < time_slot.opening_time


# ============================================================================
# SQL INJECTION PROTECTION TESTS
# ============================================================================

@pytest.mark.django_db
class TestSQLInjectionProtection:
    """Test protection against SQL injection in search/filter fields."""

    def test_sql_injection_in_product_search(self):
        """
        CRITICAL: Verify SQL injection attempts are safely handled.

        Scenario:
        - Search for product with SQL injection payload
        - Expected: No error, no data leakage, safely escaped

        Value: Prevents database attacks
        """
        # Create tenant and user
        tenant = Tenant.objects.create(
            slug="sql-injection-test",
            name="SQL Injection Test",
            is_active=True
        )

        user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        set_current_tenant(tenant)

        # Create test product
        product_type = ProductType.objects.create(
            name="Simple",
            tenant=tenant
        )

        Product.objects.create(
            name="Normal Product",
            price=Decimal("10.00"),
            tenant=tenant,
            product_type=product_type
        )

        client = APIClient()
        from rest_framework_simplejwt.tokens import RefreshToken
        from django.conf import settings

        refresh = RefreshToken.for_user(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug

        client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

        # SQL injection payloads
        injection_payloads = [
            "'; DROP TABLE products--",
            "' OR '1'='1",
            "1' UNION SELECT * FROM users--",
            "<script>alert('xss')</script>",
            "../../etc/passwd",
        ]

        for payload in injection_payloads:
            # Try to inject via search parameter
            response = client.get('/api/products/', {'search': payload})

            # Should return 200 (safely handled) or 400 (validation rejected)
            # Should NOT return 500 (SQL error)
            assert response.status_code in [200, 400], \
                f"SQL injection not properly handled for payload: {payload}"

            # If 200, should return empty or safe results (not crash)
            if response.status_code == 200:
                data = response.json()
                # Should have results structure, even if empty
                assert 'results' in data or 'count' in data

    def test_sql_injection_in_customer_search(self):
        """
        CRITICAL: Verify SQL injection attempts in customer search.

        Scenario:
        - Search for customer with SQL injection payload
        - Expected: Safely handled, no SQL errors

        Value: Prevents customer data exposure
        """
        # Create tenant and user
        tenant = Tenant.objects.create(
            slug="customer-sql-test",
            name="Customer SQL Test",
            is_active=True
        )

        user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        set_current_tenant(tenant)

        # Create test customer
        Customer.objects.create(
            tenant=tenant,
            first_name="Test",
            last_name="Customer",
            email="customer@test.com",
            phone_number="555-1234",
            password="password123"
        )

        client = APIClient()
        from rest_framework_simplejwt.tokens import RefreshToken
        from django.conf import settings

        refresh = RefreshToken.for_user(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug

        client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

        # Try SQL injection in customer search
        response = client.get('/api/customers/', {'search': "'; DROP TABLE customers--"})

        # Should NOT return 500 (SQL error)
        assert response.status_code in [200, 400]
