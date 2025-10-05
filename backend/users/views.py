from django.shortcuts import render

# Removed: from django.utils.dateparse import parse_datetime (moved to service)
from rest_framework import generics, permissions, status, viewsets
from core_backend.base.viewsets import BaseViewSet
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from rest_framework.permissions import IsAuthenticated
from django.http import JsonResponse
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator
from django.core.cache import cache

from .models import User
from .services import UserService
from core_backend.auth.cookies import AuthCookieService
from .serializers import (
    UserSerializer,
    UserRegistrationSerializer,
    SetPinSerializer,
    POSLoginSerializer,
    AdminLoginSerializer,
    TenantSelectionSerializer,
    WebLoginSerializer,
    WebTokenRefreshSerializer,
)
from .permissions import (
    IsManagerOrHigher,
    IsAdminOrHigher,
    IsOwner,
    CanEditUserDetails,
    RequiresAntiCSRFHeader,
    DoubleSubmitCSRFPremission,
)

# Create your views here.


class UserViewSet(BaseViewSet):
    """
    ViewSet for managing users with archive/unarchive functionality.
    Inherits from BaseViewSet which provides:
    - Archive/unarchive actions
    - ?include_archived query parameter support
    - Automatic soft delete instead of hard delete
    """

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, CanEditUserDetails]

    # Search and filter configuration
    search_fields = ["email", "first_name", "last_name", "username"]
    filterset_fields = ["role", "is_pos_staff", "is_active"]
    ordering_fields = ["email", "first_name", "last_name", "date_joined", "role"]
    ordering = ["-date_joined"]

    def get_queryset(self):
        """
        Custom queryset with filtering logic from UserService.
        """
        queryset = super().get_queryset()

        # Apply additional filtering via service if needed
        filters = dict(self.request.query_params)
        return UserService.get_filtered_users(filters, base_queryset=queryset)

    def get_permissions(self):
        """
        Different permissions for different actions.
        """
        if self.action == "create":
            # User creation requires manager or higher
            permission_classes = [permissions.IsAuthenticated, IsManagerOrHigher]
        elif self.action in ["list", "retrieve"]:
            # Restrict list/retrieve to manager or higher
            permission_classes = [permissions.IsAuthenticated, IsManagerOrHigher]
        elif self.action in ["archive", "unarchive", "bulk_archive", "bulk_unarchive"]:
            # Archive actions require manager or higher
            permission_classes = [permissions.IsAuthenticated, IsManagerOrHigher]
        else:
            permission_classes = self.permission_classes

        # For unsafe methods, enforce CSRF protections
        if self.request and self.request.method not in permissions.SAFE_METHODS:
            # Append CSRF header guard and double-submit validator
            permission_classes = list(permission_classes) + [
                RequiresAntiCSRFHeader,
                DoubleSubmitCSRFPremission,
            ]

        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        """
        Use different serializers for different actions.
        """
        if self.action == "create":
            return UserRegistrationSerializer
        return self.serializer_class

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[
            IsAuthenticated,
            IsManagerOrHigher,
            RequiresAntiCSRFHeader,
            DoubleSubmitCSRFPremission,
        ],
    )
    def set_pin(self, request, pk=None):
        """
        Set PIN for a user.
        """
        user = self.get_object()
        pin = request.data.get("pin")

        try:
            result = UserService.set_user_pin(user.id, pin, request.user)
            return Response(result, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)


class SetPinView(generics.GenericAPIView):
    serializer_class = SetPinSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        IsManagerOrHigher,
        RequiresAntiCSRFHeader,
        DoubleSubmitCSRFPremission,
    ]

    def post(self, request, *args, **kwargs):
        user_id = kwargs.get("pk")
        pin = request.data.get("pin")

        try:
            result = UserService.set_user_pin(user_id, pin, request.user)
            return Response(result, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)


@method_decorator(
    ratelimit(key="ip", rate="5/m", method="POST", block=True), name="post"
)
class POSLoginView(APIView):
    permission_classes = [
        permissions.AllowAny,
        RequiresAntiCSRFHeader,
        DoubleSubmitCSRFPremission,
    ]

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
        AuthCookieService.set_pos_auth_cookies(
            response, tokens["access"], tokens["refresh"]
        )

        return response


