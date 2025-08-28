from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from settings.models import GlobalSettings
from business_hours.models import BusinessHoursProfile
from business_hours.services import BusinessHoursService
import logging

logger = logging.getLogger(__name__)


class BusinessHoursMiddleware(MiddlewareMixin):
    """
    Intelligent business hours enforcement middleware.

    Strategy:
    - Block ONLY specific online order endpoints during closed hours
    - Allow ALL POS/in-person operations (owners can take late orders)
    - Allow ALL read operations and management tasks regardless of hours
    - Allow ALL product/inventory/payment management operations

    This primarily protects against online orders from website during closed hours
    while keeping full POS functionality available for business owners.
    """

    # Specific endpoints blocked during closed hours (primarily online/external orders)
    RESTRICTED_ENDPOINTS = [
        # Online order creation endpoints
        "/api/orders/online/",  # Future online order endpoint
        "/api/orders/website/",  # Future website order endpoint
        "/api/orders/external/",  # Future external order endpoint
        "/api/orders/public/",  # Future public order endpoint
        "/api/orders/guest-order/",  # Guest order creation (when from external sources)
        # Add more online-specific endpoints here as needed
    ]

    # Headers that indicate requests from customer website/external sources
    EXTERNAL_REQUEST_INDICATORS = [
        "customer-app",  # Custom header from customer website
        "online-ordering",  # Custom header for online orders
        "website-order",  # Custom header for website orders
    ]

    def process_request(self, request):
        # Skip business hours check for certain conditions
        if self._should_skip_check(request):
            return None

        # Only check specific endpoints and external requests during closed hours
        if not self._should_restrict_request(request):
            return None

        # Check if business is currently open using new BusinessHoursService
        try:
            service = BusinessHoursService.get_default_service()
            if not service.is_open():
                return self._business_closed_response(service)
        except BusinessHoursProfile.DoesNotExist:
            # If no business hours profile exists, fall back to old GlobalSettings
            try:
                settings = GlobalSettings.objects.get(pk=1)
                if not settings.is_business_open():
                    return self._business_closed_response_legacy(settings)
            except GlobalSettings.DoesNotExist:
                # If neither exist, allow access (setup mode)
                logger.warning("No business hours configuration found - allowing access")
                return None
        except Exception as e:
            # If check fails, log error but allow access
            logger.error(f"Business hours check failed: {e}")
            return None

        return None

    def _should_skip_check(self, request):
        """Determine if business hours check should be skipped."""
        # Skip for authenticated users (staff/owners can work anytime)
        if hasattr(request, "user") and request.user.is_authenticated:
            return True

        # Skip for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return True

        # Skip for static files and admin
        if (
            request.path.startswith("/static/")
            or request.path.startswith("/media/")
            or request.path.startswith("/admin/")
        ):
            return True

        return False

    def _should_restrict_request(self, request):
        """
        Determine if this specific request should be restricted during closed hours.

        Returns True only for:
        1. Specific online/external order endpoints
        2. Requests with headers indicating external/customer origin
        3. POST requests to order creation that seem to be from external sources
        """
        path = request.path

        # Check for specific restricted endpoints
        for restricted_endpoint in self.RESTRICTED_ENDPOINTS:
            if path.startswith(restricted_endpoint):
                return True

        # Check for external request indicators in headers
        for indicator in self.EXTERNAL_REQUEST_INDICATORS:
            if request.META.get(f'HTTP_{indicator.upper().replace("-", "_")}'):
                return True

        # For now, we're being very conservative - only block explicitly restricted endpoints
        # This ensures POS functionality remains fully available

        return False

    def _business_closed_response(self, service):
        """Return an enhanced JSON response indicating business is closed using BusinessHoursService."""
        try:
            # Get comprehensive status summary
            summary = service.get_status_summary()
            
            # Get store name from GlobalSettings if available
            store_name = "Store"
            try:
                settings = GlobalSettings.objects.get(pk=1)
                store_name = settings.store_name
            except GlobalSettings.DoesNotExist:
                pass
            
            # Get today's hours for additional context
            today_hours = summary.get('today_hours', {})
            
            response_data = {
                "error": "BUSINESS_CLOSED",
                "message": "The business is currently closed.",
                "current_time": summary.get('current_time'),
                "timezone": summary.get('timezone'),
                "store_name": store_name,
                "today_hours": today_hours,
            }
            
            # Add next opening time if available
            next_opening = summary.get('next_opening')
            if next_opening:
                response_data["next_opening"] = next_opening
                response_data["message"] = f"The business is currently closed. We'll be open next at {next_opening}."
            
            # Add reason if it's a special closure
            if today_hours.get('reason'):
                response_data["closure_reason"] = today_hours['reason']
                response_data["message"] = f"The business is currently closed due to {today_hours['reason']}."
            
            return JsonResponse(response_data, status=503)  # Service Unavailable
            
        except Exception as e:
            logger.error(f"Error generating enhanced business closed response: {e}")
            # Fallback to simple response
            return JsonResponse(
                {
                    "error": "BUSINESS_CLOSED",
                    "message": "The business is currently closed.",
                },
                status=503,
            )
    
    def _business_closed_response_legacy(self, settings):
        """Legacy fallback response using GlobalSettings (for backward compatibility)."""
        return JsonResponse(
            {
                "error": "BUSINESS_CLOSED",
                "message": "The business is currently closed.",
                "business_hours": {
                    "opening_time": (
                        settings.opening_time.strftime("%H:%M")
                        if settings.opening_time
                        else None
                    ),
                    "closing_time": (
                        settings.closing_time.strftime("%H:%M")
                        if settings.closing_time
                        else None
                    ),
                    "timezone": settings.timezone,
                },
                "store_name": settings.store_name,
            },
            status=503,
        )  # Service Unavailable
