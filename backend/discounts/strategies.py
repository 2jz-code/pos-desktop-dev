# In desktop-combined/backend/discounts/strategies.py

from abc import ABC, abstractmethod
from decimal import Decimal
from orders.models import Order
from .models import Discount
import logging

logger = logging.getLogger(__name__)


class DiscountStrategy(ABC):
    """The interface for a discount strategy."""

    @abstractmethod
    def apply(self, order: Order, discount: Discount) -> Decimal:
        pass

    def remove(self, order: Order, discount: Discount):
        pass


class OrderPercentageDiscountStrategy(DiscountStrategy):
    """Applies a percentage-based discount to the entire order's subtotal."""

    def apply(self, order: Order, discount: Discount) -> Decimal:
        # --- FIX: Check min_purchase_amount before applying discount ---
        if (
            discount.min_purchase_amount
            and order.subtotal < discount.min_purchase_amount
        ):
            logger.debug("Order subtotal below discount minimum threshold")
            return Decimal("0.00")

        # Calculate subtotal only from items that allow discounts
        discountable_subtotal = Decimal("0.00")
        for item in order.items.select_related('product', 'product__product_type').all():
            # Skip items with product types that exclude discounts
            if item.product and item.product.product_type and item.product.product_type.exclude_from_discounts:
                continue
            discountable_subtotal += item.total_price

        if not discount.type == Discount.DiscountType.PERCENTAGE or discountable_subtotal <= 0:
            return Decimal("0.00")

        discount_percentage = Decimal(discount.value) / Decimal("100")
        discount_amount = discountable_subtotal * discount_percentage
        return discount_amount.quantize(Decimal("0.01"))


class OrderFixedAmountDiscountStrategy(DiscountStrategy):
    """Applies a fixed amount discount to the entire order's subtotal."""

    def apply(self, order: Order, discount: Discount) -> Decimal:
        # --- FIX: Check min_purchase_amount before applying discount ---
        if (
            discount.min_purchase_amount
            and order.subtotal < discount.min_purchase_amount
        ):
            logger.debug("Order subtotal below discount minimum threshold")
            return Decimal("0.00")

        # Calculate subtotal only from items that allow discounts
        discountable_subtotal = Decimal("0.00")
        for item in order.items.select_related('product', 'product__product_type').all():
            # Skip items with product types that exclude discounts
            if item.product and item.product.product_type and item.product.product_type.exclude_from_discounts:
                continue
            discountable_subtotal += item.total_price

        if not discount.type == Discount.DiscountType.FIXED_AMOUNT or discountable_subtotal <= 0:
            return Decimal("0.00")

        discount_amount = min(discountable_subtotal, Decimal(discount.value))
        return discount_amount.quantize(Decimal("0.01"))


class ProductPercentageDiscountStrategy(DiscountStrategy):
    """Applies a percentage discount to specific products in the order."""

    def apply(self, order: Order, discount: Discount) -> Decimal:
        total_discount = Decimal("0.00")
        applicable_products_ids = list(
            discount.applicable_products.values_list("id", flat=True)
        )

        # --- DIAGNOSTIC LOGGING ---
        logger.debug(f"Checking product discount for discount_id: {discount.id}")

        if not applicable_products_ids:
            return total_discount

        # FIX: Use select_related to prevent N+1 queries when accessing item.product.name
        for item in order.items.select_related('product', 'product__product_type').all():
            if item.product.id in applicable_products_ids:
                # Check if the product type excludes this product from discounts
                if item.product.product_type and item.product.product_type.exclude_from_discounts:
                    continue

                discount_percentage = Decimal(discount.value) / Decimal("100")
                total_discount += item.total_price * discount_percentage

        logger.debug("Product discount calculation completed")
        return total_discount.quantize(Decimal("0.01"))


