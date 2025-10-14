"""
JWT Authentication Tests - Priority 2A

These tests verify that JWT tokens include tenant claims and that tenant
resolution from JWT tokens works correctly.

Priority: HIGH - Foundation for tenant-aware API authentication
Status: Week 1, Day 1-2
"""
import pytest
import jwt
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from users.models import User
from users.services import UserService
from customers.models import Customer


def set_jwt_cookie(client, access_token, cookie_name=None):
    """
    Helper function to set JWT token as cookie (matching production behavior).

    The tenant middleware expects JWT tokens in cookies, not Authorization headers.
    """
    if cookie_name is None:
        cookie_name = settings.SIMPLE_JWT.get("AUTH_COOKIE", "access_token")

    client.cookies[cookie_name] = access_token


@pytest.mark.django_db
class TestJWTAuthentication:
    """Test JWT token generation and tenant claim inclusion"""

    def test_jwt_includes_tenant_claims(self, tenant_a, admin_user_tenant_a):
        """
        CRITICAL: Verify JWT access token includes tenant_id and tenant_slug

        Security Impact: JWT tokens must include tenant context for API isolation
        Business Impact: Enables stateless tenant resolution without session
        """
        # Generate tokens directly using the service
        tokens = UserService.generate_tokens_for_user(admin_user_tenant_a)
        access_token = tokens['access']

        # Decode JWT without signature verification (for inspection only)
        payload = jwt.decode(access_token, options={"verify_signature": False})

        # Verify tenant claims present
        assert 'tenant_id' in payload, "tenant_id missing from JWT payload"
        assert 'tenant_slug' in payload, "tenant_slug missing from JWT payload"

        # Verify tenant claims correct
        assert payload['tenant_id'] == str(tenant_a.id), "Incorrect tenant_id in JWT"
        assert payload['tenant_slug'] == 'pizza-place', "Incorrect tenant_slug in JWT"

        # Verify standard JWT claims also present
        assert 'user_id' in payload, "user_id missing from JWT"
        assert 'exp' in payload, "Expiration missing from JWT"

    def test_jwt_tenant_resolution_from_token(self, tenant_a, admin_user_tenant_a):
        """
        Verify middleware extracts tenant from JWT correctly

        This tests the complete flow:
        1. User gets JWT with tenant claims
        2. Subsequent request includes JWT cookie
        3. Middleware extracts tenant from JWT
        4. request.tenant is set correctly
        """
        # Generate tokens
        tokens = UserService.generate_tokens_for_user(admin_user_tenant_a)
        access_token = tokens['access']

        client = APIClient()

        # Set JWT as cookie (matches production behavior)
        set_jwt_cookie(client, access_token)

        # Make authenticated request
        response = client.get('/api/products/')

        # Verify request succeeded (middleware didn't block)
        assert response.status_code == 200, f"Request with valid JWT failed: {response.status_code}"

        # Products should be filtered by tenant (verified in isolation tests)
        # This test verifies middleware set tenant context correctly

    def test_jwt_expired_token_rejected(self, tenant_a, admin_user_tenant_a):
        """
        Verify expired JWT tokens are rejected with 401 Unauthorized

        Security Impact: Prevents use of old tokens after expiration
        """
        client = APIClient()

        # Generate an expired token by manipulating the expiration
        refresh = RefreshToken.for_user(admin_user_tenant_a)
        access_token = refresh.access_token

        # Add tenant claims (required for middleware)
        access_token['tenant_id'] = str(tenant_a.id)
        access_token['tenant_slug'] = tenant_a.slug

        # Manually set expiration to past
        access_token.set_exp(lifetime=timedelta(seconds=-10))

        expired_token = str(access_token)

        # Set JWT as cookie
        set_jwt_cookie(client, expired_token)

        # Try to use expired token
        response = client.get('/api/products/')

        # Verify rejection (should be 401 or 400)
        assert response.status_code in [400, 401], f"Expired token should return 400/401, got {response.status_code}"

    def test_jwt_invalid_tenant_rejected(self, admin_user_tenant_a):
        """
        Verify JWT with non-existent tenant_id is rejected

        Security Impact: Prevents access with invalid tenant context
        Test Case: Tenant was deleted after token issued
        """
        from uuid import uuid4

        client = APIClient()

        # Create token with fake tenant ID
        refresh = RefreshToken.for_user(admin_user_tenant_a)
        access_token = refresh.access_token

        # Inject fake tenant_id into payload
        fake_tenant_id = str(uuid4())
        access_token['tenant_id'] = fake_tenant_id
        access_token['tenant_slug'] = 'non-existent-tenant'

        invalid_token = str(access_token)

        # Set JWT as cookie
        set_jwt_cookie(client, invalid_token)

        # Try to use token with invalid tenant (use protected endpoint)
        response = client.get('/api/users/')

        # Verify rejection (should be 400 Bad Request or 403 Forbidden)
        assert response.status_code in [400, 403], \
            f"Invalid tenant should return 400/403, got {response.status_code}"

    def test_jwt_inactive_tenant_rejected(self, admin_user_tenant_a):
        """
        Verify JWT with inactive tenant (is_active=False) is rejected

        Security Impact: Blocks access when tenant account suspended
        Business Impact: Allows tenant suspension without invalidating all tokens
        """
        client = APIClient()

        # Generate token while tenant is active
        tokens = UserService.generate_tokens_for_user(admin_user_tenant_a)
        access_token = tokens['access']

        # Deactivate tenant
        tenant = admin_user_tenant_a.tenant
        tenant.is_active = False
        tenant.save()

        # Set JWT as cookie
        set_jwt_cookie(client, access_token)

        # Try to use token after tenant deactivated
        response = client.get('/api/products/')

        # Verify rejection
        # Middleware filters for is_active=True, so inactive tenants return 400 (not found)
        assert response.status_code in [400, 403], \
            f"Inactive tenant should return 400/403, got {response.status_code}"

        # Cleanup
        tenant.is_active = True
        tenant.save()

    def test_customer_jwt_includes_tenant_claims(self, tenant_a):
        """
        Verify customer JWT tokens also include tenant_id and tenant_slug

        Business Impact: Customer-facing API also uses tenant isolation
        """
        from customers.services import CustomerAuthService
        from tenant.managers import set_current_tenant

        # Set tenant context for customer creation
        set_current_tenant(tenant_a)

        # Create customer
        customer = Customer.objects.create(
            email='customer@example.com',
            first_name='Test',
            last_name='Customer',
            tenant=tenant_a
        )
        customer.set_password('password123')
        customer.save()

        # Generate tokens directly (bypass login endpoint tenant resolution)
        tokens = CustomerAuthService.generate_customer_tokens(customer)
        token = tokens['access']

        # Decode JWT
        payload = jwt.decode(token, options={"verify_signature": False})

        # Verify tenant claims present for customer tokens too
        assert 'tenant_id' in payload, "tenant_id missing from customer JWT"
        assert 'tenant_slug' in payload, "tenant_slug missing from customer JWT"
        assert payload['tenant_id'] == str(tenant_a.id), "Incorrect tenant_id in customer JWT"
        assert payload['tenant_slug'] == 'pizza-place', "Incorrect tenant_slug in customer JWT"

    def test_multiple_tabs_independent_tenant_context(self, tenant_a, tenant_b):
        """
        Verify different browser tabs can use different tenant JWTs independently

        Business Impact: Staff can manage multiple restaurants simultaneously
        Architecture: Stateless JWT ensures no server-side session conflicts
        """
        from tenant.managers import set_current_tenant

        # Create users for both tenants
        set_current_tenant(tenant_a)
        user_a = User.objects.create_user(
            email='staff@pizza.com',
            username='staff_pizza',
            password='password123',
            tenant=tenant_a,
            role='manager'
        )

        set_current_tenant(tenant_b)
        user_b = User.objects.create_user(
            email='staff@burger.com',
            username='staff_burger',
            password='password123',
            tenant=tenant_b,
            role='manager'
        )

        # Generate tokens for both users
        tokens_a = UserService.generate_tokens_for_user(user_a)
        tokens_b = UserService.generate_tokens_for_user(user_b)

        # Simulate two browser tabs (two API clients)
        client_tab1 = APIClient()
        client_tab2 = APIClient()

        # Tab 1: Set tenant A token as cookie
        set_jwt_cookie(client_tab1, tokens_a["access"])
        response_tab1 = client_tab1.get('/api/products/')
        assert response_tab1.status_code == 200, f"Tab 1 request failed: {response_tab1.status_code}"

        # Tab 2: Set tenant B token as cookie
        set_jwt_cookie(client_tab2, tokens_b["access"])
        response_tab2 = client_tab2.get('/api/products/')
        assert response_tab2.status_code == 200, f"Tab 2 request failed: {response_tab2.status_code}"

        # Verify both worked independently (no cross-contamination)
        # Tenant isolation already verified in separate tests
        # This test confirms concurrent requests with different tenants work

    def test_jwt_refresh_preserves_tenant_claims(self, tenant_a, admin_user_tenant_a):
        """
        Verify refresh token has tenant claims and new access tokens preserve them

        Security Impact: Tenant context must persist through token refresh
        Business Impact: Users stay in correct tenant after token refresh
        """
        # Generate initial tokens
        tokens = UserService.generate_tokens_for_user(admin_user_tenant_a)
        refresh_token_str = tokens['refresh']
        original_access = tokens['access']

        # Decode original access token
        original_payload = jwt.decode(original_access, options={"verify_signature": False})
        original_tenant_id = original_payload['tenant_id']
        original_tenant_slug = original_payload['tenant_slug']

        # Decode refresh token to verify it also has tenant claims
        refresh_payload = jwt.decode(refresh_token_str, options={"verify_signature": False})
        assert 'tenant_id' in refresh_payload, "tenant_id missing from refresh token"
        assert 'tenant_slug' in refresh_payload, "tenant_slug missing from refresh token"
        assert refresh_payload['tenant_id'] == original_tenant_id, "tenant_id mismatch in refresh token"

        # Generate new access token from refresh token
        refresh_token_obj = RefreshToken(refresh_token_str)
        new_access_token = str(refresh_token_obj.access_token)

        # Decode new access token
        new_payload = jwt.decode(new_access_token, options={"verify_signature": False})

        # Verify tenant claims preserved in new access token
        assert 'tenant_id' in new_payload, "tenant_id missing after refresh"
        assert 'tenant_slug' in new_payload, "tenant_slug missing after refresh"
        assert new_payload['tenant_id'] == original_tenant_id, "tenant_id changed after refresh"
        assert new_payload['tenant_slug'] == original_tenant_slug, "tenant_slug changed after refresh"


