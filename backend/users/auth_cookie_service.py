from django.conf import settings
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.contrib.auth import logout


class AuthCookieService:
    """
    Centralized cookie management for all authentication types.
    Extracts cookie handling logic from views to ensure consistent security settings.
    """
    
    @staticmethod
    def get_cookie_settings() -> dict:
        """
        Get consistent cookie security settings across all authentication.
        """
        return {
            'secure': getattr(settings, 'SESSION_COOKIE_SECURE', not settings.DEBUG),
            'samesite': getattr(settings, 'SESSION_COOKIE_SAMESITE', 'Lax'),
            'httponly': True,
        }
    
    @staticmethod
    def set_pos_auth_cookies(response: Response, access_token: str, refresh_token: str) -> Response:
        """
        Set authentication cookies for POS/staff users.
        Extracted from POSLoginView to centralize cookie management.
        """
        cookie_settings = AuthCookieService.get_cookie_settings()
        
        # Set access token cookie
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value=access_token,
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            domain=None,  # Allow cookies to be sent from any origin
            path="/",
            **cookie_settings
        )
        
        # Set refresh token cookie
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            value=refresh_token,
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            domain=None,  # Allow cookies to be sent from any origin
            path="/",
            **cookie_settings
        )
        
        return response
    
    @staticmethod
    def set_admin_auth_cookies(response: Response, access_token: str, refresh_token: str) -> Response:
        """
        Set authentication cookies for admin/web users with /api path.
        """
        cookie_settings = AuthCookieService.get_cookie_settings()
        access_name = settings.SIMPLE_JWT_ADMIN["AUTH_COOKIE"] if hasattr(settings, 'SIMPLE_JWT_ADMIN') else settings.SIMPLE_JWT["AUTH_COOKIE"]
        refresh_name = settings.SIMPLE_JWT_ADMIN["AUTH_COOKIE_REFRESH"] if hasattr(settings, 'SIMPLE_JWT_ADMIN') else settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"]

        response.set_cookie(
            key=access_name,
            value=access_token,
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            domain=None,
            path="/api",
            **cookie_settings,
        )
        response.set_cookie(
            key=refresh_name,
            value=refresh_token,
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            domain=None,
            path="/api",
            **cookie_settings,
        )
        return response
    
    @staticmethod
    def clear_all_auth_cookies(response: Response) -> Response:
        """
        Clear all authentication cookies (POS, admin, customer).
        Uses multiple approaches to ensure cookies are deleted across all browsers.
        """
        # Cookie names from settings
        access_cookie = settings.SIMPLE_JWT["AUTH_COOKIE"]
        refresh_cookie = settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"]
        
        # Get base cookie settings for clearing
        secure = getattr(settings, 'SESSION_COOKIE_SECURE', not settings.DEBUG)
        samesite = getattr(settings, 'SESSION_COOKIE_SAMESITE', 'Lax')
        
        # Clear cookies with multiple combinations to ensure deletion
        admin_access = getattr(settings, 'SIMPLE_JWT_ADMIN', {}).get('AUTH_COOKIE', f"{access_cookie}_admin")
        admin_refresh = getattr(settings, 'SIMPLE_JWT_ADMIN', {}).get('AUTH_COOKIE_REFRESH', f"{refresh_cookie}_admin")

        paths_and_cookies = [
            # POS cookies (path /)
            ("/", access_cookie),
            ("/", refresh_cookie),
            # Admin cookies (path /api)  
            ("/api", admin_access),
            ("/api", admin_refresh),
            # Customer cookies (path /)
            ("/", f"{access_cookie}_customer"),
            ("/", f"{refresh_cookie}_customer"),
        ]
        
        for path, cookie_name in paths_and_cookies:
            # Method 1: Standard clearing with all attributes
            response.set_cookie(
                key=cookie_name,
                value="",
                max_age=0,
                path=path,
                domain=None,
                secure=secure,
                samesite=samesite,
                httponly=True
            )
            
            # Method 2: Clear without httponly (some browsers need this)
            response.set_cookie(
                key=cookie_name,
                value="",
                max_age=0,
                path=path,
                domain=None,
                secure=secure,
                samesite=samesite,
                httponly=False
            )
            
            # Method 3: Clear with minimal attributes
            response.set_cookie(
                key=cookie_name,
                value="",
                max_age=0,
                path=path
            )
        
        # Also clear Django session cookies that might be keeping user logged in
        response.set_cookie(
            key=settings.SESSION_COOKIE_NAME,  # Usually 'sessionid'
            value="",
            max_age=0,
            path="/",
            domain=None,
            secure=secure,
            samesite=samesite,
            httponly=True
        )
        
        # Clear CSRF token cookie as well
        response.set_cookie(
            key=settings.CSRF_COOKIE_NAME,  # Usually 'csrftoken'  
            value="",
            max_age=0,
            path="/",
            domain=None
        )
        
        return response
    
    @staticmethod
    def perform_complete_logout(request, response: Response) -> Response:
        """
        Perform complete logout including token blacklisting and cookie clearing.
        Extracted from LogoutView to centralize logout logic.
        """
        # Try to blacklist all possible refresh tokens
        refresh_token_keys = [
            # Admin refresh token (admin-specific name)
            getattr(settings, 'SIMPLE_JWT_ADMIN', {}).get('AUTH_COOKIE_REFRESH', None),
            # POS refresh token (base name)
            settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            # Customer refresh token
            f"{settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']}_customer",
        ]

        for token_key in refresh_token_keys:
            try:
                if not token_key:
                    continue
                refresh_token = request.COOKIES.get(token_key)
                if refresh_token:
                    token = RefreshToken(refresh_token)
                    token.blacklist()
            except (TokenError, Exception):
                # Token might be invalid or already blacklisted, which is fine
                continue
        
        # Clear all authentication cookies
        AuthCookieService.clear_all_auth_cookies(response)
        
        # Also call Django's logout to clear any residual session data
        logout(request)
        
        return response
    
    @staticmethod
    def refresh_admin_token(request) -> dict:
        """
        Refresh admin/web token using cookie-based refresh token.
        Extracted from WebTokenRefreshView logic.
        """
        refresh_token = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"])
        if not refresh_token:
            return {
                "success": False,
                "error": "Refresh token not found.",
                "clear_cookies": False
            }
        
        try:
            # Use the token to generate new access token
            old_refresh = RefreshToken(refresh_token)
            new_access = str(old_refresh.access_token)
            
            return {
                "success": True,
                "access_token": new_access,
                "refresh_token": refresh_token,  # Keep same refresh token
                "clear_cookies": False
            }
            
        except TokenError as e:
            return {
                "success": False,
                "error": str(e),
                "clear_cookies": True  # Signal to clear invalid cookies
            }
    
