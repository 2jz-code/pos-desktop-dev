# In desktop-combined/backend/discounts/services.py

from decimal import Decimal
from django.db import transaction
from django.utils import timezone

# --- FIX: Corrected Imports ---
from .models import Discount
from orders.models import Order, OrderDiscount

# --- END FIX ---

from .factories import DiscountStrategyFactory
from core_backend.cache_utils import cache_static_data, cache_dynamic_data


class DiscountService:
    """
    A service for applying, removing, and calculating discounts.
    This is the central point of control for all discount logic.
    """
    
    @staticmethod
    @cache_static_data(timeout=3600*2)  # 2 hours - discounts change moderately
    def get_active_discounts():
        """Cache active discounts for quick order calculations"""
        now = timezone.now()
        return list(Discount.objects.filter(
            is_active=True,
            start_date__lte=now,
            end_date__gte=now
        ).prefetch_related(
            'applicable_products',
            'applicable_categories'
        ).select_related())
    
    @staticmethod
    @cache_dynamic_data(timeout=1800)  # 30 minutes - order-specific calculations
    def get_discount_eligibility_for_order_type(order_total, item_count, has_categories=None):
        """Cache discount eligibility for common order patterns"""
        active_discounts = DiscountService.get_active_discounts()
        eligible_discounts = []
        
        for discount in active_discounts:
            # Basic eligibility checks that don't require full order context
            if discount.minimum_purchase_amount and order_total < discount.minimum_purchase_amount:
                continue
                
            # Check if discount type could apply to this order pattern
            if discount.type in ['PERCENTAGE', 'FIXED_AMOUNT']:
                eligible_discounts.append({
                    'id': discount.id,
                    'name': discount.name,
                    'type': discount.type,
                    'value': discount.value,
                    'scope': discount.scope,
                    'minimum_purchase_amount': discount.minimum_purchase_amount
                })
                
        return eligible_discounts

    @staticmethod
    @transaction.atomic
    def apply_discount_to_order(order: Order, discount: Discount):
        """
        Applies a discount to an order if it is eligible.

        This method checks the discount's strategy to determine its eligibility
        and calculated amount. If the discount is valid and can be applied,
        it creates or updates the OrderDiscount link.
        """
        # --- START: Discount Stacking Logic ---
        # Use cached settings for better performance
        from settings.config import app_settings
        allow_stacking = app_settings.allow_discount_stacking

        # If stacking is disabled, remove all other discounts before applying a new one.
        if not allow_stacking:
            if order.applied_discounts.exists():
                order.applied_discounts.all().delete()
                print("Removed existing discounts as stacking is disabled.")
        # --- END: Discount Stacking Logic ---

        # Get the appropriate calculation strategy for the given discount
        strategy = DiscountStrategyFactory.get_strategy(discount)
        if not strategy:
            print(
                f"Warning: No discount strategy found for discount type {discount.type}"
            )
            return

        # Calculate the potential discount amount using the strategy
        calculated_amount = strategy.apply(order, discount)

        # Only apply the discount if it has a positive value
        if calculated_amount > 0:
            # Create or update the link table entry for this discount
            OrderDiscount.objects.update_or_create(
                order=order, discount=discount, defaults={"amount": calculated_amount}
            )
            print(
                f"Discount '{discount.name}' applied with amount {calculated_amount}."
            )
        else:
            # If an invalid discount was somehow still linked, remove it.
            OrderDiscount.objects.filter(order=order, discount=discount).delete()
            print(f"Discount '{discount.name}' is not applicable to this order.")

        # IMPORTANT: After any change, we must trigger a full recalculation of the order's totals.
        # We emit a signal instead of directly calling OrderService to avoid circular dependencies.
        from orders.signals import order_needs_recalculation

        order_needs_recalculation.send(sender=DiscountService, order=order)

    @staticmethod
    @transaction.atomic
    def remove_discount_from_order(order: Order, discount: Discount):
        """
        Removes a discount from an order and triggers a recalculation.
        """
        # Find the link entry and delete it
        items_deleted, _ = OrderDiscount.objects.filter(
            order=order, discount=discount
        ).delete()

        if items_deleted > 0:
            print(f"Discount '{discount.name}' removed from the order.")

        # IMPORTANT: Always recalculate totals after removing a discount.
        # We emit a signal instead of directly calling OrderService to avoid circular dependencies.
        from orders.signals import order_needs_recalculation

        order_needs_recalculation.send(sender=DiscountService, order=order)
