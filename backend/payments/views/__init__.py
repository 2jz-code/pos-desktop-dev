"""
Payment views package.

This package organizes payment views by user type and functionality:
- guest.py: Guest payment flows (no authentication)
- authenticated.py: Authenticated user payments
- terminal.py: Terminal/POS payment views
- webhooks.py: Provider webhook handlers
- base.py: Shared utilities and base classes
"""

# Import all views to make them available when importing from payments.views
from .guest import *
from .authenticated import *
from .terminal import *
from .webhooks import *
from .base import *

# For backward compatibility, also expose the main classes directly
__all__ = [
    # Guest views
    "CreateGuestPaymentIntentView",
    "CompleteGuestPaymentView",
    # Authenticated views
    "PaymentViewSet",
    "CreatePaymentView",
    "PaymentDetailView",
    "PaymentProcessView",
    # Terminal views
    "CreateTerminalIntentView",
    "CaptureTerminalIntentView",
    "CancelPaymentIntentView",
    "TerminalConnectionTokenView",
    "TerminalConfigurationView",
    "CancelTerminalActionView",
    # Webhook views
    "StripeWebhookView",
    # Base utilities
    "BasePaymentView",
]