@method_decorator(
    ratelimit(key="ip", rate="5/m", method="POST", block=True), name="post"
)
class AdminLoginView(APIView):
    """
    Email-first admin login with automatic tenant discovery.

    Flow:
    1. User provides email + password
    2. Backend searches ALL tenants for matching admin/manager/owner users
    3. If single tenant: auto-login with tokens
    4. If multiple tenants: return tenant picker list
    5. Frontend shows tenant picker if needed, then calls TenantSelectionView
    """
    permission_classes = [
        permissions.AllowAny,
        RequiresAntiCSRFHeader,
        DoubleSubmitCSRFPremission,
    ]

    def post(self, request, *args, **kwargs):
        serializer = AdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = UserService.authenticate_admin_user(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"]
        )

        if result is None:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Multiple tenants - return tenant picker
        if isinstance(result, dict) and result.get("multiple_tenants"):
            return Response({
                "multiple_tenants": True,
                "tenants": result["tenants"]
            }, status=status.HTTP_200_OK)

        # Single tenant - auto-login
        user = result
        tokens = UserService.generate_tokens_for_user(user)

        response = Response({
            "user": UserSerializer(user).data,
            "tenant": {
                "id": str(user.tenant.id),
                "name": user.tenant.name,
                "slug": user.tenant.slug,
            }
        })

        # Set auth cookies for admin
        # Tenant context is now in JWT claims - no session needed
        AuthCookieService.set_admin_auth_cookies(
            response, tokens["access"], tokens["refresh"]
        )

        return response


