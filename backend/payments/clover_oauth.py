import requests
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from django.conf import settings
from django.core.cache import cache
from urllib.parse import urlencode

logger = logging.getLogger(__name__)


class CloverOAuthService:
    """
    Service for handling Clover OAuth authentication and token management.
    """
    
    # Clover API URLs
    SANDBOX_BASE_URL = "https://apisandbox.dev.clover.com"
    PRODUCTION_BASE_URL = "https://api.clover.com"
    
    # OAuth endpoints
    OAUTH_AUTHORIZE_URL = "https://sandbox.dev.clover.com/oauth/authorize"
    OAUTH_TOKEN_URL = "https://sandbox.dev.clover.com/oauth/token"
    
    # Production URLs (uncomment when ready for production)
    # OAUTH_AUTHORIZE_URL = "https://clover.com/oauth/authorize"
    # OAUTH_TOKEN_URL = "https://clover.com/oauth/token"
    
    def __init__(self, merchant_id: str = None):
        self.app_id = getattr(settings, 'CLOVER_APP_ID', None)
        self.app_secret = getattr(settings, 'CLOVER_APP_SECRET', None)
        self.merchant_id = merchant_id
        self.base_url = self.SANDBOX_BASE_URL  # Use sandbox by default
        
        if not self.app_id or not self.app_secret:
            raise ValueError("Clover APP_ID and APP_SECRET must be configured in settings")
    
    def get_authorization_url(self, redirect_uri: str, state: str = None) -> str:
        """
        Generate the OAuth authorization URL for merchants to authorize the app.
        
        Args:
            redirect_uri: The URI to redirect to after authorization
            state: Optional state parameter for CSRF protection
            
        Returns:
            Authorization URL string
        """
        params = {
            'client_id': self.app_id,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
        }
        
        if state:
            params['state'] = state
            
        return f"{self.OAUTH_AUTHORIZE_URL}?{urlencode(params)}"
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access token.
        
        Args:
            code: Authorization code from Clover
            redirect_uri: The same redirect URI used in authorization
            
        Returns:
            Token response dictionary containing access_token and other info
        """
        data = {
            'client_id': self.app_id,
            'client_secret': self.app_secret,
            'code': code,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        }
        
        try:
            response = requests.post(self.OAUTH_TOKEN_URL, data=data, timeout=30)
            response.raise_for_status()
            
            token_data = response.json()
            
            # Cache the token for this merchant
            if 'access_token' in token_data:
                merchant_id = self._extract_merchant_id_from_token(token_data)
                if not merchant_id:
                    # If merchant_id not in response, use the configured one
                    from django.conf import settings
                    merchant_id = getattr(settings, 'CLOVER_MERCHANT_ID', None)
                
                if merchant_id:
                    self._cache_token(merchant_id, token_data)
                    logger.info(f"Successfully obtained access token for merchant {merchant_id}")
                else:
                    logger.warning("Could not determine merchant ID for token caching")
            
            return token_data
            
        except requests.RequestException as e:
            logger.error(f"Failed to exchange code for token: {e}")
            raise Exception(f"OAuth token exchange failed: {str(e)}")
    
    def get_cached_token(self, merchant_id: str) -> Optional[str]:
        """
        Retrieve cached access token for a merchant.
        
        Args:
            merchant_id: Clover merchant ID
            
        Returns:
            Access token string or None if not cached/expired
        """
        cache_key = f"clover_token_{merchant_id}"
        token_data = cache.get(cache_key)
        
        if token_data and isinstance(token_data, dict):
            return token_data.get('access_token')
        
        return None
    
    def _cache_token(self, merchant_id: str, token_data: Dict[str, Any]):
        """
        Cache the access token with appropriate expiration.
        
        Args:
            merchant_id: Clover merchant ID
            token_data: Token response from Clover
        """
        cache_key = f"clover_token_{merchant_id}"
        
        # Clover tokens typically don't expire, but cache for 30 days as a safety measure
        cache_timeout = 30 * 24 * 60 * 60  # 30 days in seconds
        
        cache.set(cache_key, token_data, cache_timeout)
        logger.debug(f"Cached token for merchant {merchant_id}")
    
    def _extract_merchant_id_from_token(self, token_data: Dict[str, Any]) -> Optional[str]:
        """
        Extract merchant ID from token response if available.
        
        Args:
            token_data: Token response from Clover
            
        Returns:
            Merchant ID string or None
        """
        # Clover includes merchant_id in some token responses
        return token_data.get('merchant_id')
    
    def revoke_token(self, access_token: str) -> bool:
        """
        Revoke an access token (if supported by Clover).
        
        Args:
            access_token: The token to revoke
            
        Returns:
            True if successful, False otherwise
        """
        # Note: Clover may not have a revoke endpoint, check their latest docs
        # This is a placeholder implementation
        logger.info(f"Token revoke requested (may not be supported by Clover)")
        return True
    
    def validate_token(self, access_token: str, merchant_id: str) -> bool:
        """
        Validate an access token by making a test API call.
        
        Args:
            access_token: Token to validate
            merchant_id: Merchant ID for the API call
            
        Returns:
            True if token is valid, False otherwise
        """
        try:
            # Make a simple API call to validate the token
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Test endpoint - get merchant info
            url = f"{self.base_url}/v3/merchants/{merchant_id}"
            response = requests.get(url, headers=headers, timeout=10)
            
            return response.status_code == 200
            
        except requests.RequestException as e:
            logger.warning(f"Token validation failed: {e}")
            return False
    
    def get_merchant_info(self, access_token: str, merchant_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch merchant information using the access token.
        
        Args:
            access_token: Valid access token
            merchant_id: Merchant ID
            
        Returns:
            Merchant info dictionary or None if failed
        """
        try:
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            url = f"{self.base_url}/v3/merchants/{merchant_id}"
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            return response.json()
            
        except requests.RequestException as e:
            logger.error(f"Failed to fetch merchant info: {e}")
            return None