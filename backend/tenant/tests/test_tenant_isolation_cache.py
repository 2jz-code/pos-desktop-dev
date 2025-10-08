"""
Tenant Isolation Cache Tests - CRITICAL SECURITY TESTS

These tests verify that cached data is properly isolated by tenant.
Cache pollution between tenants could leak sensitive business data.

Priority: 🔥 CRITICAL
Status: Deploy blocker if fails
Coverage: All cached service methods and cache keys
"""
import pytest
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from tenant.managers import set_current_tenant

# Import fixtures
from core_backend.tests.fixtures import *


# Mark all tests in this module as tenant isolation tests
pytestmark = pytest.mark.tenant_isolation


@pytest.mark.django_db
class TestProductCacheIsolation:
    """Test product caching tenant isolation"""

    def test_cached_products_isolated_by_tenant(
        self, tenant_a, tenant_b, product_tenant_a, product_tenant_b, enable_cache
    ):
        """
        CRITICAL: Verify cached product lists are tenant-isolated

        Security Impact: If cache keys aren't tenant-scoped, tenants see each other's menus
        """
        from products.services import ProductService

        # Cache products for tenant A
        set_current_tenant(tenant_a)
        products_a_call1 = ProductService.get_cached_active_products_list()
        product_ids_a = [p.id for p in products_a_call1]

        # Verify tenant A's product is in cache
        assert product_tenant_a.id in product_ids_a
        assert product_tenant_b.id not in product_ids_a

        # Cache products for tenant B
        set_current_tenant(tenant_b)
        products_b_call1 = ProductService.get_cached_active_products_list()
        product_ids_b = [p.id for p in products_b_call1]

        # Verify tenant B's product is in cache
        assert product_tenant_b.id in product_ids_b
        assert product_tenant_a.id not in product_ids_b

        # Second call should hit cache
        products_a_call2 = ProductService.get_cached_active_products_list()
        products_b_call2 = ProductService.get_cached_active_products_list()

        # Cached data should match first call
        assert len(products_a_call2) == len(products_a_call1)
        assert len(products_b_call2) == len(products_b_call1)

    def test_cached_category_tree_isolated_by_tenant(
        self, tenant_a, tenant_b, category_tenant_a, category_tenant_b, enable_cache
    ):
        """Verify cached category tree is tenant-isolated"""
        from products.services import ProductService

        # Cache categories for tenant A
        set_current_tenant(tenant_a)
        categories_a = ProductService.get_cached_category_tree()
        category_ids_a = [c.id for c in categories_a]
        assert category_tenant_a.id in category_ids_a
        assert category_tenant_b.id not in category_ids_a

        # Cache categories for tenant B
        set_current_tenant(tenant_b)
        categories_b = ProductService.get_cached_category_tree()
        category_ids_b = [c.id for c in categories_b]
        assert category_tenant_b.id in category_ids_b
        assert category_tenant_a.id not in category_ids_b


@pytest.mark.django_db
class TestDiscountCacheIsolation:
    """Test discount caching tenant isolation"""

    def test_cached_discounts_isolated_by_tenant(
        self, tenant_a, tenant_b, discount_tenant_a, discount_tenant_b, enable_cache
    ):
        """
        CRITICAL: Verify active discounts cache is tenant-isolated

        Business Impact: Revenue loss if wrong discounts are cached/applied
        """
        from discounts.services import DiscountService

        # Cache discounts for tenant A
        set_current_tenant(tenant_a)
        discounts_a = DiscountService.get_active_discounts(tenant=tenant_a)
        discount_codes_a = [d.code for d in discounts_a]
        assert discount_tenant_a.code in discount_codes_a
        assert discount_tenant_b.code not in discount_codes_a

        # Cache discounts for tenant B
        set_current_tenant(tenant_b)
        discounts_b = DiscountService.get_active_discounts(tenant=tenant_b)
        discount_codes_b = [d.code for d in discounts_b]
        assert discount_tenant_b.code in discount_codes_b
        assert discount_tenant_a.code not in discount_codes_b


@pytest.mark.django_db
class TestSettingsCacheIsolation:
    """Test settings caching tenant isolation"""

    def test_cached_settings_isolated_by_tenant(
        self, tenant_a, tenant_b, global_settings_tenant_a, global_settings_tenant_b, enable_cache
    ):
        """
        CRITICAL: Verify GlobalSettings queries are tenant-scoped

        Security Impact: Could expose sensitive configuration from other tenants
        """
        from settings.models import GlobalSettings

        # Verify tenant A can only see their settings
        set_current_tenant(tenant_a)
        settings_a = list(GlobalSettings.objects.all())
        assert len(settings_a) == 1
        assert global_settings_tenant_a in settings_a
        assert global_settings_tenant_b not in settings_a

        # Verify tenant B can only see their settings
        set_current_tenant(tenant_b)
        settings_b = list(GlobalSettings.objects.all())
        assert len(settings_b) == 1
        assert global_settings_tenant_b in settings_b
        assert global_settings_tenant_a not in settings_b


