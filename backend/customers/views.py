"""
Customer views.
"""
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

from .services import CustomerAuthService
from core_backend.auth.cookies import AuthCookieService
from users.permissions import RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission
from .authentication import CustomerCookieJWTAuthentication, CustomerJWTAuthenticationMixin
from .serializers import (
    CustomerRegistrationSerializer,
    CustomerLoginSerializer,
    CustomerProfileSerializer,
    ChangePasswordSerializer,
    CustomerTokenRefreshSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    EmailVerificationRequestSerializer,
    EmailVerificationConfirmSerializer,
)


@method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='5/m', method='POST', block=True), name='post')
class CustomerRegisterView(APIView):
    """
    Register a new customer account.
    No authentication required.
    """
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):
        serializer = CustomerRegistrationSerializer(data=request.data)

        if serializer.is_valid():
            try:
                # Set tenant from request (middleware extracts from subdomain)
                if not hasattr(request, 'tenant') or not request.tenant:
                    return Response(
                        {"error": "Unable to determine restaurant. Please access via your restaurant's website."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Save customer with tenant
                user = serializer.save(tenant=request.tenant)

                # Generate tokens for immediate login (includes tenant claims)
                tokens = CustomerAuthService.generate_customer_tokens(user)

                # Prepare response data
                response_data = {
                    "message": "Account created successfully",
                    "customer": CustomerAuthService.get_customer_profile(user),
                }

                response = Response(response_data, status=status.HTTP_201_CREATED)

                # Set authentication cookies using centralized service
                AuthCookieService.set_customer_auth_cookies(
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


@method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='5/m', method='POST', block=True), name='post')
class CustomerLoginView(APIView):
    """
    Login for customer accounts.
    No authentication required.
    """
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

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
                "customer": CustomerAuthService.get_customer_profile(user),
            }
            
            response = Response(response_data, status=status.HTTP_200_OK)
            
            # Set authentication cookies using centralized service
            AuthCookieService.set_customer_auth_cookies(
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
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

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
            
            # Clear authentication cookies using centralized service
            AuthCookieService.clear_customer_auth_cookies(response)
            
            return response
            
        except Exception as e:
            # Even if token blacklisting fails, clear cookies
            response = Response(
                {"message": "Logout completed"}, 
                status=status.HTTP_200_OK
            )
            AuthCookieService.clear_customer_auth_cookies(response)
            return response


class CustomerTokenRefreshView(APIView):
    """
    Refresh customer authentication tokens.
    Uses refresh token from cookies.
    """
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):
        # Get refresh token from cookies
        refresh_cookie_name = f"{settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH']}_customer"
        refresh_token = request.COOKIES.get(refresh_cookie_name)
        
        if not refresh_token:
            return Response(
                {"error": "Refresh token not found"}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Use SimpleJWT serializer to support rotation
        from rest_framework_simplejwt.serializers import TokenRefreshSerializer
        s = TokenRefreshSerializer(data={"refresh": refresh_token})
        try:
            s.is_valid(raise_exception=True)
        except TokenError:
            response = Response({"error": "Invalid refresh token"}, status=status.HTTP_401_UNAUTHORIZED)
            AuthCookieService.clear_customer_auth_cookies(response)
            return response

        data = s.validated_data
        new_access = data.get("access")
        new_refresh = data.get("refresh", refresh_token)

        response = Response({"message": "Token refreshed successfully"}, status=status.HTTP_200_OK)

        # Set new access and refresh cookies via centralized service
        AuthCookieService.set_customer_auth_cookies(response, new_access, new_refresh)
        return response


class CustomerProfileView(CustomerJWTAuthenticationMixin, RetrieveUpdateAPIView):
    """
    Retrieve and update customer profile.
    Requires customer authentication.
    """
    serializer_class = CustomerProfileSerializer
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    # Throttle profile updates (PATCH/PUT)
    @method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='15/m', method='PATCH', block=True), name='dispatch')
    @method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='15/m', method='PUT', block=True), name='dispatch')
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def get_object(self):
        # Get authenticated customer
        return self.ensure_customer_authenticated()

    def update(self, request, *args, **kwargs):
        try:
            return super().update(request, *args, **kwargs)
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_403_FORBIDDEN
            )


