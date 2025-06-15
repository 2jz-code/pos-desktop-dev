from .models import Discount
from .strategies import (
    DiscountStrategy,
    OrderPercentageDiscountStrategy,
    OrderFixedAmountDiscountStrategy,
    ProductPercentageDiscountStrategy,
    ProductFixedAmountDiscountStrategy,
    CategoryPercentageDiscountStrategy,
    CategoryFixedAmountDiscountStrategy,
    BuyXGetYDiscountStrategy,
)


class DiscountStrategyFactory:
    """
    Factory for creating a discount strategy based on the discount's properties.
    """

    # Maps (scope, type) to a specific strategy class
    _strategies = {
        (
            Discount.DiscountScope.ORDER,
            Discount.DiscountType.PERCENTAGE,
        ): OrderPercentageDiscountStrategy,
        (
            Discount.DiscountScope.ORDER,
            Discount.DiscountType.FIXED_AMOUNT,
        ): OrderFixedAmountDiscountStrategy,
        (
            Discount.DiscountScope.PRODUCT,
            Discount.DiscountType.PERCENTAGE,
        ): ProductPercentageDiscountStrategy,
        (
            Discount.DiscountScope.PRODUCT,
            Discount.DiscountType.FIXED_AMOUNT,
        ): ProductFixedAmountDiscountStrategy,
        (
            Discount.DiscountScope.CATEGORY,
            Discount.DiscountType.PERCENTAGE,
        ): CategoryPercentageDiscountStrategy,
        (
            Discount.DiscountScope.CATEGORY,
            Discount.DiscountType.FIXED_AMOUNT,
        ): CategoryFixedAmountDiscountStrategy,
        (
            Discount.DiscountScope.PRODUCT,
            Discount.DiscountType.BUY_X_GET_Y,
        ): BuyXGetYDiscountStrategy,
    }

    @staticmethod
    def get_strategy(discount: Discount) -> DiscountStrategy:
        """
        Selects and returns the appropriate strategy instance.
        """
        strategy_class = DiscountStrategyFactory._strategies.get(
            (discount.scope, discount.type)
        )

        if strategy_class:
            return strategy_class()

        raise NotImplementedError(
            f"No strategy implemented for discount type '{discount.type}' "
            f"and scope '{discount.scope}'"
        )