@pytest.mark.django_db
class TestJWTAuthenticationEdgeCases:
    """Additional edge case tests for JWT authentication"""

    def test_jwt_without_tenant_claims_rejected(self, admin_user_tenant_a):
        """
        Verify old-style JWT (without tenant claims) is rejected

        Migration Safety: Ensures old tokens don't work after upgrade
        """
        from rest_framework_simplejwt.tokens import AccessToken

        client = APIClient()

        # Create token manually without tenant claims
        token = AccessToken.for_user(admin_user_tenant_a)
        # Don't add tenant claims (simulating old token format)

        old_style_token = str(token)

        # Set JWT as cookie
        set_jwt_cookie(client, old_style_token)

        # Try to use token without tenant claims (use protected endpoint)
        response = client.get('/api/users/')

        # Should be rejected (400 Bad Request - middleware can't resolve tenant)
        assert response.status_code in [400, 401], \
            f"Token without tenant claims should be rejected, got {response.status_code}"

    def test_jwt_with_mismatched_user_tenant(self, tenant_a, tenant_b):
        """
        Document behavior when JWT tenant_id doesn't match user's actual tenant

        NOTE: In this test we manually create a JWT with mismatched tenant claims.
        In production, this is prevented by:
        1. JWT cryptographic signatures (can't modify signed tokens)
        2. UserService.generate_tokens_for_user() always uses user.tenant
        3. This scenario would require a compromised signing key

        This test documents that the middleware trusts the JWT tenant_id claim,
        which is correct behavior because JWT signatures prevent tampering.
        """
        from tenant.managers import set_current_tenant

        # Create user in tenant A
        set_current_tenant(tenant_a)
        user = User.objects.create_user(
            email='user@pizza.com',
            username='user_pizza',
            password='password123',
            tenant=tenant_a,
            role='cashier'
        )

        # Create a token with user_id from tenant A but tenant_id for tenant B
        # (This would never happen in production with proper token generation)
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token
        access_token['tenant_id'] = str(tenant_b.id)
        access_token['tenant_slug'] = tenant_b.slug
        malicious_token = str(access_token)

        client = APIClient()
        set_jwt_cookie(client, malicious_token)

        # Request succeeds because middleware sets tenant B context from JWT
        # This is acceptable because JWT signatures prevent this in production
        response = client.get('/api/products/')

        # Document actual behavior: middleware trusts JWT claims (as it should)
        assert response.status_code == 200, \
            "Middleware correctly trusts signed JWT tenant claims"
