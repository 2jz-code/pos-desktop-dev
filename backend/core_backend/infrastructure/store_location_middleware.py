from django.utils.deprecation import MiddlewareMixin
import logging

logger = logging.getLogger(__name__)


class StoreLocationMiddleware(MiddlewareMixin):
    """
    Middleware to extract store location from request headers and attach to request object.

    This middleware looks for the X-Store-Location header (set by the frontend LocationContext)
    and attaches the store_location_id to the request object for easy access throughout the backend.

    Usage in views/services:
        store_location_id = getattr(request, 'store_location_id', None)

    Frontend sets header via axios interceptor:
        headers: { 'X-Store-Location': selectedLocationId }
    """

    def process_request(self, request):
        """Extract store location from X-Store-Location header and attach to request."""
        # Extract store location ID from header
        store_location_id = request.META.get('HTTP_X_STORE_LOCATION')

        # Convert to integer if present, otherwise None
        if store_location_id:
            try:
                request.store_location_id = int(store_location_id)
                logger.debug(f"Store location extracted from header: {request.store_location_id}")
            except (ValueError, TypeError):
                logger.warning(f"Invalid store location ID in header: {store_location_id}")
                request.store_location_id = None
        else:
            # No header present - this is valid for "All Locations" view
            request.store_location_id = None

        return None
