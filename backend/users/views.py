from django.shortcuts import render
# Removed: from django.utils.dateparse import parse_datetime (moved to service)
from rest_framework import generics, permissions, status
from core_backend.base import BaseViewSet
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from rest_framework.permissions import IsAuthenticated
from django.http import JsonResponse
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator

from .models import User
from .services import UserService
from .auth_cookie_service import AuthCookieService
from .serializers import (
    UserSerializer,
    UserRegistrationSerializer,
    SetPinSerializer,
    POSLoginSerializer,
    WebLoginSerializer,
    WebTokenRefreshSerializer,
)
from .permissions import (
    IsManagerOrHigher,
    IsAdminOrHigher,
    IsOwner,
    CanEditUserDetails,
)

# Create your views here.

class UserRegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrHigher]

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Extract filtering logic to service
        filters = dict(self.request.query_params)
        return UserService.get_filtered_users(filters)

class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, CanEditUserDetails]

class SetPinView(generics.GenericAPIView):
    serializer_class = SetPinSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrHigher]

    def post(self, request, *args, **kwargs):
        user_id = kwargs.get("pk")
        pin = request.data.get("pin")
        
        result = UserService.set_user_pin(user_id, pin, request.user)
        
        if result["success"]:
            return Response(result, status=status.HTTP_200_OK)
        else:
            # Determine appropriate status code based on error
            if "not found" in result["error"]:
                status_code = status.HTTP_404_NOT_FOUND
            elif "permission" in result["error"]:
                status_code = status.HTTP_403_FORBIDDEN
            else:
                status_code = status.HTTP_400_BAD_REQUEST
                
            return Response(result, status=status_code)

@method_decorator(ratelimit(key='ip', rate='5/m', method='POST', block=True), name='post')
class POSLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = POSLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = UserService.authenticate_pos_user(**serializer.validated_data)

        if not user:
            return Response(
                {"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED
            )

        tokens = UserService.generate_tokens_for_user(user)
        response = Response({"user": UserSerializer(user).data})
        
        # Use centralized cookie service for consistent cookie handling
        AuthCookieService.set_pos_auth_cookies(response, tokens["access"], tokens["refresh"])
        
        return response

@method_decorator(ratelimit(key='ip', rate='5/m', method='POST', block=True), name='post')
class WebLoginView(TokenObtainPairView):
    serializer_class = WebLoginSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and "access" in response.data:
            access_token = response.data.pop("access")
            refresh_token = response.data.pop("refresh")
            UserService.set_auth_cookies(response, access_token, refresh_token)
        return response

class WebTokenRefreshView(TokenRefreshView):
    serializer_class = WebTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        result = AuthCookieService.refresh_admin_token(request)
        
        if not result["success"]:
            response = Response(
                {"error": result["error"]},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            
            if result["clear_cookies"]:
                # Clear invalid cookies
                AuthCookieService.clear_all_auth_cookies(response)
            
            return response

        # Set new tokens in cookies
        response = Response({"message": "Token refreshed successfully"})
        AuthCookieService.set_admin_auth_cookies(
            response, 
            result["access_token"], 
            result["refresh_token"]
        )
        
        return response

class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        response = Response(
            {"detail": "Successfully logged out."}, status=status.HTTP_200_OK
        )
        
        # Use centralized service for complete logout logic
        AuthCookieService.perform_complete_logout(request, response)
        
        return response

class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

class GenerateAPIKeyView(APIView):
    """Generate a new API key for the authenticated user"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        api_key = request.user.generate_api_key()
        return Response(
            {
                "api_key": api_key,
                "message": "API key generated successfully. Store this safely - it won't be shown again.",
            }
        )

class RevokeAPIKeyView(APIView):
    """Revoke the current API key for the authenticated user"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request.user.revoke_api_key()
        return Response({"message": "API key revoked successfully."})

class APIKeyStatusView(APIView):
    """Check if the user has an API key (without revealing it)"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        has_api_key = bool(request.user.api_key)
        return Response({"has_api_key": has_api_key})