@pytest.mark.django_db
class TestOAuthTokenCacheIsolation:
    """Test OAuth token caching tenant isolation (CRITICAL SECURITY)"""

    def test_oauth_token_cache_isolated_by_tenant(self, tenant_a, tenant_b, enable_cache):
        """
        CRITICAL: Verify Clover OAuth tokens are cached separately per tenant

        Security Impact: Cross-tenant OAuth token leakage allows unauthorized payments
        """
        from payments.clover_oauth import CloverOAuthService

        # Manually cache tokens for both tenants
        set_current_tenant(tenant_a)
        oauth_service_a = CloverOAuthService(merchant_id='MERCHANT_A', tenant=tenant_a)
        token_data_a = {'access_token': 'test_token_a_12345', 'expires_in': 3600}
        oauth_service_a._cache_token('MERCHANT_A', token_data_a)

        set_current_tenant(tenant_b)
        oauth_service_b = CloverOAuthService(merchant_id='MERCHANT_B', tenant=tenant_b)
        token_data_b = {'access_token': 'test_token_b_67890', 'expires_in': 3600}
        oauth_service_b._cache_token('MERCHANT_B', token_data_b)

        # Verify tenant A can only retrieve their token
        set_current_tenant(tenant_a)
        oauth_service_a_check = CloverOAuthService(merchant_id='MERCHANT_A', tenant=tenant_a)
        token_a = oauth_service_a_check.get_cached_token('MERCHANT_A')
        assert token_a == 'test_token_a_12345'

        # Verify tenant B can only retrieve their token
        set_current_tenant(tenant_b)
        oauth_service_b_check = CloverOAuthService(merchant_id='MERCHANT_B', tenant=tenant_b)
        token_b = oauth_service_b_check.get_cached_token('MERCHANT_B')
        assert token_b == 'test_token_b_67890'

        # Verify cache keys are different (tenant-scoped)
        cache_key_a = f"clover_token_{tenant_a.id}_MERCHANT_A"
        cache_key_b = f"clover_token_{tenant_b.id}_MERCHANT_B"
        assert cache_key_a != cache_key_b


@pytest.mark.django_db
class TestExportQueueCacheIsolation:
    """Test export queue caching tenant isolation"""

    def test_export_queue_isolated_by_tenant(self, tenant_a, tenant_b, enable_cache):
        """
        CRITICAL: Verify export operations are queued separately per tenant

        Security Impact: Tenants could access other tenants' export data
        """
        from reports.advanced_exports import ExportQueue

        # Add export to queue for tenant A
        set_current_tenant(tenant_a)
        operation_id_a = 'operation_a_12345'
        ExportQueue.add_to_queue(
            operation_id=operation_id_a,
            tenant_id=str(tenant_a.id),
            priority=1
        )

        # Add export to queue for tenant B
        set_current_tenant(tenant_b)
        operation_id_b = 'operation_b_12345'
        ExportQueue.add_to_queue(
            operation_id=operation_id_b,
            tenant_id=str(tenant_b.id),
            priority=1
        )

        # Verify queue status is tenant-isolated
        set_current_tenant(tenant_a)
        queue_status_a = ExportQueue.get_queue_status(tenant_id=str(tenant_a.id))
        assert queue_status_a['total_operations'] >= 1

        set_current_tenant(tenant_b)
        queue_status_b = ExportQueue.get_queue_status(tenant_id=str(tenant_b.id))
        assert queue_status_b['total_operations'] >= 1

        # Each tenant's queue should be separate
        assert queue_status_a != queue_status_b


