"""
Customer app URL configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerRegisterView,
    CustomerLoginView,
    CustomerLogoutView,
    CustomerTokenRefreshView,
    CustomerProfileView,
    CustomerChangePasswordView,
    CustomerCurrentUserView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    EmailVerificationRequestView,
    EmailVerificationConfirmView,
)
from .google_oauth_views import (
    GoogleOAuthLoginView,
    GoogleOAuthLinkView,
)
from .order_views import CustomerOrderViewSet

# Create router for customer order endpoints
router = DefaultRouter()
router.register(r'orders', CustomerOrderViewSet, basename='customer-orders')

app_name = "customers"

urlpatterns = [
    # Authentication endpoints
    path("register/", CustomerRegisterView.as_view(), name="register"),
    path("login/", CustomerLoginView.as_view(), name="login"),
    path("logout/", CustomerLogoutView.as_view(), name="logout"),
    path("token/refresh/", CustomerTokenRefreshView.as_view(), name="token_refresh"),
    
    # Profile management endpoints  
    path("profile/", CustomerProfileView.as_view(), name="profile"),
    path("current-user/", CustomerCurrentUserView.as_view(), name="current_user"),
    path("change-password/", CustomerChangePasswordView.as_view(), name="change_password"),
    
    # Password reset endpoints
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="password_reset_request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
    
    # Email verification endpoints
    path("email-verification/request/", EmailVerificationRequestView.as_view(), name="email_verification_request"),
    path("email-verification/confirm/", EmailVerificationConfirmView.as_view(), name="email_verification_confirm"),
    
    # Google OAuth endpoints
    path("oauth/google/login/", GoogleOAuthLoginView.as_view(), name="google_oauth_login"),
    path("oauth/google/link/", GoogleOAuthLinkView.as_view(), name="google_oauth_link"),
    
    # Customer order endpoints
    path("", include(router.urls)),
]