from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.conf import settings
from django.http import JsonResponse
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator

from .customer_services import CustomerAuthService
from .authentication import CustomerCookieJWTAuthentication
from .customer_serializers import (
    CustomerRegistrationSerializer,
    CustomerLoginSerializer,
    CustomerProfileSerializer,
    ChangePasswordSerializer,
    CustomerTokenRefreshSerializer,
)


@method_decorator(ratelimit(key='ip', rate='5/m', method='POST', block=True), name='post')
class CustomerRegisterView(APIView):
    """
    Register a new customer account.
    No authentication required.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = CustomerRegistrationSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                user = serializer.save()
                
                # Generate tokens for immediate login
                tokens = CustomerAuthService.generate_customer_tokens(user)
                
                # Prepare response data
                response_data = {
                    "message": "Account created successfully",
                    "user": CustomerAuthService.get_customer_profile(user),
                }
                
                response = Response(response_data, status=status.HTTP_201_CREATED)
                
                # Set authentication cookies
                CustomerAuthService.set_customer_auth_cookies(
                    response, tokens["access"], tokens["refresh"]
                )
                
                return response
                
            except ValueError as e:
                # Handle service-level validation errors
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(ratelimit(key='ip', rate='5/m', method='POST', block=True), name='post')
class CustomerLoginView(APIView):
    """
    Login for customer accounts.
    No authentication required.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = CustomerLoginSerializer(data=request.data)
        
        if serializer.is_valid():
            user = serializer.validated_data["user"]
            remember_me = serializer.validated_data.get("remember_me", False)
            
            # Generate tokens
            tokens = CustomerAuthService.generate_customer_tokens(user)
            
            # Prepare response data
            response_data = {
                "message": "Login successful",
                "user": CustomerAuthService.get_customer_profile(user),
            }
            
            response = Response(response_data, status=status.HTTP_200_OK)
            
            # Set authentication cookies
            CustomerAuthService.set_customer_auth_cookies(
                response, tokens["access"], tokens["refresh"]
            )
            
            # TODO: Handle remember_me functionality if needed
            # Could extend cookie expiration for remember_me=True
            
            return response
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerLogoutView(APIView):
    """
    Logout for customer accounts.
    Clears authentication cookies and blacklists refresh token.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            # Get refresh token from cookies
            refresh_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']}_customer"
            refresh_token = request.COOKIES.get(refresh_cookie_name)
            
            # Blacklist the refresh token if found
            if refresh_token:
                try:
                    token = RefreshToken(refresh_token)
                    token.blacklist()
                except TokenError:
                    # Token already invalid, continue with logout
                    pass
            
            response = Response(
                {"message": "Logout successful"}, 
                status=status.HTTP_200_OK
            )
            
            # Clear authentication cookies
            CustomerAuthService.clear_customer_auth_cookies(response)
            
            return response
            
        except Exception as e:
            # Even if token blacklisting fails, clear cookies
            response = Response(
                {"message": "Logout completed"}, 
                status=status.HTTP_200_OK
            )
            CustomerAuthService.clear_customer_auth_cookies(response)
            return response


class CustomerTokenRefreshView(APIView):
    """
    Refresh customer authentication tokens.
    Uses refresh token from cookies.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # Get refresh token from cookies
        refresh_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']}_customer"
        refresh_token = request.COOKIES.get(refresh_cookie_name)
        
        if not refresh_token:
            return Response(
                {"error": "Refresh token not found"}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        serializer = CustomerTokenRefreshSerializer(data={"refresh": refresh_token})
        
        if serializer.is_valid():
            try:
                # Generate new access token
                old_refresh = RefreshToken(refresh_token)
                new_access = old_refresh.access_token
                
                response = Response(
                    {"message": "Token refreshed successfully"}, 
                    status=status.HTTP_200_OK
                )
                
                # Set new access token cookie (keep same refresh token)
                access_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE']}_customer"
                
                # Use same settings as other customer authentication
                is_secure = getattr(settings, 'SESSION_COOKIE_SECURE', not settings.DEBUG)
                samesite_policy = getattr(settings, 'SESSION_COOKIE_SAMESITE', 'Lax')
                
                response.set_cookie(
                    key=access_cookie_name,
                    value=str(new_access),
                    max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
                    domain=None,
                    path="/",  # Use root path so cookies are available for all customer endpoints
                    httponly=True,
                    secure=is_secure,
                    samesite=samesite_policy,
                )
                
                return response
                
            except TokenError:
                # Clear invalid cookies
                response = Response(
                    {"error": "Invalid refresh token"}, 
                    status=status.HTTP_401_UNAUTHORIZED
                )
                CustomerAuthService.clear_customer_auth_cookies(response)
                return response
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerProfileView(RetrieveUpdateAPIView):
    """
    Retrieve and update customer profile.
    Requires customer authentication.
    """
    serializer_class = CustomerProfileSerializer
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # Ensure user is a customer
        if self.request.user.role != self.request.user.Role.CUSTOMER:
            raise PermissionError("Only customers can access this endpoint")
        return self.request.user

    def update(self, request, *args, **kwargs):
        try:
            return super().update(request, *args, **kwargs)
        except PermissionError as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_403_FORBIDDEN
            )


class CustomerChangePasswordView(APIView):
    """
    Change customer password.
    Requires customer authentication.
    """
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Ensure user is a customer
        if request.user.role != request.user.Role.CUSTOMER:
            return Response(
                {"error": "Only customers can use this endpoint"}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = ChangePasswordSerializer(
            data=request.data, 
            context={"request": request}
        )
        
        if serializer.is_valid():
            try:
                CustomerAuthService.change_customer_password(
                    request.user,
                    serializer.validated_data["old_password"],
                    serializer.validated_data["new_password"]
                )
                
                return Response(
                    {"message": "Password changed successfully"}, 
                    status=status.HTTP_200_OK
                )
                
            except ValueError as e:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerCurrentUserView(APIView):
    """
    Get current authenticated customer information.
    """
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Ensure user is a customer
        if request.user.role != request.user.Role.CUSTOMER:
            return Response(
                {"error": "Only customers can access this endpoint"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CustomerProfileSerializer(request.user)
        return Response(serializer.data) 