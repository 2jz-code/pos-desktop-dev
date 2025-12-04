from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings


class CSRFApiMiddleware(MiddlewareMixin):
    """
    Enforce CSRF protections globally for API unsafe methods.

    - Scope: paths starting with /api/
    - Skips: OPTIONS, and a small whitelist (health check, CSRF issue endpoint)
    - Guards:
      * Header guard (X-Requested-With or X-CSRF-Token) when ENABLE_CSRF_HEADER_CHECK=True
      * Double-submit (X-CSRF-Token must match csrf_token cookie) when ENABLE_DOUBLE_SUBMIT_CSRF=True
    """

    WHITELIST_PATHS = (
        "/api/health/",
        "/api/security/csrf/",
        "/api/payments/webhooks/",
        "/api/sync/",  # Device signature auth (HMAC), not cookie-based
    )

    def process_request(self, request):
        try:
            path = request.path
            method = request.method.upper()

            # Only enforce for API unsafe methods
            if not path.startswith("/api/"):
                return None
            if method in ("GET", "HEAD", "OPTIONS"):
                return None
            if any(path.startswith(p) for p in self.WHITELIST_PATHS):
                return None

            # Header guard
            if getattr(settings, "ENABLE_CSRF_HEADER_CHECK", False):
                token = request.headers.get("X-CSRF-Token")
                xrw = request.headers.get("X-Requested-With", "").lower()
                if not (token or xrw == "xmlhttprequest"):
                    return JsonResponse(
                        {"detail": "CSRF header missing"}, status=403
                    )

            # Double-submit guard
            if getattr(settings, "ENABLE_DOUBLE_SUBMIT_CSRF", False):
                header_token = request.headers.get("X-CSRF-Token") or request.headers.get(
                    "X-CSRFToken"
                )
                cookie_token = request.COOKIES.get("csrf_token")
                if not (header_token and cookie_token and header_token == cookie_token):
                    return JsonResponse(
                        {"detail": "CSRF token invalid or missing"}, status=403
                    )

        except Exception:
            # Fail-open to avoid taking down the API due to middleware error
            return None

        return None
