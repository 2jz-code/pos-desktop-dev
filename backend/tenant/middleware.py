from django.http import JsonResponse
from django.conf import settings
from .models import Tenant
from .managers import set_current_tenant
import jwt
from jwt.exceptions import InvalidTokenError


class TenantNotFoundError(Exception):
    """Raised when tenant cannot be resolved from request."""
    pass


class TenantMiddleware:
    """
    Resolves tenant from request and attaches to request.tenant.

    Hybrid multi-tenancy architecture (Shopify-style):
    - Customer sites: subdomain-based (joespizza.ajeen.com)
    - Staff admin: path-based (admin.ajeen.com/joespizza)
    - System management: dedicated subdomain (manage.ajeen.com)

    Resolution precedence (highest to lowest):
    1. URL parameter (?tenant=slug) - Superuser override only
    2. Authenticated user's tenant - Staff/POS users (JWT)
    3. Admin subdomain path - Staff admin React app (admin.ajeen.com/joespizza)
    4. Management subdomain - System admin (manage.ajeen.com)
    5. X-Tenant header - Customer sites using shared API
    6. Custom domain - Customer's own domain (order.joespizza.com)
    7. Customer subdomain - Public ordering (joespizza.ajeen.com)
    8. Session tenant - Guest users mid-checkout
    9. Development fallback - localhost
    10. Fail with 400

    Examples:
        joespizza.ajeen.com → Tenant "joespizza" (from subdomain)
        order.joespizza.com → Tenant "joespizza" (from custom domain)
        admin.ajeen.com/joespizza → Tenant "joespizza" (from path)
        manage.ajeen.com → System tenant (for SaaS owner)
        localhost:8000 → DEFAULT_TENANT_SLUG (development)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Skip tenant resolution for Django admin URLs
        # Admin operates without tenant context (staff can manage multiple tenants)
        if request.path.startswith('/admin/'):
            request.tenant = None
            set_current_tenant(None)
            response = self.get_response(request)
            return response

        try:
            tenant = self.get_tenant_from_request(request)
            request.tenant = tenant

            # CRITICAL: Set thread-local context for TenantManager
            set_current_tenant(tenant)

            # Check tenant status (only if tenant was resolved)
            if tenant and not tenant.is_active:
                return JsonResponse({
                    'error': 'Tenant account is inactive',
                    'code': 'TENANT_INACTIVE'
                }, status=403)

            # Process request
            response = self.get_response(request)
            return response

        except TenantNotFoundError as e:
            return JsonResponse({
                'error': str(e),
                'code': 'TENANT_NOT_FOUND'
            }, status=400)

        finally:
            # CRITICAL: Always clean up thread-local context
            # Even if view raises exception, prevent tenant leakage to next request
            set_current_tenant(None)

    def get_tenant_from_request(self, request):
        """
        Resolve tenant using hybrid architecture (Shopify-style).

        Customer sites: subdomain-based (joespizza.ajeen.com)
        Staff admin: path-based (admin.ajeen.com/joespizza)
        System management: dedicated subdomain (manage.ajeen.com)
        """
        host = request.get_host().split(':')[0]  # Remove port if present
        subdomain = self.extract_subdomain(host)
        print(f"🌐 [TenantMiddleware] host='{host}', subdomain='{subdomain}'")

        # 1. Superuser override (?tenant=slug) - Admin/debugging only
        if request.user.is_authenticated and request.user.is_superuser:
            tenant_slug = request.GET.get('tenant')
            if tenant_slug:
                try:
                    return Tenant.objects.get(slug=tenant_slug)
                except Tenant.DoesNotExist:
                    pass

        # 2. JWT token with tenant claims (Staff POS/Admin) - MOST COMMON
        # Enterprise JWT pattern: Extract tenant from JWT claims
        # - Middleware runs BEFORE DRF authentication, so request.user is AnonymousUser
        # - We decode JWT here to get tenant_id from claims
        # - JWT payload contains: {'user_id': 24, 'tenant_id': 'uuid', 'tenant_slug': 'jimmys-pizza'}
        # - This provides stateless, cryptographically-signed tenant binding
        # - Supports multi-tab usage (each tab has independent JWT context)
        # - NO session state needed for tenant resolution
        tenant_from_jwt = self.get_tenant_from_jwt(request)
        if tenant_from_jwt:
            return tenant_from_jwt

        # 3. Admin subdomain with path-based tenant (admin.ajeen.com/joespizza)
        # Staff admin React app uses path parameter for tenant
        if subdomain == 'admin':
            path_parts = request.path.strip('/').split('/')
            if len(path_parts) >= 1 and path_parts[0]:
                tenant_slug = path_parts[0]
                try:
                    # Don't filter by is_active - let line 60 check handle it
                    tenant = Tenant.objects.get(slug=tenant_slug)
                    # Store in session for subsequent requests
                    request.session['tenant_id'] = str(tenant.id)
                    return tenant
                except Tenant.DoesNotExist:
                    raise TenantNotFoundError(
                        f"Tenant '{tenant_slug}' not found. "
                        f"Available at: {host}/{tenant_slug}"
                    )
            # Admin subdomain without tenant slug in path
            raise TenantNotFoundError(
                f"Admin URL requires tenant slug: {host}/{{tenant-slug}}"
            )

        # 4. Management subdomain (manage.ajeen.com) - System tenant
        # Used by SaaS owner for managing all customers
        if subdomain == 'manage':
            try:
                # Don't filter by is_active - let line 60 check handle it
                return Tenant.objects.get(slug=settings.SYSTEM_TENANT_SLUG)
            except Tenant.DoesNotExist:
                raise TenantNotFoundError(
                    f"System tenant '{settings.SYSTEM_TENANT_SLUG}' not found. "
                    f"Run: python manage.py ensure_system_tenant"
                )

        # 4.5. X-Tenant header (for customer sites using shared API domain)
        # Used when customer sites (jimmys-pizza.mydomain.com) call shared API (api.mydomain.com)
        tenant_header = request.META.get('HTTP_X_TENANT')
        if tenant_header:
            print(f"🔍 [TenantMiddleware] X-Tenant header found: '{tenant_header}'")
            try:
                tenant = Tenant.objects.get(slug=tenant_header)
                print(f"✅ [TenantMiddleware] Found tenant from header: {tenant.name} (id={tenant.id})")
                # Store in session for subsequent requests
                request.session['tenant_id'] = str(tenant.id)
                return tenant
            except Tenant.DoesNotExist:
                print(f"❌ [TenantMiddleware] Tenant '{tenant_header}' not found in database")
                print(f"   Available tenants: {list(Tenant.objects.values_list('slug', flat=True))}")
                raise TenantNotFoundError(
                    f"Tenant '{tenant_header}' not found. Check X-Tenant header value."
                )

        # 4.6. Custom domain (order.joespizza.com) - Phase 1 custom domains
        # Allows customers to use their own domains instead of subdomains
        tenant_from_domain = self.get_tenant_from_custom_domain(host)
        if tenant_from_domain:
            print(f"✅ [TenantMiddleware] Resolved tenant from custom domain: {host} → {tenant_from_domain.name}")
            request.session['tenant_id'] = str(tenant_from_domain.id)
            return tenant_from_domain

        # 5. Customer subdomain (joespizza.ajeen.com) - Public ordering
        # Extract tenant from subdomain for customer-facing sites
        if subdomain and subdomain not in ['www', 'api']:
            print(f"🔍 [TenantMiddleware] Attempting customer subdomain lookup: '{subdomain}'")
            try:
                # Don't filter by is_active - let line 60 check handle it
                tenant = Tenant.objects.get(slug=subdomain)
                print(f"✅ [TenantMiddleware] Found tenant: {tenant.name} (id={tenant.id})")
                # Store in session for subsequent guest requests
                request.session['tenant_id'] = str(tenant.id)
                return tenant
            except Tenant.DoesNotExist:
                print(f"❌ [TenantMiddleware] Tenant '{subdomain}' not found in database")
                print(f"   Available tenants: {list(Tenant.objects.values_list('slug', flat=True))}")
                raise TenantNotFoundError(
                    f"Tenant '{subdomain}' not found. "
                    f"Check subdomain spelling or contact support."
                )

        # 6. Session tenant (guest already started session)
        tenant_id = request.session.get('tenant_id')
        if tenant_id:
            try:
                # Don't filter by is_active - let line 60 check handle it
                return Tenant.objects.get(id=tenant_id)
            except Tenant.DoesNotExist:
                pass

        # 7. Development fallback (localhost)
        # Use DEFAULT_TENANT_SLUG for local development
        tenant_slug = self.get_fallback_tenant_slug(host, subdomain)
        if tenant_slug:
            try:
                # Don't filter by is_active - let line 60 check handle it
                return Tenant.objects.get(slug=tenant_slug)
            except Tenant.DoesNotExist:
                # Fallback tenant doesn't exist yet - common during initial setup
                raise TenantNotFoundError(
                    f"Fallback tenant '{tenant_slug}' not found. "
                    f"Run: python manage.py ensure_system_tenant"
                )

        # 8. Fail - no valid tenant resolution method
        raise TenantNotFoundError(
            f"No tenant found for host: {host}. "
            "Expected: {{tenant-slug}}.ajeen.com or admin.ajeen.com/{{tenant-slug}}"
        )

    def extract_subdomain(self, host):
        """
        Extract subdomain from host.

        Examples:
            joespizza.ajeen.com → joespizza
            mariascafe.ajeen.com → mariascafe
            www.ajeen.com → www
            ajeen.com → None
            localhost → None
            jimmys-pizza.localhost → jimmys-pizza (dev only)
            marias-cafe.local → marias-cafe (dev only)
        """
        # Handle plain localhost and IP addresses (no subdomain)
        if host in ['localhost', '127.0.0.1'] or host.startswith('192.168'):
            return None

        parts = host.split('.')

        # Handle .localhost and .local domains for development (e.g., jimmys-pizza.localhost)
        if len(parts) == 2 and parts[1] in ['localhost', 'local']:
            return parts[0]

        # Production: Need at least subdomain.domain.tld (3 parts)
        if len(parts) >= 3:
            return parts[0]

        return None

    def get_tenant_from_jwt(self, request):
        """
        Extract tenant from JWT token claims (enterprise multi-tenancy pattern).

        This runs in middleware BEFORE DRF authentication, allowing us to:
        1. Decode JWT to get tenant_id from claims
        2. Set tenant context early in request lifecycle
        3. Support stateless, cryptographically-signed tenant binding
        4. Enable multi-tab usage (each tab has independent JWT context)

        Args:
            request: Django HttpRequest object

        Returns:
            Tenant instance if JWT contains valid tenant_id, None otherwise

        Note:
            This is a lightweight decode for tenant extraction only.
            Full JWT validation happens later in DRF authentication.
        """
        # Try to get JWT from cookies (check both admin and POS cookie names)
        admin_cookie_name = getattr(settings, 'SIMPLE_JWT_ADMIN', {}).get('AUTH_COOKIE')
        access_token = None

        if admin_cookie_name:
            access_token = request.COOKIES.get(admin_cookie_name)
        if not access_token:
            access_token = request.COOKIES.get(settings.SIMPLE_JWT.get("AUTH_COOKIE"))

        if not access_token:
            return None

        try:
            # Decode JWT without verification (we just need tenant_id for context)
            # Full verification happens in DRF CookieJWTAuthentication
            # options={'verify_signature': False} is safe here because:
            # 1. We only use this for tenant lookup, not authorization
            # 2. DRF will do full signature verification later
            # 3. Invalid tenant_id will just fail to find tenant (graceful fallback)
            payload = jwt.decode(
                access_token,
                options={'verify_signature': False, 'verify_exp': False}
            )

            tenant_id = payload.get('tenant_id')
            if not tenant_id:
                # JWT exists but missing tenant_id claim - this is invalid for multi-tenant system
                # Do not fall back (fail explicitly to prevent security issues)
                raise TenantNotFoundError(
                    "JWT missing tenant_id claim. Token format is invalid."
                )

            # Look up tenant by ID from JWT claims
            # NOTE: Don't filter by is_active here - let the middleware check on line 60 handle it
            # This ensures inactive tenants get proper 403 error instead of falling back
            try:
                return Tenant.objects.get(id=tenant_id)
            except Tenant.DoesNotExist:
                # JWT has tenant claim but tenant doesn't exist - this is a critical error
                # Do not fall back to other methods (fail explicitly)
                raise TenantNotFoundError(
                    f"JWT tenant_id '{tenant_id}' not found. Token may be stale."
                )

        except (InvalidTokenError, KeyError, ValueError):
            # Invalid JWT format or other decode errors
            # Fall through to other tenant resolution methods
            return None

    def get_tenant_from_custom_domain(self, host):
        """
        Resolve tenant by custom domain.

        Phase 1: Proper relational model with O(1) indexed lookup
        Phase 3: Add automated verification and SSL provisioning

        Args:
            host: Incoming host header (e.g., 'order.joespizza.com')

        Returns:
            Tenant instance if custom domain matches and is verified, None otherwise

        Examples:
            order.joespizza.com → Tenant "joespizza"
            shop.mariascafe.com → Tenant "mariascafe"
        """
        try:
            from tenant.models import CustomDomain

            # Fast O(1) lookup with database index
            # Only match verified domains for security
            domain = CustomDomain.objects.select_related('tenant').get(
                domain=host,
                verified=True,
                tenant__is_active=True
            )
            return domain.tenant

        except CustomDomain.DoesNotExist:
            # No custom domain found for this host
            return None
        except Exception as e:
            # Log error but don't break request flow
            print(f"❌ [TenantMiddleware] Error resolving custom domain: {e}")
            return None

    def get_fallback_tenant_slug(self, host, subdomain):
        """
        Get fallback tenant slug for development hosts only.

        Handles:
        - localhost/127.0.0.1/192.168.x.x/testserver → DEFAULT_TENANT_SLUG (local dev)

        Note: System hosts (manage.ajeen.com) are handled explicitly in step 4.
              Admin subdomain (admin.ajeen.com) requires path parameter.

        Returns:
            str: Tenant slug to use, or None to fail closed
        """
        # Development hosts (localhost, IPs, testserver for Django test client)
        if host in ['localhost', '127.0.0.1', 'testserver'] or host.startswith('192.168'):
            return getattr(settings, 'DEFAULT_TENANT_SLUG', None)

        # No fallback for production - let it fail closed
        return None
