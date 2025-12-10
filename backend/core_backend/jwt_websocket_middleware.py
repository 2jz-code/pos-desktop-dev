"""
JWT WebSocket Authentication Middleware for Django Channels.

Authenticates WebSocket connections using JWT tokens from cookies.
This allows WebSocket consumers to access authenticated users just like HTTP views.
"""
import jwt
import logging
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from users.models import User

logger = logging.getLogger(__name__)


class JWTAuthMiddleware(BaseMiddleware):
    """
    Custom middleware to authenticate WebSocket connections using JWT from cookies.

    This replaces channels.auth.AuthMiddlewareStack for JWT-based authentication.
    Extracts JWT from cookies, validates it, and adds authenticated user to scope.
    """

    async def __call__(self, scope, receive, send):
        # Only process WebSocket connections
        if scope['type'] != 'websocket':
            return await super().__call__(scope, receive, send)

        # Extract and authenticate user from JWT
        scope['user'] = await self.get_user_from_jwt(scope)

        return await super().__call__(scope, receive, send)

    async def get_user_from_jwt(self, scope):
        """
        Extract user from JWT token in cookies.

        WebSocket connections include cookies in the 'headers' scope key.
        We parse cookies, find JWT, decode and validate it, and lookup user.
        """
        # Parse cookies from headers
        headers = dict(scope.get('headers', []))
        cookie_header = headers.get(b'cookie', b'').decode('utf-8')

        if not cookie_header:
            logger.debug("No cookie header found in WebSocket connection")
            return AnonymousUser()

        # Parse cookie string into dict
        cookies = {}
        for cookie in cookie_header.split('; '):
            if '=' in cookie:
                key, value = cookie.split('=', 1)
                cookies[key] = value

        # Try to get JWT from cookies (POS uses 'access_token' cookie)
        jwt_config = settings.SIMPLE_JWT
        access_token = cookies.get(jwt_config.get('AUTH_COOKIE'))

        if not access_token:
            logger.debug("No JWT access token found in WebSocket cookies")
            return AnonymousUser()

        try:
            # Decode and validate JWT
            payload = jwt.decode(
                access_token,
                settings.SECRET_KEY,
                algorithms=[jwt_config.get('ALGORITHM', 'HS256')],
                options={
                    'verify_signature': True,
                    'verify_exp': True,
                }
            )

            user_id = payload.get('user_id')
            if not user_id:
                logger.warning("JWT payload missing user_id")
                return AnonymousUser()

            # Look up user by ID from JWT claims (async database query)
            user = await database_sync_to_async(User.objects.get)(
                id=user_id,
                is_active=True
            )

            logger.info(
                f"WebSocket authenticated: user={user.email}, "
                f"user_id={user.id}, tenant_id={getattr(user, 'tenant_id', 'N/A')}"
            )
            return user

        except jwt.ExpiredSignatureError:
            logger.warning("Expired JWT token in WebSocket connection")
            return AnonymousUser()
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token in WebSocket connection: {e}")
            return AnonymousUser()
        except User.DoesNotExist:
            logger.warning(f"User {user_id} from JWT not found")
            return AnonymousUser()
        except Exception as e:
            logger.error(f"Error authenticating WebSocket user: {e}", exc_info=True)
            return AnonymousUser()
