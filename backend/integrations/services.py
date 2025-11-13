import logging
from django.conf import settings
from django.core.cache import cache
import requests
from core_backend.infrastructure.cache_utils import cache_static_data

# Set up a logger for this service
logger = logging.getLogger(__name__)


class GeocodingService:
    """
    A service to interact with the Google Geocoding API for converting addresses to coordinates.
    Used to automatically populate latitude/longitude for StoreLocation addresses.
    """

    BASE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

    @staticmethod
    def geocode_address(address_components):
        """
        Converts an address to latitude/longitude coordinates using Google Geocoding API.

        Args:
            address_components (dict): Dictionary with keys:
                - address_line1 (str)
                - address_line2 (str, optional)
                - city (str)
                - state (str)
                - postal_code (str)

        Returns:
            dict: {'latitude': float, 'longitude': float} or {'error': str}
        """
        api_key = settings.GOOGLE_API_KEY

        if not api_key:
            logger.warning("Google API Key is not configured in settings.")
            return {"error": "Google API Key is not configured."}

        # Build full address string
        address_parts = []
        if address_components.get('address_line1'):
            address_parts.append(address_components['address_line1'])
        if address_components.get('address_line2'):
            address_parts.append(address_components['address_line2'])
        if address_components.get('city'):
            address_parts.append(address_components['city'])
        if address_components.get('state'):
            address_parts.append(address_components['state'])
        if address_components.get('postal_code'):
            address_parts.append(address_components['postal_code'])

        if not address_parts:
            logger.warning("No address components provided for geocoding.")
            return {"error": "No address provided."}

        full_address = ', '.join(address_parts)

        params = {
            "address": full_address,
            "key": api_key,
        }

        try:
            logger.info(f"Geocoding address: {full_address}")
            response = requests.get(GeocodingService.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "OK":
                results = data.get("results", [])
                if results:
                    location = results[0].get("geometry", {}).get("location", {})
                    latitude = location.get("lat")
                    longitude = location.get("lng")

                    if latitude is not None and longitude is not None:
                        logger.info(f"Successfully geocoded address to: {latitude}, {longitude}")
                        return {
                            "latitude": latitude,
                            "longitude": longitude
                        }

            error_message = data.get("error_message", f"Geocoding failed with status: {data.get('status')}")
            logger.error(f"Google Geocoding API error: {error_message}")
            return {"error": error_message}

        except requests.exceptions.RequestException as e:
            logger.error(f"HTTP request to Google Geocoding API failed: {e}")
            return {"error": f"Failed to connect to Google Geocoding API: {e}"}
        except Exception as e:
            logger.error(f"An unexpected error occurred while geocoding address: {e}")
            return {"error": f"An unexpected error occurred: {e}"}


class GooglePlacesService:
    """
    A service to interact with the Google Places API, specifically for fetching reviews.
    Enhanced with advanced caching for better performance.
    Now tenant-aware: fetches reviews from each tenant's default StoreLocation.
    """

    BASE_URL = "https://maps.googleapis.com/maps/api/place/details/json"
    CACHE_KEY_PREFIX = "google_reviews_"
    CACHE_TIMEOUT = 3600 * 6  # 6 hours - reviews don't change frequently

    @staticmethod
    def get_reviews(tenant, force_refresh=False):
        """
        Fetches reviews for a tenant's default store location.
        Uses caching to avoid hitting the API on every request.

        Args:
            tenant: Tenant instance to fetch reviews for
            force_refresh (bool): If True, bypass the cache and fetch fresh data.

        Returns:
            A dictionary containing the reviews or an error message.
        """
        from settings.models import StoreLocation

        # Get API key from global settings (shared across all tenants)
        api_key = settings.GOOGLE_API_KEY

        if not api_key:
            logger.warning("Google API Key is not configured in settings.")
            return {"error": "Google API Key is not configured."}

        # Get the first store location with a Google Place ID for this tenant
        try:
            location = StoreLocation.objects.filter(
                tenant=tenant,
                google_place_id__isnull=False
            ).exclude(google_place_id='').first()

            if not location:
                logger.warning(f"No store location with Google Place ID found for tenant: {tenant.slug}")
                return {"error": "Google Place ID not configured for any location. Please contact support."}

            place_id = location.google_place_id

        except Exception as e:
            logger.error(f"Error fetching store location for tenant {tenant.slug}: {str(e)}")
            return {"error": "Error fetching location configuration."}

        # Tenant-scoped cache key
        cache_key = f"{GooglePlacesService.CACHE_KEY_PREFIX}{tenant.id}_{place_id}"

        # Try to get the reviews from the cache
        if not force_refresh:
            cached_reviews = cache.get(cache_key)
            if cached_reviews:
                logger.info(f"Returning cached Google reviews for tenant: {tenant.slug}, Place ID: {place_id}")
                return cached_reviews

        logger.info(f"Fetching fresh Google reviews for tenant: {tenant.slug}, Place ID: {place_id}")

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
    
    @staticmethod
    def get_business_rating_summary(tenant):
        """
        Get cached business rating summary for quick dashboard display.
        Extracts key metrics from full review data.

        Args:
            tenant: Tenant instance to fetch summary for
        """
        try:
            full_reviews = GooglePlacesService.get_reviews(tenant)

            if 'error' in full_reviews:
                return full_reviews

            # Extract summary metrics
            summary = {
                'average_rating': full_reviews.get('rating', 0),
                'total_reviews': full_reviews.get('user_ratings_total', 0),
                'business_name': full_reviews.get('name', 'Unknown Business'),
                'recent_reviews_count': len(full_reviews.get('reviews', [])),
                'rating_distribution': GooglePlacesService._calculate_rating_distribution(
                    full_reviews.get('reviews', [])
                )
            }

            logger.info(f"Generated business rating summary for {tenant.slug}: {summary['average_rating']} stars, {summary['total_reviews']} total reviews")
            return summary

        except Exception as e:
            logger.error(f"Failed to generate business rating summary for {tenant.slug}: {e}")
            return {"error": f"Failed to generate summary: {e}"}
    
    @staticmethod
    def get_recent_reviews_highlights(tenant):
        """
        Get cached highlights from recent reviews for marketing display.

        Args:
            tenant: Tenant instance to fetch highlights for
        """
        try:
            full_reviews = GooglePlacesService.get_reviews(tenant)

            if 'error' in full_reviews:
                return full_reviews

            reviews = full_reviews.get('reviews', [])
            if not reviews:
                return {'highlights': [], 'count': 0}

            # Process recent high-rated reviews for highlights
            highlights = []
            for review in reviews[:5]:  # Top 5 recent reviews
                if review.get('rating', 0) >= 4:  # 4+ star reviews only
                    highlights.append({
                        'author_name': review.get('author_name', 'Anonymous'),
                        'rating': review.get('rating', 0),
                        'text': review.get('text', '')[:200] + '...' if len(review.get('text', '')) > 200 else review.get('text', ''),
                        'time': review.get('time', 0)
                    })

            return {
                'highlights': highlights,
                'count': len(highlights),
                'last_updated': full_reviews.get('last_updated', 'Unknown')
            }

        except Exception as e:
            logger.error(f"Failed to generate review highlights for {tenant.slug}: {e}")
            return {"error": f"Failed to generate highlights: {e}"}
    
    @staticmethod
    def _calculate_rating_distribution(reviews):
        """Calculate distribution of ratings from reviews list"""
        distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        
        for review in reviews:
            rating = review.get('rating', 0)
            if 1 <= rating <= 5:
                distribution[rating] += 1
        
        return distribution
