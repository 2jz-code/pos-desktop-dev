from django.urls import path
from .customer_views import (
    CustomerRegisterView,
    CustomerLoginView,
    CustomerLogoutView,
    CustomerTokenRefreshView,
    CustomerProfileView,
    CustomerChangePasswordView,
    CustomerCurrentUserView,
)

app_name = "customer_auth"

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
] 