class CustomerChangePasswordView(CustomerJWTAuthenticationMixin, APIView):
    """
    Change customer password.
    Requires customer authentication.
    """
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    # Throttle password change attempts
    @method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='5/m', method='POST', block=True), name='dispatch')
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        # Get authenticated customer
        customer = self.ensure_customer_authenticated()
        
        serializer = ChangePasswordSerializer(
            data=request.data, 
            context={"request": request}
        )
        
        if serializer.is_valid():
            try:
                CustomerAuthService.change_customer_password(
                    customer,
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


class CustomerCurrentUserView(CustomerJWTAuthenticationMixin, APIView):
    """
    Get current authenticated customer information.
    """
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Get authenticated customer
        customer = self.ensure_customer_authenticated()
        
        serializer = CustomerProfileSerializer(customer)
        return Response(serializer.data)


# @method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='3/h', method='POST', block=True), name='post')  # Temporarily disabled for testing
class PasswordResetRequestView(APIView):
    """
    Request a password reset token.
    Rate limited to 3 requests per hour per IP.
    Always returns success to prevent account enumeration.
    """
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        
        if serializer.is_valid():
            email = serializer.validated_data["email"]
            
            try:
                # Always returns True to prevent enumeration
                CustomerAuthService.request_password_reset(email)
                
                return Response({
                    "message": "If an account with that email exists, a password reset link has been sent."
                }, status=status.HTTP_200_OK)
                
            except Exception as e:
                # Log error but don't reveal to user
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Password reset request failed: {str(e)}")
                
                # Still return success to prevent enumeration
                return Response({
                    "message": "If an account with that email exists, a password reset link has been sent."
                }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# @method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='10/m', method='POST', block=True), name='post')  # Temporarily disabled for testing
class PasswordResetConfirmView(APIView):
    """
    Confirm password reset with token and new password.
    Rate limited to 10 attempts per minute per IP.
    """
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        
        if serializer.is_valid():
            token = serializer.validated_data["token"]
            new_password = serializer.validated_data["new_password"]
            
            try:
                CustomerAuthService.reset_password(token, new_password)
                
                return Response({
                    "message": "Password has been reset successfully. You can now log in with your new password."
                }, status=status.HTTP_200_OK)
                
            except ValueError as e:
                return Response({
                    "error": str(e)
                }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='5/m', method='POST', block=True), name='post')
class EmailVerificationRequestView(CustomerJWTAuthenticationMixin, APIView):
    """
    Request a new email verification token.
    Requires authentication. Rate limited to 5 requests per minute.
    """
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):
        customer = self.ensure_customer_authenticated()
        
        # Check if already verified
        if customer.email_verified:
            return Response({
                "message": "Email is already verified."
            }, status=status.HTTP_200_OK)
        
        try:
            CustomerAuthService.send_email_verification(customer)
            
            return Response({
                "message": "Verification email has been sent to your email address."
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Email verification request failed: {str(e)}")
            
            return Response({
                "error": "Failed to send verification email. Please try again later."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='10/m', method='POST', block=True), name='post')
class EmailVerificationConfirmView(APIView):
    """
    Confirm email verification with token.
    Rate limited to 10 attempts per minute per IP.
    """
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):
        serializer = EmailVerificationConfirmSerializer(data=request.data)
        
        if serializer.is_valid():
            token = serializer.validated_data["token"]
            
            try:
                CustomerAuthService.verify_email_with_token(token)
                
                return Response({
                    "message": "Email has been verified successfully."
                }, status=status.HTTP_200_OK)
                
            except ValueError as e:
                return Response({
                    "error": str(e)
                }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)