@method_decorator(
    ratelimit(key="ip", rate="5/m", method="POST", block=True), name="post"
)
class TenantSelectionView(APIView):
    """
    Handle tenant selection when user belongs to multiple tenants.

    Called after AdminLoginView returns multiple_tenants response.
    User selects a tenant from the picker and this endpoint authenticates
    them with that specific tenant context.
    """
    permission_classes = [
        permissions.AllowAny,
        RequiresAntiCSRFHeader,
        DoubleSubmitCSRFPremission,
    ]

    def post(self, request, *args, **kwargs):
        serializer = TenantSelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Re-authenticate to verify credentials and get user for selected tenant
        result = UserService.authenticate_admin_user(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"]
        )

        if result is None:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Extract tenant_id from request
        selected_tenant_id = serializer.validated_data["tenant_id"]

        # If single tenant, just return it (shouldn't happen, but handle gracefully)
        if isinstance(result, User):
            if str(result.tenant.id) == selected_tenant_id:
                user = result
            else:
                return Response(
                    {"error": "Selected tenant does not match user's tenant"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            # Multiple tenants - find the selected one
            tenants_data = result.get("tenants", [])
            selected_user = None

            for tenant_data in tenants_data:
                if tenant_data["tenant_id"] == selected_tenant_id:
                    # Get the actual user object for this tenant
                    try:
                        selected_user = User.all_objects.get(
                            id=tenant_data["user_id"],
                            tenant_id=selected_tenant_id
                        )
                        break
                    except User.DoesNotExist:
                        pass

            if selected_user is None:
                return Response(
                    {"error": "Invalid tenant selection"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            user = selected_user

        # Generate tokens and return user data
        tokens = UserService.generate_tokens_for_user(user)

        response = Response({
            "user": UserSerializer(user).data,
            "tenant": {
                "id": str(user.tenant.id),
                "name": user.tenant.name,
                "slug": user.tenant.slug,
            }
        })

        # Set auth cookies for admin
        # Tenant context is now in JWT claims - no session needed
        AuthCookieService.set_admin_auth_cookies(
            response, tokens["access"], tokens["refresh"]
        )

        return response


@method_decorator(
    ratelimit(key="ip", rate="5/m", method="POST", block=True), name="post"
)
class WebLoginView(TokenObtainPairView):
    serializer_class = WebLoginSerializer
    permission_classes = [
        permissions.AllowAny,
        RequiresAntiCSRFHeader,
        DoubleSubmitCSRFPremission,
    ]

    @method_decorator(
        ratelimit(key="ip", rate="5/m", method="POST", block=False), name="post"
    )
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request, *args, **kwargs):
        # Account-based lockout (web admin login only)
        # Accept either 'email' (expected) or 'username' (fallback) from clients
        ident_value = request.data.get("email") or request.data.get("username") or ""
        email = ident_value.strip().lower()
        threshold = getattr(settings, "ADMIN_LOCKOUT_THRESHOLD", 5)
        window_s = int(getattr(settings, "ADMIN_LOCKOUT_WINDOW", 15 * 60))
        lock_s = int(getattr(settings, "ADMIN_LOCKOUT_DURATION", 15 * 60))

        def fail_key(e):
            return f"web_login_fail:{e}"

        def lock_key(e):
            return f"web_login_lock:{e}"

        # Pre-check lock without incrementing failures
        if email and cache.get(lock_key(email)):
            return Response(
                {"error": "Account temporarily locked. Try again later."},
                status=status.HTTP_423_LOCKED,
            )

        # Proceed with authentication
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200 and "access" in response.data:
            # Success: clear counters/lock and set cookies
            if email:
                cache.delete_many([fail_key(email), lock_key(email)])
            access_token = response.data.pop("access")
            refresh_token = response.data.pop("refresh")
            AuthCookieService.set_admin_auth_cookies(
                response, access_token, refresh_token
            )
            return response

        # Failure: increment failure counter and possibly lock; return generic error
        if email and not cache.get(lock_key(email)):
            current = (cache.get(fail_key(email)) or 0) + 1
            cache.set(fail_key(email), current, timeout=window_s)
            if current >= threshold:
                cache.set(lock_key(email), True, timeout=lock_s)

        # Replace body with generic message to avoid enumeration
        return Response(
            {"error": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED
        )


class WebTokenRefreshView(TokenRefreshView):
    serializer_class = WebTokenRefreshSerializer
    permission_classes = [
        permissions.AllowAny,
        RequiresAntiCSRFHeader,
        DoubleSubmitCSRFPremission,
    ]

    def post(self, request, *args, **kwargs):
        # Rotate refresh using SimpleJWT's TokenRefreshSerializer
        from rest_framework_simplejwt.serializers import TokenRefreshSerializer

        # Prefer admin refresh cookie; fallback to POS base name for compatibility
        admin_refresh_name = getattr(settings, "SIMPLE_JWT_ADMIN", {}).get(
            "AUTH_COOKIE_REFRESH"
        )
        refresh_cookie = None
        if admin_refresh_name:
            refresh_cookie = request.COOKIES.get(admin_refresh_name)
        if not refresh_cookie:
            refresh_cookie = request.COOKIES.get(
                settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"]
            )  # POS fallback
        if not refresh_cookie:
            return Response(
                {"error": "Refresh token not found."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = TokenRefreshSerializer(data={"refresh": refresh_cookie})
        try:
            serializer.is_valid(raise_exception=True)
        except Exception as e:
            response = Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
            AuthCookieService.clear_all_auth_cookies(response)
            return response

        data = serializer.validated_data
        new_access = data.get("access")
        new_refresh = data.get(
            "refresh", refresh_cookie
        )  # present if ROTATE_REFRESH_TOKENS=True

        response = Response({"message": "Token refreshed successfully"})
        # If we read admin cookie, set admin cookie family; otherwise set POS cookie family
        if admin_refresh_name and request.COOKIES.get(admin_refresh_name):
            AuthCookieService.set_admin_auth_cookies(response, new_access, new_refresh)
        else:
            AuthCookieService.set_pos_auth_cookies(response, new_access, new_refresh)
        return response


class LogoutView(APIView):
    permission_classes = [
        permissions.AllowAny,
        RequiresAntiCSRFHeader,
        DoubleSubmitCSRFPremission,
    ]

    def post(self, request, *args, **kwargs):
        response = Response(
            {"detail": "Successfully logged out."}, status=status.HTTP_200_OK
        )

        # Use centralized service for complete logout logic
        # JWT tokens are invalidated via blacklist, no session to clear
        AuthCookieService.perform_complete_logout(request, response)

        return response


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        serializer = UserSerializer(user)

        # Return user + tenant info (matching login response format)
        return Response({
            "user": serializer.data,
            "tenant": {
                "id": str(user.tenant.id),
                "name": user.tenant.name,
                "slug": user.tenant.slug,
            }
        })


class DebugCookiesView(APIView):
    """Debug endpoint to see what cookies are set"""

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response(
            {
                "cookies": dict(request.COOKIES),
                "headers": dict(request.headers),
                "method": request.method,
                "path": request.path,
            }
        )
