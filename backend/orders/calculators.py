"""
Order and Cart financial calculators (DRY architecture).

This module provides shared calculation logic for both Cart and Order models,
ensuring consistent financial calculations across the application.

Design Pattern: Strategy Pattern
- OrderCalculator: Base calculator for subtotal, tax, totals
- DiscountCalculator: Handles discount application (integrates with discounts app)

Usage:
    # For Cart (preview)
    from orders.calculators import OrderCalculator
    calculator = OrderCalculator(cart)
    totals = calculator.calculate_totals()

    # For Order (final)
    calculator = OrderCalculator(order)
    totals = calculator.calculate_totals()
"""

from decimal import Decimal
from typing import Union, Dict, Any, List, Optional
from django.db.models import QuerySet

# Import money precision helpers
from payments.money import to_minor, from_minor, quantize


class OrderCalculator:
    """
    Unified calculator for Cart and Order financial calculations.

    This ensures DRY principle - both Cart and Order use identical logic
    for calculating subtotals, taxes, and grand totals.

    Supports both Cart and Order models via duck typing:
    - Both have .items (related manager)
    - Both have .store_location (FK, nullable for Cart)
    - Cart items have get_total_price()
    - Order items have total_price property
    """

    def __init__(self, source: Union['Cart', 'Order']):
        """
        Initialize calculator with either a Cart or Order.

        Args:
            source: Cart or Order instance
        """
        self.source = source
        self._is_cart = self._detect_source_type()

    def _detect_source_type(self) -> bool:
        """Detect if source is Cart or Order."""
        return self.source.__class__.__name__ == 'Cart'

    def calculate_subtotal(self) -> Decimal:
        """
        Calculate subtotal from all items.

        For Cart: Calls item.get_total_price() (dynamic prices)
        For Order: Accesses item.total_price (snapshot prices)

        Returns:
            Decimal: Subtotal (before discounts and tax)
        """
        items = self.source.items.all()

        if self._is_cart:
            # Cart items have method: get_total_price()
            # Start with Decimal('0.00') to ensure return type is always Decimal
            return sum((item.get_total_price() for item in items), Decimal('0.00'))
        else:
            # Order items have property: total_price
            # Start with Decimal('0.00') to ensure return type is always Decimal
            return sum((item.total_price for item in items), Decimal('0.00'))

    def calculate_tax(self, post_discount_subtotal: Optional[Decimal] = None) -> Decimal:
        """
        Calculate tax based on location's tax rate.

        Args:
            post_discount_subtotal: Optional subtotal after discounts applied.
                                   If not provided, uses full subtotal.

        Returns:
            Decimal: Tax amount (0.00 if no location set)

        Note:
            For Cart: location may be None (returns 0)
            For Order: location is always set (required field)
        """
        if not self.source.store_location:
            return Decimal('0.00')

        # Use post-discount subtotal if provided, otherwise full subtotal
        taxable_amount = post_discount_subtotal if post_discount_subtotal is not None else self.calculate_subtotal()

        tax_rate = self.source.store_location.get_effective_tax_rate()
        return (taxable_amount * tax_rate).quantize(Decimal('0.01'))

    def calculate_item_level_tax(self, post_discount_subtotal: Optional[Decimal] = None) -> Decimal:
        """
        Calculate tax with item-level precision using minor-unit arithmetic.

        For NEW orders (post-migration):
        - Computes tax PER LINE in minor units
        - Stores tax_amount on each OrderItem
        - Aggregates to Order.tax_total with ZERO penny drift

        For Carts or preview:
        - Calculates tax but doesn't store (no OrderItem.id yet)

        Args:
            post_discount_subtotal: Optional subtotal after discounts.

        Returns:
            Decimal: Total tax across all items (sum of per-line taxes)
        """
        if not self.source.store_location:
            return Decimal('0.00')

        subtotal = self.calculate_subtotal()
        if subtotal == 0:
            return Decimal('0.00')

        # Get currency from order/cart
        currency = getattr(self.source, 'currency', 'USD') or 'USD'

        # Calculate proportional discount rate if discounts applied
        proportional_discount_rate = Decimal('0.0')
        if post_discount_subtotal is not None and post_discount_subtotal < subtotal:
            discount_amount = subtotal - post_discount_subtotal
            proportional_discount_rate = discount_amount / subtotal

        items = self.source.items.all()
        line_tax_amounts_minor = []
        items_to_update = []  # Collect items for bulk update

        for item in items:
            # Get item price (method vs property based on source type)
            if self._is_cart:
                item_price = item.get_total_price()
            else:
                item_price = item.total_price

            # Apply proportional discount to this item
            discounted_item_price = item_price * (Decimal('1.0') - proportional_discount_rate)

            # Quantize BEFORE converting to minor units (CRITICAL)
            discounted_item_price_quantized = quantize(currency, discounted_item_price)

            # Get tax rate for this item's product
            product = item.product

            # Check if product uses custom tax rate
            if hasattr(product, 'tax') and product.tax:
                tax_rate = product.tax.rate
            else:
                # Use location's default tax rate
                tax_rate = self.source.store_location.get_effective_tax_rate()

            # Calculate tax on QUANTIZED price (prevents drift)
            item_tax_decimal = discounted_item_price_quantized * tax_rate
            item_tax_quantized = quantize(currency, item_tax_decimal)
            item_tax_minor = to_minor(currency, item_tax_quantized)

            # Store tax_amount on OrderItem (for Orders, not Carts)
            if not self._is_cart and hasattr(item, 'id') and item.id:
                # Set the tax amount but don't save yet (collect for bulk update)
                item.tax_amount = from_minor(currency, item_tax_minor)
                items_to_update.append(item)

            line_tax_amounts_minor.append(item_tax_minor)

        # Bulk update all items with their tax amounts (more efficient + avoids cache issues)
        if items_to_update:
            from orders.models import OrderItem
            OrderItem.objects.bulk_update(items_to_update, ['tax_amount'])

        # Aggregate: sum of minor units, then convert back to Decimal
        total_tax_minor = sum(line_tax_amounts_minor)
        tax_total = from_minor(currency, total_tax_minor)

        # Invariant guaranteed: sum(item.tax_amount) == tax_total
        return tax_total

    def calculate_discounts(self) -> Decimal:
        """
        Calculate total discount amount.

        For Cart: Need to apply discount codes (future implementation)
        For Order: Sum existing OrderDiscount amounts

        Returns:
            Decimal: Total discount amount
        """
        if self._is_cart:
            # TODO: Implement discount preview for Cart
            # For now, Cart doesn't support discount preview
            # Future: Add cart.discount_code field and calculate here
            return Decimal('0.00')
        else:
            # Order has OrderDiscount through relationship
            from orders.models import OrderDiscount
            order_discounts = OrderDiscount.objects.filter(order=self.source)
            # Start with Decimal('0.00') to ensure return type is always Decimal
            return sum((od.amount for od in order_discounts), Decimal('0.00'))

    def calculate_grand_total(self, include_discounts: bool = True) -> Decimal:
        """
        Calculate grand total (FOOD COST ONLY - no tips/surcharges).

        Formula: subtotal - discounts + tax

        Args:
            include_discounts: Whether to apply discounts (default: True)

        Returns:
            Decimal: Grand total (what customer pays for food)

        Note:
            This does NOT include:
            - Tips (stored in PaymentTransaction)
            - Surcharges (calculated per payment method)
            - Those are payment-level costs, not order-level costs
        """
        subtotal = self.calculate_subtotal()

        if include_discounts:
            discounts = self.calculate_discounts()
            post_discount_subtotal = subtotal - discounts
        else:
            discounts = Decimal('0.00')
            post_discount_subtotal = subtotal

        # Calculate tax on post-discount subtotal
        tax = self.calculate_item_level_tax(post_discount_subtotal)

        grand_total = post_discount_subtotal + tax
        return grand_total.quantize(Decimal('0.01'))

    def calculate_totals(self) -> Dict[str, Any]:
        """
        Calculate all totals in one pass.

        Returns:
            dict: {
                'subtotal': Decimal,
                'discount_total': Decimal,
                'tax_total': Decimal,
                'grand_total': Decimal,
                'item_count': int,
                'has_location': bool
            }
        """
        subtotal = self.calculate_subtotal()
        discount_total = self.calculate_discounts()
        post_discount_subtotal = subtotal - discount_total
        tax_total = self.calculate_item_level_tax(post_discount_subtotal)
        grand_total = post_discount_subtotal + tax_total

        # Count items (sum quantities)
        items = self.source.items.all()
        item_count = sum(item.quantity for item in items)

        return {
            'subtotal': subtotal.quantize(Decimal('0.01')),
            'discount_total': discount_total.quantize(Decimal('0.01')),
            'tax_total': tax_total.quantize(Decimal('0.01')),
            'grand_total': grand_total.quantize(Decimal('0.01')),
            'item_count': item_count,
            'has_location': bool(self.source.store_location),
        }


