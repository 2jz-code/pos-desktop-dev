from django.http import JsonResponse
from django.conf import settings
from .models import Tenant
from .managers import set_current_tenant


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
    2. Authenticated user's tenant - Staff/POS users
    3. Admin subdomain path - Staff admin React app (admin.ajeen.com/joespizza)
    4. Management subdomain - System admin (manage.ajeen.com)
    5. Customer subdomain - Public ordering (joespizza.ajeen.com)
    6. Session tenant - Guest users mid-checkout
    7. Development fallback - localhost
    8. Fail with 400

    Examples:
        joespizza.ajeen.com → Tenant "joespizza" (from subdomain)
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

        # 1. Superuser override (?tenant=slug) - Admin/debugging only
        if request.user.is_authenticated and request.user.is_superuser:
            tenant_slug = request.GET.get('tenant')
            if tenant_slug:
                try:
                    return Tenant.objects.get(slug=tenant_slug)
                except Tenant.DoesNotExist:
                    pass

        # 2. Authenticated user's tenant (Staff POS) - MOST COMMON
        # Staff user logs in with email/password → user.tenant determines tenant
        # NO tenant parameter needed in login or subsequent requests
        if request.user.is_authenticated and hasattr(request.user, 'tenant') and request.user.tenant:
            return request.user.tenant

        # 3. Admin subdomain with path-based tenant (admin.ajeen.com/joespizza)
        # Staff admin React app uses path parameter for tenant
        if subdomain == 'admin':
            path_parts = request.path.strip('/').split('/')
            if len(path_parts) >= 1 and path_parts[0]:
                tenant_slug = path_parts[0]
                try:
                    tenant = Tenant.objects.get(slug=tenant_slug, is_active=True)
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
                return Tenant.objects.get(slug=settings.SYSTEM_TENANT_SLUG, is_active=True)
            except Tenant.DoesNotExist:
                raise TenantNotFoundError(
                    f"System tenant '{settings.SYSTEM_TENANT_SLUG}' not found. "
                    f"Run: python manage.py ensure_system_tenant"
                )

        # 5. Customer subdomain (joespizza.ajeen.com) - Public ordering
        # Extract tenant from subdomain for customer-facing sites
        if subdomain and subdomain not in ['www', 'api']:
            try:
                tenant = Tenant.objects.get(slug=subdomain, is_active=True)
                # Store in session for subsequent guest requests
                request.session['tenant_id'] = str(tenant.id)
                return tenant
            except Tenant.DoesNotExist:
                raise TenantNotFoundError(
                    f"Tenant '{subdomain}' not found. "
                    f"Check subdomain spelling or contact support."
                )

        # 6. Session tenant (guest already started session)
        tenant_id = request.session.get('tenant_id')
        if tenant_id:
            try:
                return Tenant.objects.get(id=tenant_id, is_active=True)
            except Tenant.DoesNotExist:
                pass

        # 7. Development fallback (localhost)
        # Use DEFAULT_TENANT_SLUG for local development
        tenant_slug = self.get_fallback_tenant_slug(host, subdomain)
        if tenant_slug:
            try:
                return Tenant.objects.get(slug=tenant_slug, is_active=True)
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
        """
        # Handle localhost and IP addresses
        if host in ['localhost', '127.0.0.1'] or host.startswith('192.168'):
            return None

        parts = host.split('.')

        # Need at least subdomain.domain.tld (3 parts)
        if len(parts) >= 3:
            return parts[0]

        return None

    def get_fallback_tenant_slug(self, host, subdomain):
        """
        Get fallback tenant slug for development hosts only.

        Handles:
        - localhost/127.0.0.1/192.168.x.x → DEFAULT_TENANT_SLUG (local dev)

        Note: System hosts (manage.ajeen.com) are handled explicitly in step 4.
              Admin subdomain (admin.ajeen.com) requires path parameter.

        Returns:
            str: Tenant slug to use, or None to fail closed
        """
        # Development hosts (localhost, IPs)
        if host in ['localhost', '127.0.0.1'] or host.startswith('192.168'):
            return getattr(settings, 'DEFAULT_TENANT_SLUG', None)

        # No fallback for production - let it fail closed
        return None
