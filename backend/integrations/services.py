import logging
from django.conf import settings
from django.core.cache import cache
import requests

# Set up a logger for this service
logger = logging.getLogger(__name__)


class GooglePlacesService:
    """
    A service to interact with the Google Places API, specifically for fetching reviews.
    """

    BASE_URL = "https://maps.googleapis.com/maps/api/place/details/json"
    CACHE_KEY_PREFIX = "google_reviews_"
    CACHE_TIMEOUT = 3600  # 1 hour in seconds

    @staticmethod
    def get_reviews(force_refresh=False):
        """
        Fetches reviews for the configured Google Place ID.
        Uses caching to avoid hitting the API on every request.

        Args:
            force_refresh (bool): If True, bypass the cache and fetch fresh data.

        Returns:
            A dictionary containing the reviews or an error message.
        """
        api_key = settings.GOOGLE_API_KEY
        place_id = settings.GOOGLE_PLACE_ID

        if not api_key or not place_id:
            logger.warning("Google API Key or Place ID is not configured in settings.")
            return {"error": "Google API Key or Place ID is not configured."}

        cache_key = f"{GooglePlacesService.CACHE_KEY_PREFIX}{place_id}"

        # Try to get the reviews from the cache
        if not force_refresh:
            cached_reviews = cache.get(cache_key)
            if cached_reviews:
                logger.info(f"Returning cached Google reviews for Place ID: {place_id}")
                return cached_reviews

        logger.info(f"Fetching fresh Google reviews for Place ID: {place_id}")

        params = {
            "place_id": place_id,
            "fields": "name,rating,reviews,user_ratings_total",
            "key": api_key,
        }

        try:
            response = requests.get(GooglePlacesService.BASE_URL, params=params)
            response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
            data = response.json()

            if data.get("status") == "OK":
                result = data.get("result", {})
                # Cache the successful result
                cache.set(cache_key, result, GooglePlacesService.CACHE_TIMEOUT)
                return result
            else:
                error_message = data.get(
                    "error_message",
                    "An unknown error occurred with the Google Places API.",
                )
                logger.error(
                    f"Google Places API error: {data.get('status')} - {error_message}"
                )
                return {"error": error_message}

        except requests.exceptions.RequestException as e:
            logger.error(f"HTTP request to Google Places API failed: {e}")
            return {"error": f"Failed to connect to Google Places API: {e}"}
        except Exception as e:
            logger.error(
                f"An unexpected error occurred while fetching Google reviews: {e}"
            )
            return {"error": f"An unexpected error occurred: {e}"}