class DiscountCalculator:
    """
    Calculator for applying discounts to Cart or Order.

    This integrates with the discounts app to provide consistent
    discount calculation logic for both preview (Cart) and final (Order).

    Future implementation:
    - Support discount code preview for Cart
    - Integrate with DiscountService from discounts app
    - Handle discount validation and application
    """

    def __init__(self, source: Union['Cart', 'Order']):
        """
        Initialize discount calculator.

        Args:
            source: Cart or Order instance
        """
        self.source = source

    def apply_discount_code(self, discount_code: str) -> Decimal:
        """
        Apply a discount code and calculate the discount amount.

        Args:
            discount_code: Discount code to apply

        Returns:
            Decimal: Discount amount

        Raises:
            ValueError: If discount code is invalid or not applicable

        TODO: Implement discount code application
        """
        # TODO: Integrate with discounts.services.DiscountService
        # For now, return 0
        return Decimal('0.00')

    def calculate_discount_amount(self, discount: 'Discount') -> Decimal:
        """
        Calculate discount amount for a specific discount.

        Args:
            discount: Discount model instance

        Returns:
            Decimal: Calculated discount amount

        TODO: Implement discount calculation using DiscountService
        """
        # TODO: Use discounts.factories.DiscountStrategyFactory
        # to get the appropriate strategy and calculate discount
        return Decimal('0.00')
