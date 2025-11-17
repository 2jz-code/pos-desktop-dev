from django.db import transaction
import logging

from orders.models import Order
from discounts.models import Discount
from discounts.services import DiscountService as CoreDiscountService

logger = logging.getLogger(__name__)


class OrderDiscountService:
    """Service for applying and removing discounts from orders."""

    @staticmethod
    @transaction.atomic
    def apply_discount_to_order_by_id(order: Order, discount_id: int, user=None):
        """
        Applies a discount to an order by DELEGATING to the DiscountService.

        Args:
            order: Order instance
            discount_id: ID of the discount to apply
            user: User applying the discount (required for approval requests)

        Returns:
            dict or None: If approval required, returns dict with:
                {
                    'status': 'pending_approval',
                    'approval_request_id': str,
                    'message': str,
                    'discount_name': str,
                    'discount_value': str,
                }
            Otherwise returns None (discount applied successfully)
        """
        try:
            discount = Discount.objects.get(id=discount_id)
            result = CoreDiscountService.apply_discount_to_order(order, discount, user=user)
            return result  # Returns dict if approval needed, None otherwise
        except Discount.DoesNotExist:
            raise ValueError("Discount not found.")
        except Exception as e:
            raise e

    @staticmethod
    @transaction.atomic
    def apply_discount_to_order_by_code(order: Order, code: str, user=None):
        """
        Applies a discount to an order by its code, delegating to the DiscountService.

        Args:
            order: Order instance
            code: Discount code to apply
            user: User applying the discount (required for approval requests)

        Returns:
            dict or None: If approval required, returns dict with approval info.
            Otherwise returns None (discount applied successfully)
        """
        try:
            discount = Discount.objects.get(code__iexact=code)
            result = CoreDiscountService.apply_discount_to_order(order, discount, user=user)
            return result  # Returns dict if approval needed, None otherwise
        except Discount.DoesNotExist:
            raise ValueError("Invalid discount code.")
        except Exception as e:
            raise e

    @staticmethod
    @transaction.atomic
    def remove_discount_from_order_by_id(order: Order, discount_id: int):
        """
        Removes a discount from an order by its ID, delegating to the DiscountService.
        """
        try:
            discount = Discount.objects.get(id=discount_id)
            CoreDiscountService.remove_discount_from_order(order, discount)
        except Discount.DoesNotExist:
            raise ValueError("Discount to remove not found on this order.")
        except Exception as e:
            raise e
