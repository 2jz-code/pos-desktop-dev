import requests
import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .clover_oauth import CloverOAuthService
from django.conf import settings

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def test_clover_device_connection(request):
    """
    Test direct REST API connection to Clover Compact device.
    """
    
    # Device details
    device_ip = "192.168.5.120"
    device_serial = "C081UG44220071"
    pos_id = "AjeenPOS"  # Arbitrary identifier for your POS
    
    # Get OAuth token
    merchant_id = getattr(settings, 'CLOVER_MERCHANT_ID', None)
    if not merchant_id:
        return Response({
            'success': False,
            'error': 'No merchant ID configured'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    oauth_service = CloverOAuthService(merchant_id)
    access_token = oauth_service.get_cached_token(merchant_id)
    
    if not access_token:
        return Response({
            'success': False,
            'error': 'No valid OAuth token found. Please complete authorization first.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Test device status endpoint
    try:
        url = f"https://{device_ip}:12346/connect/v1/device/status"
        headers = {
            'X-Clover-Device-Id': device_serial,
            'X-POS-ID': pos_id,
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        # Disable SSL verification for local device (common for local connections)
        response = requests.get(
            url, 
            headers=headers, 
            verify=False,  # Disable SSL verification for local device
            timeout=10
        )
        
        return Response({
            'success': True,
            'device_ip': device_ip,
            'device_serial': device_serial,
            'status_code': response.status_code,
            'response': response.json() if response.content else {},
            'message': 'Successfully connected to Clover device'
        })
        
    except requests.exceptions.SSLError as e:
        # Try HTTP instead of HTTPS
        try:
            url = f"http://{device_ip}:12346/connect/v1/device/status"
            response = requests.get(url, headers=headers, timeout=10)
            
            return Response({
                'success': True,
                'device_ip': device_ip,
                'device_serial': device_serial,
                'status_code': response.status_code,
                'response': response.json() if response.content else {},
                'message': 'Successfully connected to Clover device (HTTP)',
                'note': 'Device uses HTTP instead of HTTPS'
            })
            
        except Exception as http_error:
            return Response({
                'success': False,
                'error': f'Both HTTPS and HTTP failed. HTTPS: {str(e)}, HTTP: {str(http_error)}',
                'device_ip': device_ip,
                'suggestions': [
                    'Check if device is on same network',
                    'Verify device IP address',
                    'Check if USB Pay Display app is running on device',
                    'Try installing Network Pay Display app on device'
                ]
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
    except requests.exceptions.ConnectionError as e:
        return Response({
            'success': False,
            'error': f'Cannot connect to device: {str(e)}',
            'device_ip': device_ip,
            'suggestions': [
                'Check if device is powered on',
                'Verify device IP address (192.168.5.120)',
                'Ensure device is on same network',
                'Check firewall settings'
            ]
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    except requests.exceptions.Timeout as e:
        return Response({
            'success': False,
            'error': f'Connection timeout: {str(e)}',
            'device_ip': device_ip
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    except Exception as e:
        return Response({
            'success': False,
            'error': f'Unexpected error: {str(e)}',
            'device_ip': device_ip
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_clover_payment(request):
    """
    Test making a payment through Clover Compact REST API.
    """
    
    device_ip = "192.168.5.120"
    device_serial = "C081UG44220071" 
    pos_id = "AjeenPOS"
    
    # Get amount from request
    amount = request.data.get('amount', 100)  # Default $1.00 in cents
    
    # Get OAuth token
    merchant_id = getattr(settings, 'CLOVER_MERCHANT_ID', None)
    oauth_service = CloverOAuthService(merchant_id)
    access_token = oauth_service.get_cached_token(merchant_id)
    
    if not access_token:
        return Response({
            'success': False,
            'error': 'No valid OAuth token found'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Try HTTPS first
        url = f"https://{device_ip}:12346/connect/v1/payments"
        headers = {
            'X-Clover-Device-Id': device_serial,
            'X-POS-ID': pos_id,
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Idempotency-Key': f'test-payment-{device_serial}-{amount}'  # Required for payment operations
        }
        
        payment_data = {
            'amount': amount,
            'final': True,
            'externalPaymentId': f'test-{device_serial}-{amount}'
        }
        
        response = requests.post(
            url,
            headers=headers,
            json=payment_data,
            verify=False,
            timeout=30
        )
        
        return Response({
            'success': True,
            'payment_request': payment_data,
            'status_code': response.status_code,
            'response': response.json() if response.content else {},
            'message': 'Payment request sent to device'
        })
        
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e),
            'message': 'Failed to send payment request'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)