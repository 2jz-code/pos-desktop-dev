from django.urls import path
from .views import GoogleReviewsView

app_name = "integrations"

urlpatterns = [
    path(
        "google-reviews/",
        GoogleReviewsView.as_view(),
        name="google-reviews",
    ),
]
