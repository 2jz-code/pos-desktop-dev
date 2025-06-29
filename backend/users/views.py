from django.shortcuts import render
from django.utils.dateparse import parse_datetime
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from rest_framework.permissions import IsAuthenticated
from django.http import JsonResponse

from .models import User
from .services import UserService
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
    queryset = User.objects.all().order_by("email")
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter to only show POS staff users (not customers)
        queryset = queryset.filter(is_pos_staff=True)

        # Support for delta sync - filter by modified_since parameter
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    # User model has date_joined, we can use that for sync
                    queryset = queryset.filter(date_joined__gte=modified_since_dt)
            except (ValueError, TypeError):
                # If parsing fails, ignore the parameter
                pass

        return queryset


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, CanEditUserDetails]


class SetPinView(generics.GenericAPIView):
    serializer_class = SetPinSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrHigher]

    def post(self, request, *args, **kwargs):
        user_id = kwargs.get("pk")
        if not user_id:
            return Response(
                {"error": "User ID is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Allow user to change their own PIN or manager+ to change others'
        if not (
            request.user.pk == user.pk
            or request.user.role
            in [User.Role.OWNER, User.Role.ADMIN, User.Role.MANAGER]
        ):
            return Response(
                {"error": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(user, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"message": "PIN updated successfully."}, status=status.HTTP_200_OK
        )


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

        is_secure = True  # FORCE SECURE FOR SAMESITE=NONE
        samesite_policy = "None"  # FORCE SAMESITE=NONE

        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value=tokens["access"],
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            value=tokens["refresh"],
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
        return response


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
        refresh_token = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"])
        if not refresh_token:
            return Response(
                {"error": "Refresh token not found."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        request.data["refresh"] = refresh_token
        try:
            response = super().post(request, *args, **kwargs)
        except (TokenError, InvalidToken) as e:
            # If the refresh token is invalid, clear the cookies
            response = Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
            response.delete_cookie(settings.SIMPLE_JWT["AUTH_COOKIE"], path="/")
            response.delete_cookie(settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"], path="/")
            return response

        if response.status_code == 200:
            access_token = response.data.pop("access")
            new_refresh_token = response.data.pop("refresh", None) or refresh_token

            is_secure = True  # FORCE SECURE FOR SAMESITE=NONE
            samesite_policy = "None"  # FORCE SAMESITE=NONE

            response.set_cookie(
                key=settings.SIMPLE_JWT["AUTH_COOKIE"],
                value=access_token,
                # ...
                path="/",
                httponly=True,
                secure=is_secure,
                samesite=samesite_policy,
            )
            response.set_cookie(
                key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
                value=new_refresh_token,
                # ...
                path="/",
                httponly=True,
                secure=is_secure,
                samesite=samesite_policy,
            )
        return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        # Blacklist the refresh token to invalidate it on the server side.
        try:
            refresh_token = request.COOKIES.get(
                settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"]
            )
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            # Token might be invalid or already blacklisted, which is fine.
            pass

        # Prepare a response to send back to the client.
        response = Response(
            {"detail": "Successfully logged out."}, status=status.HTTP_200_OK
        )

        # Forcefully expire the cookies by setting their max_age to 0.
        # This is a more robust method than delete_cookie.
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value="",
            max_age=0,
            path="/",
            samesite="None",
            secure=True,
            httponly=True,
        )
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            value="",
            max_age=0,
            path="/",
            samesite="None",
            secure=True,
            httponly=True,
        )

        # Also call Django's logout to be safe and clear any residual session data.
        logout(request)

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
