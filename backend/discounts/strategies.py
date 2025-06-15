# In desktop-combined/backend/discounts/strategies.py

from abc import ABC, abstractmethod
from decimal import Decimal
from orders.models import Order
from .models import Discount


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
            print(
                f"[Strategy Log] Order subtotal {order.subtotal} is less than minimum {discount.min_purchase_amount}"
            )
            return Decimal("0.00")

        subtotal = Decimal(order.subtotal)
        if not discount.type == Discount.DiscountType.PERCENTAGE or subtotal <= 0:
            return Decimal("0.00")

        discount_percentage = Decimal(discount.value) / Decimal("100")
        discount_amount = subtotal * discount_percentage
        return discount_amount.quantize(Decimal("0.01"))


class OrderFixedAmountDiscountStrategy(DiscountStrategy):
    """Applies a fixed amount discount to the entire order's subtotal."""

    def apply(self, order: Order, discount: Discount) -> Decimal:
        # --- FIX: Check min_purchase_amount before applying discount ---
        if (
            discount.min_purchase_amount
            and order.subtotal < discount.min_purchase_amount
        ):
            print(
                f"[Strategy Log] Order subtotal {order.subtotal} is less than minimum {discount.min_purchase_amount}"
            )
            return Decimal("0.00")

        subtotal = Decimal(order.subtotal)
        if not discount.type == Discount.DiscountType.FIXED_AMOUNT or subtotal <= 0:
            return Decimal("0.00")

        discount_amount = min(subtotal, Decimal(discount.value))
        return discount_amount.quantize(Decimal("0.01"))


class ProductPercentageDiscountStrategy(DiscountStrategy):
    """Applies a percentage discount to specific products in the order."""

    def apply(self, order: Order, discount: Discount) -> Decimal:
        total_discount = Decimal("0.00")
        applicable_products_ids = list(
            discount.applicable_products.values_list("id", flat=True)
        )

        # --- DIAGNOSTIC LOGGING ---
        print(f"[Strategy Log] Checking for Product Discount: '{discount.name}'")
        print(
            f"[Strategy Log] Discount applies to product IDs: {applicable_products_ids}"
        )

        if not applicable_products_ids:
            return total_discount

        for item in order.items.all():
            print(
                f"[Strategy Log]   - Checking item: '{item.product.name}' (Product ID: {item.product.id})"
            )
            if item.product.id in applicable_products_ids:
                print(f"[Strategy Log]     ✅ MATCH FOUND! Applying discount.")
                discount_percentage = Decimal(discount.value) / Decimal("100")
                total_discount += item.total_price * discount_percentage

        print(f"[Strategy Log] Total calculated product discount: {total_discount}")
        return total_discount.quantize(Decimal("0.01"))


class CategoryPercentageDiscountStrategy(DiscountStrategy):
    """Applies a percentage discount to products of specific categories in the order."""

    def apply(self, order: Order, discount: Discount) -> Decimal:
        total_discount = Decimal("0.00")
        applicable_category_ids = list(
            discount.applicable_categories.values_list("id", flat=True)
        )

        # --- DIAGNOSTIC LOGGING ---
        print(f"[Strategy Log] Checking for Category Discount: '{discount.name}'")
        print(
            f"[Strategy Log] Discount applies to category IDs: {applicable_category_ids}"
        )

        if not applicable_category_ids:
            return total_discount

        for item in order.items.all():
            print(
                f"[Strategy Log]   - Checking item: '{item.product.name}' (Category ID: {item.product.category_id})"
            )
            if item.product.category_id in applicable_category_ids:
                print(f"[Strategy Log]     ✅ MATCH FOUND! Applying discount.")
                discount_percentage = Decimal(discount.value) / Decimal("100")
                total_discount += item.total_price * discount_percentage

        print(f"[Strategy Log] Total calculated category discount: {total_discount}")
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
        for item in order.items.filter(product_id__in=applicable_products_ids):
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
        for item in order.items.filter(
            product__category_id__in=applicable_category_ids
        ):
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
        for item in order.items.filter(product_id__in=applicable_product_ids):
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
