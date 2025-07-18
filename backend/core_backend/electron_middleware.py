"""
Middleware to handle Electron POS app requests
"""
import logging

logger = logging.getLogger(__name__)


class ElectronPOSMiddleware:
    """
    Middleware to handle requests from Electron POS app
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Check if request is from Electron POS app
        client_type = request.headers.get('X-Client-Type')
        client_version = request.headers.get('X-Client-Version')
        user_agent = request.headers.get('User-Agent', '')
        
        if client_type == 'electron-pos':
            # Log Electron POS requests for monitoring
            logger.info(
                f"Electron POS request: {request.method} {request.path} "
                f"from version {client_version}, User: {getattr(request.user, 'username', 'Anonymous')}"
            )
            
            # Add custom attributes to request for later use
            request.is_electron_pos = True
            request.electron_version = client_version
            
            # Optional: Add special handling for Electron requests
            if request.method == 'OPTIONS':
                # Handle preflight requests for CORS
                response = self.get_response(request)
                response['Access-Control-Allow-Headers'] = (
                    'Origin, X-Requested-With, Content-Type, Accept, Authorization, '
                    'X-Client-Type, X-Client-Version, X-CSRFToken'
                )
                return response
        else:
            request.is_electron_pos = False
            request.electron_version = None

        response = self.get_response(request)
        
        # Add custom headers to response for Electron clients
        if getattr(request, 'is_electron_pos', False):
            response['X-Server-Version'] = '1.0.0'
            response['X-Electron-Supported'] = 'true'
        
        return response