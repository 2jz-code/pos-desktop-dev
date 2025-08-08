from django.urls import path
from .views import (
    UserRegisterView,
    UserListView,
    UserDetailView,
    SetPinView,
    POSLoginView,
    WebLoginView,
    WebTokenRefreshView,
    LogoutView,
    CurrentUserView,
    GenerateAPIKeyView,
    RevokeAPIKeyView,
    APIKeyStatusView,
    DebugCookiesView,
)

app_name = "users"

urlpatterns = [
    # Auth
    path("login/pos/", POSLoginView.as_view(), name="login-pos"),
    path("login/web/", WebLoginView.as_view(), name="login-web"),
    path("token/refresh/", WebTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
    # API Keys
    path("api-key/generate/", GenerateAPIKeyView.as_view(), name="generate-api-key"),
    path("api-key/revoke/", RevokeAPIKeyView.as_view(), name="revoke-api-key"),
    path("api-key/status/", APIKeyStatusView.as_view(), name="api-key-status"),
    # Debug
    path("debug/cookies/", DebugCookiesView.as_view(), name="debug-cookies"),
    # User Management
    path("register/", UserRegisterView.as_view(), name="register"),
    path("", UserListView.as_view(), name="list"),
    path("<int:pk>/", UserDetailView.as_view(), name="detail"),
    path("<int:pk>/set-pin/", SetPinView.as_view(), name="set-pin"),
]
