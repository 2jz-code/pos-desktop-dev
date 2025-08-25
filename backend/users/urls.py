from django.urls import path
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

# No router needed - using explicit path mapping like products app

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
    
    # User Management - Explicit ViewSet actions (following products app pattern)
    path("", UserViewSet.as_view({'get': 'list', 'post': 'create'}), name="user-list"),
    path("<int:pk>/", UserViewSet.as_view({
        'get': 'retrieve', 
        'put': 'update', 
        'patch': 'partial_update', 
        'delete': 'destroy'
    }), name="user-detail"),
    
    # Archive actions (explicit mapping like products app)
    path("<int:pk>/archive/", UserViewSet.as_view({'post': 'archive'}), name="user-archive"),
    path("<int:pk>/unarchive/", UserViewSet.as_view({'post': 'unarchive'}), name="user-unarchive"),
    path("bulk_archive/", UserViewSet.as_view({'post': 'bulk_archive'}), name="user-bulk-archive"),
    path("bulk_unarchive/", UserViewSet.as_view({'post': 'bulk_unarchive'}), name="user-bulk-unarchive"),
    
    # Legacy set-pin endpoint (keeping for compatibility)
    path("<int:pk>/set-pin/", SetPinView.as_view(), name="set-pin"),
]
