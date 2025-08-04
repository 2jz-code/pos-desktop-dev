import logging
from django.conf import settings
from django.core.cache import cache
import requests
from core_backend.infrastructure.cache_utils import cache_static_data

# Set up a logger for this service
logger = logging.getLogger(__name__)


class GooglePlacesService:
    """
    A service to interact with the Google Places API, specifically for fetching reviews.
    Enhanced with advanced caching for better performance.
    """

    BASE_URL = "https://maps.googleapis.com/maps/api/place/details/json"
    CACHE_KEY_PREFIX = "google_reviews_"
    CACHE_TIMEOUT = 3600 * 6  # 6 hours - reviews don't change frequently

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
    
    @staticmethod
    @cache_static_data(timeout=3600*8)  # 8 hours - summary data changes even less frequently
    def get_business_rating_summary():
        """
        Get cached business rating summary for quick dashboard display.
        Extracts key metrics from full review data.
        """
        try:
            full_reviews = GooglePlacesService.get_reviews()
            
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
            
            logger.info(f"Generated business rating summary: {summary['average_rating']} stars, {summary['total_reviews']} total reviews")
            return summary
            
        except Exception as e:
            logger.error(f"Failed to generate business rating summary: {e}")
            return {"error": f"Failed to generate summary: {e}"}
    
    @staticmethod
    @cache_static_data(timeout=3600*12)  # 12 hours - processed reviews change rarely
    def get_recent_reviews_highlights():
        """
        Get cached highlights from recent reviews for marketing display.
        """
        try:
            full_reviews = GooglePlacesService.get_reviews()
            
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
            logger.error(f"Failed to generate review highlights: {e}")
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
