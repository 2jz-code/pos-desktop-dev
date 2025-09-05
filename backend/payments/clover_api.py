import requests
import logging
from typing import Dict, Any
from decimal import Decimal
from .clover_oauth import CloverOAuthService

logger = logging.getLogger(__name__)


class CloverAPIService:
    """
    Service for interacting with Clover's REST API for payment processing only.
    """

    def __init__(self, merchant_id: str):
        self.merchant_id = merchant_id
        self.oauth_service = CloverOAuthService(merchant_id)
        self.base_url = self.oauth_service.base_url

    def _get_headers(self) -> Dict[str, str]:
        """Get authorization headers for API requests."""
        access_token = self.oauth_service.get_cached_token(self.merchant_id)
        if not access_token:
            raise ValueError(
                f"No valid access token found for merchant {self.merchant_id}"
            )

        return {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def _make_request(
        self, method: str, endpoint: str, data: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Make authenticated API request to Clover."""
        url = f"{self.base_url}{endpoint}"
        headers = self._get_headers()

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=data if data else None,
                timeout=30,
            )
            response.raise_for_status()

            if response.status_code == 204:
                return {}

            return response.json()

        except requests.RequestException as e:
            logger.error(f"Clover API request failed: {method} {url} - {e}")
            if hasattr(e, "response") and e.response is not None:
                try:
                    error_details = e.response.json()
                    raise Exception(f"Clover API error: {error_details}")
                except:
                    pass
            raise Exception(f"Clover API request failed: {str(e)}")

    def create_payment(
        self,
        amount_cents: int,
        note: str = None,
        tax_amount_cents: int = 0,
        tip_amount_cents: int = 0,
    ) -> Dict[str, Any]:
        """
        Create a payment in Clover.

        Args:
            amount_cents: Payment amount in cents
            note: Optional payment note
            tax_amount_cents: Tax amount in cents
            tip_amount_cents: Tip amount in cents

        Returns:
            Payment object from Clover
        """
        endpoint = f"/v3/merchants/{self.merchant_id}/payments"

        payment_data = {
            "amount": amount_cents,
        }

        if note:
            payment_data["note"] = note

        if tax_amount_cents:
            payment_data["taxAmount"] = tax_amount_cents

        if tip_amount_cents:
            payment_data["tipAmount"] = tip_amount_cents

        return self._make_request("POST", endpoint, payment_data)

    def get_payment(self, payment_id: str) -> Dict[str, Any]:
        """Retrieve a payment by ID."""
        endpoint = f"/v3/merchants/{self.merchant_id}/payments/{payment_id}"
        return self._make_request("GET", endpoint)

    def refund_payment(
        self, payment_id: str, amount_cents: int = None, reason: str = None
    ) -> Dict[str, Any]:
        """
        Create a refund for a payment.

        Args:
            payment_id: Clover payment ID
            amount_cents: Refund amount in cents (if None, full refund)
            reason: Optional refund reason

        Returns:
            Refund object from Clover
        """
        endpoint = f"/v3/merchants/{self.merchant_id}/payments/{payment_id}/refunds"

        refund_data = {}
        if amount_cents:
            refund_data["amount"] = amount_cents
        if reason:
            refund_data["reason"] = reason

        return self._make_request("POST", endpoint, refund_data)

    def get_merchant_info(self) -> Dict[str, Any]:
        """Get merchant information."""
        endpoint = f"/v3/merchants/{self.merchant_id}"
        return self._make_request("GET", endpoint)
    
    def validate_connection(self) -> bool:
        """Test the API connection and token validity."""
        try:
            merchant_info = self.get_merchant_info()
            return merchant_info is not None and "id" in merchant_info
        except Exception as e:
            logger.error(f"Connection validation failed: {e}")
            return False
