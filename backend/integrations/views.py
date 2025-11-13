from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from .services import GooglePlacesService


class GoogleReviewsView(APIView):
    """
    An API view to fetch Google reviews for the business.
    This endpoint is cached to reduce redundant calls to the Google API.
    Now tenant-aware: fetches reviews for the requesting tenant's default location.
    """

    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        """
        Handles GET requests to fetch the reviews.
        A 'force_refresh' query parameter can be used to bypass the cache.
        """
        # Extract tenant from request (set by middleware from subdomain)
        if not hasattr(request, 'tenant') or not request.tenant:
            return Response(
                {"error": "Unable to determine restaurant. Please access via your restaurant's website."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        force_refresh = (
            request.query_params.get("force_refresh", "false").lower() == "true"
        )

        reviews_data = GooglePlacesService.get_reviews(
            tenant=request.tenant,
            force_refresh=force_refresh
        )

        if "error" in reviews_data:
            return Response(
                {"error": reviews_data["error"]},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(reviews_data)
