from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet,
    SetPinView,
    POSLoginView,
    WebLoginView,
    WebTokenRefreshView,
    LogoutView,
    CurrentUserView,
    DebugCookiesView,
)

# Create router for UserViewSet
router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')

app_name = "users"

urlpatterns = [
    # Auth
    path("login/pos/", POSLoginView.as_view(), name="login-pos"),
    path("login/web/", WebLoginView.as_view(), name="login-web"),
    path("token/refresh/", WebTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
    # Debug
    path("debug/cookies/", DebugCookiesView.as_view(), name="debug-cookies"),
    # User Management - ViewSet routes
    path("", include(router.urls)),
    # Legacy set-pin endpoint (can be moved to ViewSet action later if needed)
    path("users/<int:pk>/set-pin/", SetPinView.as_view(), name="set-pin"),
]
