from .strategies import (
    PaymentStrategy,
    CashPaymentStrategy,
    StripeTerminalStrategy,
    CloverTerminalStrategy,
    StripeOnlineStrategy,
    GiftCardPaymentStrategy,
)
from .models import PaymentTransaction
from settings.models import TerminalProvider


class PaymentStrategyFactory:
    """
    A factory for creating payment strategy instances.
    """

    @staticmethod
    def get_strategy(method: str, provider: str = None) -> PaymentStrategy:
        """
        Returns an instance of the appropriate payment strategy based on the
        payment method string and an optional provider.
        """
        if method == PaymentTransaction.PaymentMethod.CASH:
            return CashPaymentStrategy()
        elif method == PaymentTransaction.PaymentMethod.CARD_TERMINAL:
            if provider == TerminalProvider.STRIPE_TERMINAL:
                return StripeTerminalStrategy()
            elif provider == TerminalProvider.CLOVER_TERMINAL:
                return CloverTerminalStrategy()
            else:
                raise ValueError(f"Unknown or missing terminal provider: {provider}")
        elif method == PaymentTransaction.PaymentMethod.CARD_ONLINE:
            # Assuming Stripe is the only online provider for now.
            # This could be extended to check a provider string if needed.
            return StripeOnlineStrategy()
        elif method == PaymentTransaction.PaymentMethod.GIFT_CARD:
            return GiftCardPaymentStrategy()
        else:
            raise ValueError(f"Unknown payment method: {method}")
