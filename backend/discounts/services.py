# In desktop-combined/backend/discounts/services.py

from decimal import Decimal
from django.db import transaction
from django.utils import timezone
import logging

# --- FIX: Corrected Imports ---
from .models import Discount
from orders.models import Order, OrderDiscount

# --- END FIX ---

from .factories import DiscountStrategyFactory
from core_backend.infrastructure.cache_utils import cache_static_data, cache_dynamic_data

logger = logging.getLogger(__name__)


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
                logger.debug("Removed existing discounts as stacking is disabled.")
        # --- END: Discount Stacking Logic ---

        # Get the appropriate calculation strategy for the given discount
        strategy = DiscountStrategyFactory.get_strategy(discount)
        if not strategy:
            logger.warning(f"No discount strategy found for discount type {discount.type}")
            return

        # Calculate the potential discount amount using the strategy
        calculated_amount = strategy.apply(order, discount)

        # Only apply the discount if it has a positive value
        if calculated_amount > 0:
            # Create or update the link table entry for this discount
            OrderDiscount.objects.update_or_create(
                order=order, discount=discount, defaults={"amount": calculated_amount}
            )
            logger.info(f"Discount applied: discount_id {discount.id}")
        else:
            # If an invalid discount was somehow still linked, remove it.
            OrderDiscount.objects.filter(order=order, discount=discount).delete()
            logger.debug(f"Discount_id {discount.id} is not applicable to this order.")

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
            logger.info(f"Discount_id {discount.id} removed from order.")

        # IMPORTANT: Always recalculate totals after removing a discount.
        # We emit a signal instead of directly calling OrderService to avoid circular dependencies.
        from orders.signals import order_needs_recalculation

        order_needs_recalculation.send(sender=DiscountService, order=order)


class DiscountValidationService:
    """
    Service for handling discount validation business rules and code application.
    Extracted from views to centralize validation logic.
    """
    
    @staticmethod
    def validate_discount_code(code: str, order_id: int) -> dict:
        """
        Extract discount code validation logic from apply_discount_code view.
        Handles code lookup, order lookup, and discount application.
        """
        # Input validation
        if not order_id or not code:
            return {
                "success": False,
                "error": "Order ID and code are required."
            }
        
        try:
            # Order lookup with validation
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return {
                "success": False,
                "error": "Order not found."
            }
        
        try:
            # Discount code lookup with case-insensitive search (only active/non-archived)
            discount = Discount.objects.filter(is_active=True).get(code__iexact=code)
        except Discount.DoesNotExist:
            return {
                "success": False,
                "error": "Invalid discount code."
            }
        
        try:
            # Apply discount using existing service
            DiscountService.apply_discount_to_order(order, discount)
            
            return {
                "success": True,
                "message": "Discount applied successfully.",
                "discount_name": discount.name,
                "order_id": order_id
            }
            
        except ValueError as e:
            return {
                "success": False,
                "error": str(e)
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to apply discount: {str(e)}"
            }
    
    @staticmethod
    def validate_discount_eligibility(discount: Discount, order: Order = None) -> list:
        """
        Comprehensive discount eligibility checking.
        Can be expanded for more complex validation rules.
        """
        errors = []
        
        # Check if discount is active
        if not discount.is_active:
            errors.append("Discount is not active")
        
        # Check date range
        now = timezone.now()
        if discount.start_date and discount.start_date > now:
            errors.append("Discount has not started yet")
        
        if discount.end_date and discount.end_date < now:
            errors.append("Discount has expired")
        
        # Order-specific validations
        if order:
            # Check minimum purchase amount
            if discount.minimum_purchase_amount:
                order_total = getattr(order, 'total_amount', 0)
                if order_total < discount.minimum_purchase_amount:
                    errors.append(f"Minimum purchase amount of ${discount.minimum_purchase_amount} not met")
        
        return errors
    
    @staticmethod
    def get_filtered_discounts(filters: dict) -> 'QuerySet':
        """
        Extract filtering logic for discount queries.
        Handles delta sync and other filtering operations.
        """
        from django.utils.dateparse import parse_datetime
        
        queryset = Discount.objects.all()
        
        # Delta sync filtering
        modified_since = filters.get("modified_since")
        if modified_since:
            try:
                modified_since_dt = parse_datetime(modified_since)
                if modified_since_dt:
                    # Note: Discount model doesn't have updated_at field by default
                    # For now, return all discounts until updated_at field is added
                    # This could be enhanced when the model includes timestamps
                    queryset = queryset.filter(id__gte=1)
            except (ValueError, TypeError):
                # If parsing fails, ignore the parameter and continue
                pass
        
        return queryset
    
    @staticmethod
    def validate_discount_combination(discounts: list) -> dict:
        """
        Validate multiple discount application rules.
        Checks stacking rules and conflicts.
        """
        from settings.config import app_settings
        
        if not discounts:
            return {"valid": True, "messages": []}
        
        messages = []
        
        # Check if discount stacking is allowed
        if len(discounts) > 1 and not app_settings.allow_discount_stacking:
            return {
                "valid": False,
                "messages": ["Multiple discounts not allowed - stacking is disabled"]
            }
        
        # Check for conflicting discount types
        discount_types = [d.type for d in discounts if hasattr(d, 'type')]
        if len(set(discount_types)) > 1:
            messages.append("Warning: Different discount types applied simultaneously")
        
        return {
            "valid": True,
            "messages": messages
        }
