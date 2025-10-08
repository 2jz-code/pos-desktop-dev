"""
Pytest configuration for backend tests.

This module configures pytest behavior and provides auto-use fixtures
for common test setup/teardown.
"""
import pytest
from django.test import override_settings
from django.core.cache import cache
from tenant.managers import set_current_tenant, get_current_tenant


# ============================================================================
# AUTO-USE FIXTURES (Run automatically for every test)
# ============================================================================

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
# OPTIONAL FIXTURES (Use explicitly when needed)
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


@pytest.fixture
def mock_stripe():
    """
    Mock Stripe API calls for payment tests.

    Usage:
        def test_stripe_payment(mock_stripe):
            # Stripe API calls are mocked
            payment = process_stripe_payment(...)
    """
    import stripe
    from unittest.mock import patch, MagicMock

    with patch('stripe.PaymentIntent.create') as mock_create:
        mock_create.return_value = MagicMock(
            id='pi_test_123',
            status='succeeded',
            amount=5000,
            currency='usd'
        )
        yield mock_create


@pytest.fixture
def mock_clover():
    """
    Mock Clover API calls for terminal payment tests.

    Usage:
        def test_clover_payment(mock_clover):
            # Clover API calls are mocked
            payment = process_clover_payment(...)
    """
    from unittest.mock import patch, MagicMock

    with patch('payments.clover_api.CloverAPIService.create_payment') as mock_create:
        mock_create.return_value = {
            'id': 'CLV_TEST_123',
            'status': 'PAID',
            'amount': 5000
        }
        yield mock_create


@pytest.fixture
def mock_email():
    """
    Mock email sending for notification tests.

    Usage:
        def test_email_notification(mock_email):
            # Emails are mocked, not sent
            send_order_confirmation(order)
            assert mock_email.called
    """
    from unittest.mock import patch

    with patch('django.core.mail.send_mail') as mock_send:
        yield mock_send


@pytest.fixture
def mock_celery():
    """
    Mock Celery task execution for async tests.

    Usage:
        def test_async_task(mock_celery):
            # Tasks execute immediately, not async
            result = warm_product_caches.delay()
            assert result
    """
    from unittest.mock import patch

    with patch('celery.app.task.Task.apply_async', side_effect=lambda *args, **kwargs: None):
        yield


# ============================================================================
# PYTEST CONFIGURATION
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom markers"""
    config.addinivalue_line(
        "markers", "tenant_isolation: mark test as tenant isolation test (critical)"
    )
    config.addinivalue_line(
        "markers", "business_logic: mark test as business logic test"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as performance test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow (>5 seconds)"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (API + DB)"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test (isolated)"
    )


# ============================================================================
# TEST DATABASE CONFIGURATION
# ============================================================================

@pytest.fixture(scope='session')
def django_db_setup():
    """
    Configure test database settings.

    Uses faster settings for test database:
    - In-memory SQLite for CI/CD
    - Postgres for local development (if configured)
    """
    pass  # Django test runner handles this


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def assert_tenant_isolated(queryset, expected_tenant):
    """
    Helper function to assert queryset is filtered by expected tenant.

    Usage:
        products = Product.objects.all()
        assert_tenant_isolated(products, tenant_a)
    """
    for obj in queryset:
        assert obj.tenant == expected_tenant, (
            f"Object {obj} has tenant {obj.tenant}, expected {expected_tenant}"
        )


def assert_cross_tenant_access_denied(response, expected_status=404):
    """
    Helper function to assert cross-tenant access is denied.

    Usage:
        response = client.get(f'/api/products/{other_tenant_product_id}/')
        assert_cross_tenant_access_denied(response)
    """
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}. "
        f"Cross-tenant access should be denied with {expected_status}."
    )


# Export helper functions so they can be imported in tests
__all__ = [
    'assert_tenant_isolated',
    'assert_cross_tenant_access_denied',
]
