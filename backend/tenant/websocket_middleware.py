"""
WebSocket Tenant Middleware for Django Channels.

Resolves tenant from JWT cookie and adds to WebSocket scope.
This allows consumers to access request.tenant just like HTTP views.
"""
import jwt
from channels.db import database_sync_to_async
from django.conf import settings
from .models import Tenant
from .managers import set_current_tenant
import logging

logger = logging.getLogger(__name__)


class TenantWebSocketMiddleware:
    """
    ASGI middleware to add tenant context to WebSocket connections.

    Extracts tenant from JWT cookie (same as HTTP middleware) and adds
    to WebSocket scope so consumers can access it via self.scope['tenant'].
    Also sets thread-local tenant context for TenantManager.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        # Only process WebSocket connections
        if scope['type'] != 'websocket':
            return await self.app(scope, receive, send)

        # Extract tenant from JWT in cookies
        tenant = await self.get_tenant_from_jwt(scope)

        # Add tenant to scope
        scope['tenant'] = tenant

        if tenant:
            logger.info(f"TenantWebSocketMiddleware: Set tenant {tenant.slug} for WebSocket connection")
            # Set thread-local context for TenantManager (like HTTP middleware does)
            await database_sync_to_async(set_current_tenant)(tenant)
        else:
            logger.warning("TenantWebSocketMiddleware: No tenant found for WebSocket connection")

        try:
            # Call the next middleware/consumer
            return await self.app(scope, receive, send)
        finally:
            # Clean up thread-local context
            if tenant:
                await database_sync_to_async(set_current_tenant)(None)

    async def get_tenant_from_jwt(self, scope):
        """
        Extract tenant from JWT token in cookies.

        WebSocket connections include cookies in the 'headers' scope key.
        We parse cookies, find JWT, decode it, and lookup tenant.
        """
        # Parse cookies from headers
        headers = dict(scope.get('headers', []))
        cookie_header = headers.get(b'cookie', b'').decode('utf-8')

        if not cookie_header:
            return None

        # Parse cookie string into dict
        cookies = {}
        for cookie in cookie_header.split('; '):
            if '=' in cookie:
                key, value = cookie.split('=', 1)
                cookies[key] = value

        # Try to get JWT from cookies (check both admin and POS cookie names)
        admin_cookie_name = getattr(settings, 'SIMPLE_JWT_ADMIN', {}).get('AUTH_COOKIE')
        access_token = None

        if admin_cookie_name:
            access_token = cookies.get(admin_cookie_name)
        if not access_token:
            access_token = cookies.get(settings.SIMPLE_JWT.get("AUTH_COOKIE"))

        if not access_token:
            return None

        try:
            # Decode JWT without verification (tenant lookup only)
            # Full verification happens in the consumer if needed
            payload = jwt.decode(
                access_token,
                options={'verify_signature': False, 'verify_exp': False}
            )

            tenant_id = payload.get('tenant_id')
            if not tenant_id:
                return None

            # Look up tenant by ID from JWT claims (async database query)
            tenant = await database_sync_to_async(Tenant.objects.get)(
                id=tenant_id,
                is_active=True
            )
            return tenant

        except Exception as e:
            # Invalid JWT format, tenant not found, or other decode errors
            logger.debug(f"TenantWebSocketMiddleware: Failed to extract tenant from JWT: {e}")
            return None
