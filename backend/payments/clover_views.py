from django.http import JsonResponse, HttpResponseRedirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .clover_oauth import CloverOAuthService
import logging
import uuid

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def clover_authorize(request):
    """
    Initiate Clover OAuth authorization flow.
    This generates the authorization URL that merchants need to visit.
    """
    try:
        # Generate state parameter for CSRF protection
        state = str(uuid.uuid4())
        request.session['clover_oauth_state'] = state
        
        # Build redirect URI - adjust this to match your domain
        redirect_uri = f"{settings.BASE_URL}/api/payments/clover/callback/"
        
        oauth_service = CloverOAuthService()
        auth_url = oauth_service.get_authorization_url(
            redirect_uri=redirect_uri,
            state=state
        )
        
        return Response({
            'authorization_url': auth_url,
            'state': state,
            'redirect_uri': redirect_uri
        })
        
    except Exception as e:
        logger.error(f"Failed to generate Clover authorization URL: {e}")
        return Response(
            {'error': 'Failed to initiate authorization'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@csrf_exempt
@require_http_methods(["GET"])
def clover_callback(request):
    """
    Handle OAuth callback from Clover.
    This processes the authorization code and exchanges it for an access token.
    """
    try:
        # Get parameters from callback
        code = request.GET.get('code')
        state = request.GET.get('state')
        error = request.GET.get('error')
        
        if error:
            logger.error(f"OAuth error from Clover: {error}")
            return JsonResponse({'error': f'Authorization failed: {error}'}, status=400)
        
        if not code:
            return JsonResponse({'error': 'No authorization code received'}, status=400)
        
        # Verify state parameter (CSRF protection)
        session_state = request.session.get('clover_oauth_state')
        if not session_state or session_state != state:
            return JsonResponse({'error': 'Invalid state parameter'}, status=400)
        
        # Exchange code for token
        redirect_uri = f"{settings.BASE_URL}/api/payments/clover/callback/"
        oauth_service = CloverOAuthService()
        
        token_data = oauth_service.exchange_code_for_token(
            code=code,
            redirect_uri=redirect_uri
        )
        
        # Clean up session
        if 'clover_oauth_state' in request.session:
            del request.session['clover_oauth_state']
        
        # Success response
        merchant_id = token_data.get('merchant_id')
        if not merchant_id:
            # Use the configured merchant ID
            merchant_id = getattr(settings, 'CLOVER_MERCHANT_ID', 'Unknown')
        
        return JsonResponse({
            'success': True,
            'message': 'Clover authorization successful',
            'merchant_id': merchant_id,
            'has_token': 'access_token' in token_data
        })
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return JsonResponse({'error': 'Authorization processing failed'}, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def clover_status(request):
    """
    Check Clover integration status for a merchant.
    """
    try:
        merchant_id = request.GET.get('merchant_id')
        if not merchant_id:
            merchant_id = getattr(settings, 'CLOVER_MERCHANT_ID', None)
        
        if not merchant_id:
            return Response({
                'configured': False,
                'error': 'No merchant ID provided or configured'
            })
        
        oauth_service = CloverOAuthService(merchant_id)
        token = oauth_service.get_cached_token(merchant_id)
        
        if not token:
            return Response({
                'configured': False,
                'merchant_id': merchant_id,
                'has_token': False,
                'message': 'No valid access token found. Please authorize the application.'
            })
        
        # Validate token
        is_valid = oauth_service.validate_token(token, merchant_id)
        
        return Response({
            'configured': True,
            'merchant_id': merchant_id,
            'has_token': True,
            'token_valid': is_valid,
            'message': 'Clover integration is configured' if is_valid else 'Token may be invalid'
        })
        
    except Exception as e:
        logger.error(f"Status check error: {e}")
        return Response(
            {'error': 'Failed to check status'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clover_test_connection(request):
    """
    Test the connection to Clover API.
    """
    try:
        merchant_id = request.data.get('merchant_id')
        if not merchant_id:
            merchant_id = getattr(settings, 'CLOVER_MERCHANT_ID', None)
        
        if not merchant_id:
            return Response({
                'success': False,
                'error': 'No merchant ID provided'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        from .clover_api import CloverAPIService
        
        clover_api = CloverAPIService(merchant_id)
        is_valid = clover_api.validate_connection()
        
        if is_valid:
            # Get some basic merchant info to confirm
            merchant_info = clover_api.get_merchant_info()
            
            return Response({
                'success': True,
                'merchant_id': merchant_id,
                'merchant_name': merchant_info.get('name', 'Unknown'),
                'message': 'Connection successful'
            })
        else:
            return Response({
                'success': False,
                'error': 'Connection test failed'
            })
        
    except Exception as e:
        logger.error(f"Connection test error: {e}")
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)