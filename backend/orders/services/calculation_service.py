from decimal import Decimal
from django.db import transaction
import hashlib
import logging
import time

from core_backend.infrastructure.cache_utils import cache_session_data, cache_static_data
from payments.money import quantize
from settings.config import AppSettings

logger = logging.getLogger(__name__)


class OrderCalculationService:
    """Service for calculating order totals, taxes, and managing calculation caching."""

    @staticmethod
    @cache_static_data(timeout=3600*4)  # 4 hours - tax calculations don't change often
    def get_tax_calculation_matrix(store_location):
        """
        Cache tax calculations for common price ranges for a specific store location.

        Args:
            store_location: StoreLocation instance to get tax rate from
        """
        if not store_location:
            raise ValueError("store_location is required for tax calculations")

        # Pre-calculate tax amounts for common price ranges
        tax_rate = store_location.tax_rate
        price_ranges = [1, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200]

        tax_matrix = {}
        # Assume USD for tax matrix (can be extended for multi-currency)
        currency = 'USD'
        for price in price_ranges:
            price_decimal = Decimal(str(price))
            tax_amount = price_decimal * Decimal(str(tax_rate))
            tax_matrix[price] = {
                'tax_amount': float(quantize(currency, tax_amount)),
                'total_with_tax': float(quantize(currency, price_decimal + tax_amount))
            }

        return {
            'tax_rate': float(tax_rate),
            'matrix': tax_matrix,
            'last_updated': str(store_location.tax_rate),  # Use as cache key
            'store_location_id': store_location.id  # Include location in cache key
        }

    @staticmethod
    @cache_session_data(timeout=300)  # 5 minutes for active order calculations
    def get_cached_order_totals(order_items_hash, discounts_hash, tax_rate_hash):
        """
        Cache order calculation patterns during active editing.
        This caches the calculation logic, not specific order data.
        """
        # This would be called with a hash of order composition
        # to cache calculations for similar order patterns
        cache_key = f"order_calc_{order_items_hash}_{discounts_hash}_{tax_rate_hash}"

        # Return calculation patterns that can be reused
        return {
            'calculation_cached': True,
            'cache_key': cache_key,
            'patterns': {
                'tax_calculation_available': True,
                'discount_calculation_available': True
            }
        }

    @staticmethod
    def calculate_order_hash(order):
        """Generate a hash for order composition to enable calculation caching"""
        try:
            # Create a hash based on order composition, not specific values
            order_composition = []

            for item in order.items.all():
                item_data = f"{item.product_id}:{item.quantity}:{len(item.modifiers.all())}"
                order_composition.append(item_data)

            # Add discount info
            discount_data = "|".join([str(d.discount_id) for d in order.applied_discounts.all()])

            # Create hash
            composition_string = "|".join(sorted(order_composition)) + f"|{discount_data}"
            return hashlib.md5(composition_string.encode()).hexdigest()[:12]

        except Exception:
            # If hashing fails, return a default
            return "no_cache"

    @staticmethod
    @transaction.atomic
    def recalculate_order_totals(order):
        """
        Recalculates all financial fields for an order using OrderCalculator (DRY).

        Delegates to OrderCalculator for subtotal, tax, and grand_total calculations.
        Discounts are handled separately using DiscountStrategyFactory.
        """
        from orders.models import Order, OrderAdjustment
        from orders.calculators import OrderCalculator
        from orders.services import OrderAdjustmentService
        from discounts.factories import DiscountStrategyFactory

        start_time = time.monotonic()

        # Prefetched relations on the Order instance become stale immediately after we mutate
        # related objects (e.g. adding/removing items via the WebSocket consumer). Always fetch
        # a fresh copy so calculations operate on accurate data.
        original_order_reference = order
        order = Order.objects.prefetch_related(
            "items__product__taxes", "applied_discounts__discount", "adjustments"
        ).select_related("store_location").get(id=order.id, tenant=order.tenant)
        setattr(original_order_reference, "_recalculated_order_instance", order)

        # Pre-fetch items with related data to prevent N+1 queries
        items_queryset = order.items.select_related("product", "product__product_type").prefetch_related("product__taxes").all()
        items = list(items_queryset)
        item_count = len(items)

        # Use OrderCalculator for DRY financial calculations
        calculator = OrderCalculator(order)

        # 1. Calculate subtotal (delegated to calculator)
        order.subtotal = calculator.calculate_subtotal()

        # 2. Recalculate discounts using DiscountService (NOT in calculator yet)
        # TODO: Move this logic to DiscountCalculator class
        total_discount_amount = Decimal("0.00")

        applied_discounts = list(order.applied_discounts.all())
        if applied_discounts:
            for order_discount in applied_discounts:
                strategy = DiscountStrategyFactory.get_strategy(order_discount.discount)
                calculated_amount = strategy.apply(order, order_discount.discount)
                if calculated_amount != order_discount.amount:
                    order_discount.amount = calculated_amount
                    order_discount.save()
                total_discount_amount += calculated_amount
        order.total_discounts_amount = total_discount_amount

        # 3. Calculate total adjustments amount (one-off discounts only)
        # IMPORTANT: Price overrides are NOT included here because they already modified price_at_sale
        # Including them would double-count the price change. We still save the total for reporting.

        # Recalculate percentage-based adjustments (similar to how we recalculate predefined discounts)
        # This ensures percentage discounts stay accurate if order subtotal changes
        percentage_adjustments = order.adjustments.select_related('order_item').filter(
            adjustment_type=OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT,
            discount_type=OrderAdjustment.DiscountType.PERCENTAGE
        )
        for adjustment in percentage_adjustments:
            # Recalculate amount based on item total (if item-level) or order subtotal (if order-level)
            if adjustment.order_item_id:  # Use _id to avoid extra query
                # Item-level: Calculate based on specific item's total
                item_total = (adjustment.order_item.price_at_sale * adjustment.order_item.quantity) or Decimal('0.00')
                new_amount = -(item_total * (adjustment.discount_value / Decimal('100.00')))
                logger.info(
                    f"Item-level percentage adjustment {adjustment.id}: "
                    f"item_total={item_total}, discount_value={adjustment.discount_value}%, new_amount={new_amount}"
                )
            else:
                # Order-level: Calculate based on order subtotal
                new_amount = -(order.subtotal * (adjustment.discount_value / Decimal('100.00')))
                logger.info(
                    f"Order-level percentage adjustment {adjustment.id}: "
                    f"subtotal={order.subtotal}, discount_value={adjustment.discount_value}%, new_amount={new_amount}"
                )

            # Round to currency precision using banker's rounding
            currency = AppSettings().currency
            new_amount = quantize(currency, new_amount)
            if adjustment.amount != new_amount:
                logger.info(
                    f"Recalculating percentage adjustment {adjustment.id}: "
                    f"{adjustment.amount} → {new_amount} "
                    f"({'item' if adjustment.order_item_id else 'order'}-level)"
                )
                adjustment.amount = new_amount
                adjustment.save(update_fields=['amount'])

        # Recalculate fixed-amount discounts to respect current applicable total
        # - Cap down if discount exceeds total (prevent negative totals)
        # - Restore up if items added back (up to original discount_value)
        fixed_adjustments = order.adjustments.filter(
            adjustment_type=OrderAdjustment.AdjustmentType.ONE_OFF_DISCOUNT,
            discount_type=OrderAdjustment.DiscountType.FIXED
        )
        for adjustment in fixed_adjustments:
            # Original discount amount based on discount_value
            original_discount = -adjustment.discount_value

            # Max allowed discount depends on whether it's item-level or order-level
            if adjustment.order_item:
                # Item-level: Check against item total
                item_total = (adjustment.order_item.price_at_sale * adjustment.order_item.quantity) or Decimal('0.00')
                max_allowed_discount = -item_total
            else:
                # Order-level: Check against order subtotal
                max_allowed_discount = -order.subtotal

            # Apply the smaller of: original discount or max allowed (to prevent negative)
            # This handles both capping down and restoring up
            new_amount = max(original_discount, max_allowed_discount)  # max() because both are negative

            if adjustment.amount != new_amount:
                old_amount = adjustment.amount
                adjustment.amount = new_amount
                adjustment.save(update_fields=['amount'])
                logger.info(
                    f"Adjusted fixed discount {adjustment.id} "
                    f"({'item' if adjustment.order_item else 'order'}-level): "
                    f"{old_amount} → {new_amount} (original: {original_discount})"
                )

        # Clear prefetch cache and reload adjustments to ensure serializer gets updated values
        # This is necessary because we modified the adjustments after prefetching them
        if hasattr(order, '_prefetched_objects_cache') and 'adjustments' in order._prefetched_objects_cache:
            del order._prefetched_objects_cache['adjustments']

        # Get all adjustments for reporting/display
        all_adjustments_total = OrderAdjustmentService.get_total_adjustments_amount(order)
        order.total_adjustments_amount = all_adjustments_total

        # Only apply one-off discounts to the calculation
        # Exclude:
        # - PRICE_OVERRIDE: already included in price_at_sale
        # - TAX_EXEMPT: handled separately by setting tax_total to 0
        # - FEE_EXEMPT: handled separately by setting surcharges_total to 0
        total_adjustments_amount = OrderAdjustmentService.get_total_adjustments_amount(
            order,
            exclude_types=[
                OrderAdjustment.AdjustmentType.PRICE_OVERRIDE,
                OrderAdjustment.AdjustmentType.TAX_EXEMPT,
                OrderAdjustment.AdjustmentType.FEE_EXEMPT,
            ]
        )

        # 4. Calculate post-discount-and-adjustment subtotal
        post_discount_subtotal = order.subtotal - order.total_discounts_amount + total_adjustments_amount

        # 4. Surcharges are NOT calculated here - only during payment processing
        # Fee exemptions are checked during payment, not here
        order.surcharges_total = Decimal("0.00")

        # 5. Calculate tax (delegated to calculator with discount-aware logic)
        # Check if there's an ORDER-LEVEL tax exemption - if so, tax should be $0
        # Note: Item-level tax exemptions are handled in the calculator
        has_tax_exemption = order.adjustments.filter(
            adjustment_type=OrderAdjustment.AdjustmentType.TAX_EXEMPT,
            order_item__isnull=True  # Only order-level exemptions
        ).exists()

        if has_tax_exemption:
            order.tax_total = Decimal("0.00")
        else:
            order.tax_total = calculator.calculate_item_level_tax(post_discount_subtotal)

        # 6. Calculate grand total (delegated to calculator)
        # Note: Calculator already applies discounts internally
        order.grand_total = post_discount_subtotal + order.tax_total

        order.save(
            update_fields=[
                "subtotal",
                "total_discounts_amount",
                "total_adjustments_amount",
                "surcharges_total",
                "tax_total",
                "grand_total",
                "updated_at",
            ]
        )

        elapsed_ms = (time.monotonic() - start_time) * 1000
        discount_count = len(applied_discounts)
        adjustment_count = order.adjustments.count()
        logger.info(
            "OrderCalculationService.recalculate_order_totals order_id=%s items=%d discounts=%d adjustments=%d elapsed_ms=%.2f (DRY via OrderCalculator)",
            order.id,
            item_count,
            discount_count,
            adjustment_count,
            elapsed_ms,
        )

        # Refresh items to get updated tax_amount values from bulk_update
        # The items relationship is cached, so we need to invalidate it
        if hasattr(order, '_prefetched_objects_cache') and 'items' in order._prefetched_objects_cache:
            del order._prefetched_objects_cache['items']

        # Also clear the Django ORM cache for the items relationship
        if 'items' in order.__dict__:
            del order.__dict__['items']

        return order

    @staticmethod
    @transaction.atomic
    def recalculate_in_progress_orders():
        """
        Recalculates totals for all in-progress orders when configuration changes.
        This ensures tax rates and surcharges are applied consistently across all orders.
        """
        from orders.models import Order

        # Import app_settings locally to ensure we always get the fresh configuration
        from settings.config import app_settings

        in_progress_orders = Order.objects.filter(
            status__in=[Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]
        )

        count = 0
        for order in in_progress_orders:
            old_grand_total = order.grand_total
            OrderCalculationService.recalculate_order_totals(order)
            new_grand_total = order.grand_total

            if old_grand_total != new_grand_total:
                count += 1
                logger.info(f"Order #{order.id}: Grand total updated due to configuration change")

        logger.info(f"Recalculated {count} in-progress orders due to configuration change")
        return count
