"""
Google OAuth views for customer authentication.
"""
from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator

from .services import CustomerAuthService
from core_backend.auth.cookies import AuthCookieService
from users.permissions import RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission
from .authentication import CustomerCookieJWTAuthentication, CustomerJWTAuthenticationMixin
from .serializers import (
    GoogleOAuthLoginSerializer,
    GoogleOAuthLinkSerializer,
)
from .google_oauth_service import GoogleOAuthService


@method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='10/m', method='POST', block=True), name='post')
class GoogleOAuthLoginView(APIView):
    """
    Google OAuth login for customers.
    Accepts Google ID token and creates/authenticates customer account.
    """
    permission_classes = [permissions.AllowAny, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):
        serializer = GoogleOAuthLoginSerializer(data=request.data)
        
        if serializer.is_valid():
            id_token = serializer.validated_data['id_token']
            
            try:
                # Process Google OAuth login
                customer, tokens, is_new_customer = GoogleOAuthService.google_oauth_login(id_token)
                
                # Prepare response data
                response_data = {
                    "message": "Google authentication successful",
                    "customer": CustomerAuthService.get_customer_profile(customer),
                    "is_new_customer": is_new_customer,
                }
                
                response = Response(response_data, status=status.HTTP_200_OK)
                
                # Set authentication cookies using centralized service
                AuthCookieService.set_customer_auth_cookies(
                    response, tokens["access"], tokens["refresh"]
                )
                
                return response
                
            except ValueError as e:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(ratelimit(key='core_backend.utils.get_client_ip', rate='5/m', method='POST', block=True), name='post')
class GoogleOAuthLinkView(APIView, CustomerJWTAuthenticationMixin):
    """
    Link Google account to existing customer account.
    Requires customer authentication.
    """
    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated, RequiresAntiCSRFHeader, DoubleSubmitCSRFPremission]

    def post(self, request):        
        # Ensure customer is authenticated
        customer = self.ensure_customer_authenticated()
        
        serializer = GoogleOAuthLinkSerializer(data=request.data)
        
        if serializer.is_valid():
            id_token = serializer.validated_data['id_token']
            
            try:
                # Link Google account to customer
                GoogleOAuthService.link_google_account(customer, id_token)
                
                return Response({
                    "message": "Google account has been successfully linked to your account."
                }, status=status.HTTP_200_OK)
                
            except ValueError as e:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)