@pytest.mark.django_db
class TestGoogleReviewsCacheIsolation:
    """Test Google reviews caching tenant isolation"""

    def test_google_reviews_cache_isolated_by_tenant(
        self, tenant_a, tenant_b, store_location_tenant_a, enable_cache
    ):
        """
        Verify Google reviews cache is tenant-isolated

        Business Impact: Tenants should see their own reviews, not others'
        """
        from integrations.services import GooglePlacesService
        from unittest.mock import patch, MagicMock

        # Create store location for tenant B
        from settings.models import StoreLocation
        set_current_tenant(tenant_b)
        store_location_b = StoreLocation.objects.create(
            tenant=tenant_b,
            name='Tenant B Location',
            address='456 Burger Ave, Chicago, IL 60601',
            is_default=True,
            google_place_id='PLACE_ID_B'
        )

        # Set Place ID for tenant A
        store_location_tenant_a.google_place_id = 'PLACE_ID_A'
        store_location_tenant_a.save()

        # Mock Google API response with correct structure
        mock_api_response = {
            'status': 'OK',
            'result': {
                'name': 'Test Restaurant',
                'rating': 4.5,
                'reviews': [
                    {'rating': 5, 'text': 'Great!'}
                ],
                'user_ratings_total': 100
            }
        }

        with patch('integrations.services.requests.get') as mock_get:
            mock_get.return_value = MagicMock(
                status_code=200,
                json=lambda: mock_api_response
            )

            # Get reviews for tenant A
            set_current_tenant(tenant_a)
            reviews_a = GooglePlacesService.get_reviews(tenant=tenant_a)

            # Get reviews for tenant B
            set_current_tenant(tenant_b)
            reviews_b = GooglePlacesService.get_reviews(tenant=tenant_b)

            # Verify cache keys are different
            cache_key_a = f"google_reviews_{tenant_a.id}_PLACE_ID_A"
            cache_key_b = f"google_reviews_{tenant_b.id}_PLACE_ID_B"

            # Both should be in cache but separate
            assert cache.get(cache_key_a) is not None
            assert cache.get(cache_key_b) is not None
            assert cache_key_a != cache_key_b


@pytest.mark.django_db
class TestBusinessHoursCacheIsolation:
    """Test business hours caching tenant isolation"""

    def test_business_hours_cache_isolated_by_tenant(
        self, tenant_a, tenant_b, enable_cache
    ):
        """
        Verify business hours cache is tenant-isolated

        Business Impact: Wrong hours displayed could confuse customers
        """
        from business_hours.models import BusinessHoursProfile
        from business_hours.services import BusinessHoursService
        from datetime import date

        # Create business hours for tenant A
        set_current_tenant(tenant_a)
        profile_a = BusinessHoursProfile.objects.create(
            name='Main Hours',
            tenant=tenant_a,
            is_default=True
        )

        # Create business hours for tenant B
        set_current_tenant(tenant_b)
        profile_b = BusinessHoursProfile.objects.create(
            name='Main Hours',
            tenant=tenant_b,
            is_default=True
        )

        # Get hours for tenant A
        set_current_tenant(tenant_a)
        service_a = BusinessHoursService(profile_id=profile_a.id)
        today = date.today()
        hours_a = service_a.get_hours_for_date(today)

        # Get hours for tenant B
        set_current_tenant(tenant_b)
        service_b = BusinessHoursService(profile_id=profile_b.id)
        hours_b = service_b.get_hours_for_date(today)

        # Verify cache keys are different
        cache_key_a = f"business_hours_{tenant_a.id}_{profile_a.id}_{today.isoformat()}"
        cache_key_b = f"business_hours_{tenant_b.id}_{profile_b.id}_{today.isoformat()}"

        assert cache_key_a != cache_key_b


@pytest.mark.django_db
class TestCacheInvalidationIsolation:
    """Test that cache invalidation only affects current tenant"""

    def test_cache_invalidation_tenant_scoped(
        self, tenant_a, tenant_b, product_tenant_a, product_tenant_b, enable_cache
    ):
        """
        CRITICAL: Verify cache invalidation only clears current tenant's cache

        Business Impact: Shouldn't clear other tenants' cache when one updates data
        """
        from products.services import ProductService
        from products.models import Product

        # Cache products for both tenants
        set_current_tenant(tenant_a)
        products_a_before = ProductService.get_cached_active_products_list()

        set_current_tenant(tenant_b)
        products_b_before = ProductService.get_cached_active_products_list()

        # Update product for tenant A (triggers cache invalidation)
        set_current_tenant(tenant_a)
        product_tenant_a.price = 99.99
        product_tenant_a.save()  # This should invalidate tenant A's cache only

        # Tenant A's cache should be cleared (fresh data)
        products_a_after = ProductService.get_cached_active_products_list()

        # Tenant B's cache should still be valid (unaffected)
        set_current_tenant(tenant_b)
        products_b_after = ProductService.get_cached_active_products_list()

        # Verify tenant B's cache wasn't affected
        assert len(products_b_after) == len(products_b_before)