class CategoryPercentageDiscountStrategy(DiscountStrategy):
    """Applies a percentage discount to products of specific categories in the order."""

    def apply(self, order: Order, discount: Discount) -> Decimal:
        total_discount = Decimal("0.00")
        applicable_category_ids = list(
            discount.applicable_categories.values_list("id", flat=True)
        )

        # --- DIAGNOSTIC LOGGING ---
        logger.debug(f"Checking category discount for discount_id: {discount.id}")

        if not applicable_category_ids:
            return total_discount

        # FIX: Use select_related to prevent N+1 queries when accessing item.product.name and item.product.category_id
        for item in order.items.select_related('product', 'product__category', 'product__product_type').all():
            if item.product.category_id in applicable_category_ids:
                # Check if the product type excludes this product from discounts
                if item.product.product_type and item.product.product_type.exclude_from_discounts:
                    continue

                discount_percentage = Decimal(discount.value) / Decimal("100")
                total_discount += item.total_price * discount_percentage

        logger.debug("Category discount calculation completed")
        return total_discount.quantize(Decimal("0.01"))


# --- Other strategies (Fixed Amount, BOGO) would have similar logging ---
# (Keeping them brief for this example)


class ProductFixedAmountDiscountStrategy(DiscountStrategy):
    def apply(self, order: Order, discount: Discount) -> Decimal:
        # (Add similar logging as the percentage version if needed)
        total_discount = Decimal("0.00")
        applicable_products_ids = list(
            discount.applicable_products.values_list("id", flat=True)
        )
        if not applicable_products_ids:
            return total_discount
        # FIX: Add select_related to prevent N+1 queries
        for item in order.items.filter(product_id__in=applicable_products_ids).select_related('product', 'product__product_type'):
            # Check if the product type excludes this product from discounts
            if item.product.product_type and item.product.product_type.exclude_from_discounts:
                continue

            item_discount = min(item.total_price, Decimal(discount.value))
            total_discount += item_discount
        return total_discount.quantize(Decimal("0.01"))


class CategoryFixedAmountDiscountStrategy(DiscountStrategy):
    def apply(self, order: Order, discount: Discount) -> Decimal:
        # (Add similar logging as the percentage version if needed)
        total_discount = Decimal("0.00")
        applicable_category_ids = list(
            discount.applicable_categories.values_list("id", flat=True)
        )
        if not applicable_category_ids:
            return total_discount
        # FIX: Add select_related to prevent N+1 queries
        for item in order.items.filter(
            product__category_id__in=applicable_category_ids
        ).select_related('product', 'product__category', 'product__product_type'):
            # Check if the product type excludes this product from discounts
            if item.product.product_type and item.product.product_type.exclude_from_discounts:
                continue

            item_discount = min(item.total_price, Decimal(discount.value))
            total_discount += item_discount
        return total_discount.quantize(Decimal("0.01"))


class BuyXGetYDiscountStrategy(DiscountStrategy):
    """
    Applies a 'Buy X, Get Y Free' discount to specific products.
    For every X items purchased from a list of applicable products, Y items are free.
    It always discounts the cheapest items.
    """

    def apply(self, order: Order, discount: Discount) -> Decimal:
        total_discount = Decimal("0.00")

        # Ensure the discount is properly configured
        if not all(
            [
                discount.buy_quantity,
                discount.get_quantity,
                discount.buy_quantity > 0,
                discount.get_quantity > 0,
            ]
        ):
            return total_discount

        applicable_product_ids = list(
            discount.applicable_products.values_list("id", flat=True)
        )
        if not applicable_product_ids:
            return total_discount

        # Create a flat list of all eligible items in the cart, respecting their quantities
        eligible_items_prices = []
        # FIX: Add select_related to prevent N+1 queries when accessing item.price_at_sale
        for item in order.items.filter(product_id__in=applicable_product_ids).select_related('product'):
            for _ in range(item.quantity):
                eligible_items_prices.append(item.price_at_sale)

        # Sort by price to ensure we always discount the cheapest items first
        eligible_items_prices.sort()

        group_size = discount.buy_quantity + discount.get_quantity
        num_of_groups = len(eligible_items_prices) // group_size

        if num_of_groups == 0:
            return total_discount  # Not enough items to qualify for the discount

        # For each group of (X+Y) items, we discount the Y cheapest ones.
        # Since the entire list is sorted, we can just take the first Y items from the N groups.
        num_items_to_discount = num_of_groups * discount.get_quantity

        # The discount amount is the sum of the prices of the items to be discounted.
        for i in range(num_items_to_discount):
            total_discount += eligible_items_prices[i]

        return total_discount.quantize(Decimal("0.01"))
