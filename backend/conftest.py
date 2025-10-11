"""
Root conftest.py for all backend tests.

This file makes fixtures available to all test files across all apps.
"""
import pytest
import os
from django.test import override_settings
from django.core.cache import cache
from tenant.managers import set_current_tenant, get_current_tenant
from django.conf import settings

# Disable Django Debug Toolbar for tests
if 'debug_toolbar' in settings.INSTALLED_APPS:
    settings.INSTALLED_APPS = [app for app in settings.INSTALLED_APPS if app != 'debug_toolbar']
if 'debug_toolbar.middleware.DebugToolbarMiddleware' in settings.MIDDLEWARE:
    settings.MIDDLEWARE = [m for m in settings.MIDDLEWARE if m != 'debug_toolbar.middleware.DebugToolbarMiddleware']

# Disable CSRF checks for tests
settings.ENABLE_CSRF_HEADER_CHECK = False
settings.ENABLE_DOUBLE_SUBMIT_CSRF = False


# ============================================================================
# AUTO-USE FIXTURES (Run automatically for every test)
# ============================================================================

@pytest.fixture(scope='session', autouse=True)
def default_tenant(django_db_setup, django_db_blocker):
    """
    Create default tenant for development/test fallback.

    The TenantMiddleware uses DEFAULT_TENANT_SLUG for localhost/testserver requests.
    This fixture ensures that tenant exists for all tests.
    """
    with django_db_blocker.unblock():
        from tenant.models import Tenant
        from django.conf import settings

        default_slug = getattr(settings, 'DEFAULT_TENANT_SLUG', 'myrestaurant')

        # Create default tenant if it doesn't exist
        tenant, created = Tenant.objects.get_or_create(
            slug=default_slug,
            defaults={
                'name': 'Test Restaurant',
                'is_active': True
            }
        )

        if created:
            print(f"Created default tenant: {default_slug}")

        return tenant


@pytest.fixture(autouse=True)
def reset_tenant_context():
    """
    Reset tenant context after each test.

    CRITICAL: This prevents tenant context from leaking between tests.
    If tenant context leaks, tests may pass when they should fail.
    """
    # Before test: tenant context may be None or set by previous test
    yield  # Run the test

    # After test: ALWAYS reset to None
    set_current_tenant(None)


@pytest.fixture(autouse=True)
def clear_cache_after_test():
    """
    Clear cache after each test to prevent cache pollution.

    This ensures tests don't interfere with each other through cached data.
    """
    yield  # Run the test
    cache.clear()  # Clear all cache keys


# ============================================================================
# API CLIENT FIXTURES
# ============================================================================

@pytest.fixture
def api_client():
    """
    Provide DRF API client for API tests.

    Usage:
        def test_my_api(api_client):
            response = api_client.get('/api/products/')
            assert response.status_code == 200
    """
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def authenticated_client_tenant_a(api_client, admin_user_tenant_a, tenant_a):
    """
    Provide authenticated API client for tenant A.

    Usage:
        def test_protected_endpoint(authenticated_client_tenant_a):
            response = authenticated_client_tenant_a.get('/api/orders/')
            assert response.status_code == 200
    """
    from rest_framework_simplejwt.tokens import RefreshToken
    from tenant.managers import set_current_tenant
    from django.conf import settings

    # Set tenant context
    set_current_tenant(tenant_a)

    # Generate JWT with tenant claims
    refresh = RefreshToken.for_user(admin_user_tenant_a)
    refresh['tenant_id'] = str(tenant_a.id)
    refresh['tenant_slug'] = tenant_a.slug

    # Set JWT cookie (middleware expects JWT in cookies, not Authorization header)
    api_client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

    return api_client


@pytest.fixture
def authenticated_client_tenant_b(api_client, admin_user_tenant_b, tenant_b):
    """
    Provide authenticated API client for tenant B.

    Usage:
        def test_tenant_isolation(authenticated_client_tenant_b, product_tenant_a):
            # Tenant B tries to access Tenant A's product
            response = authenticated_client_tenant_b.get(f'/api/products/{product_tenant_a.id}/')
            assert response.status_code == 404  # Should not see other tenant's data
    """
    from rest_framework_simplejwt.tokens import RefreshToken
    from tenant.managers import set_current_tenant
    from django.conf import settings

    # Set tenant context
    set_current_tenant(tenant_b)

    # Generate JWT with tenant claims
    refresh = RefreshToken.for_user(admin_user_tenant_b)
    refresh['tenant_id'] = str(tenant_b.id)
    refresh['tenant_slug'] = tenant_b.slug

    # Set JWT cookie (middleware expects JWT in cookies, not Authorization header)
    api_client.cookies[settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')] = str(refresh.access_token)

    return api_client


# ============================================================================
# CACHE FIXTURES
# ============================================================================

@pytest.fixture
def disable_cache():
    """
    Disable cache for tests that should not use caching.

    Usage:
        def test_without_cache(disable_cache):
            # Cache is disabled for this test
            products = ProductService.get_cached_active_products_list()
            # Will always hit database, never cache
    """
    with override_settings(
        CACHES={
            'default': {
                'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
            },
            'static_data': {
                'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
            }
        }
    ):
        yield


@pytest.fixture
def enable_cache():
    """
    Explicitly enable cache for cache-specific tests.

    Usage:
        def test_cache_behavior(enable_cache):
            # Cache is explicitly enabled
            # First call - cache miss
            products_1 = ProductService.get_cached_active_products_list()

            # Second call - cache hit
            products_2 = ProductService.get_cached_active_products_list()
            assert products_1 == products_2
    """
    # Uses default cache settings from settings.py
    yield


# ============================================================================
# IMPORT ALL FIXTURES FROM core_backend/tests/fixtures.py
# ============================================================================
from core_backend.tests.fixtures import *
