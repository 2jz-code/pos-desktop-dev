from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Any, Optional, Iterable

from .models import ProductType, Tax


@dataclass(frozen=True)
class PolicyResult:
    valid: bool
    warning: Optional[str] = None
    error: Optional[str] = None


class ProductTypePolicy:
    """
    Centralized policy logic for product types.
    Note: This is scaffolding for Phase 1. Integration and inventory lookups happen in later phases.
    """

    @staticmethod
    def get_applicable_taxes(product) -> Iterable[Tax]:
        """
        Resolve taxes for a product: prefer product.taxes; otherwise fall back to product type defaults.
        """
        if hasattr(product, "taxes") and product.taxes.exists():
            return product.taxes.all()
        pt: ProductType = product.product_type
        return pt.default_taxes.all()

    @staticmethod
    def validate_stock(product, quantity: int, operation: str = "deduct") -> PolicyResult:
        """
        Validate stock according to product type policy.
        This skeleton does not consult inventory; it only expresses enforcement mode.
        Real stock checks will be wired in Phase 2.
        """
        pt: ProductType = product.product_type

        # No tracking → always valid
        if pt.inventory_behavior == ProductType.InventoryBehavior.NONE:
            return PolicyResult(True)

        # Negative stock allowed → never block
        if pt.allow_negative_stock or pt.stock_enforcement == ProductType.StockEnforcement.IGNORE:
            return PolicyResult(True)

        # WARN means allow but return a warning placeholder
        if pt.stock_enforcement == ProductType.StockEnforcement.WARN:
            return PolicyResult(True, warning="Stock may be insufficient (policy: warn)")

        # BLOCK in skeleton: return invalid placeholder; real check in Phase 2
        if pt.stock_enforcement == ProductType.StockEnforcement.BLOCK:
            return PolicyResult(False, error="Insufficient stock (policy: block)")

        return PolicyResult(True)

    @staticmethod
    def decide_from_availability(product, insufficient: bool, context: Dict[str, Any] | None = None) -> PolicyResult:
        """
        Given a boolean indicating insufficient stock, decide per type policy
        whether to allow (possibly warn) or block.
        This does not perform stock math; callers supply insufficiency.
        """
        pt: ProductType = product.product_type
        if not insufficient:
            return PolicyResult(True)

        # If negative stock is allowed or ignoring enforcement, always allow
        if pt.allow_negative_stock or pt.stock_enforcement == ProductType.StockEnforcement.IGNORE:
            return PolicyResult(True)

        if pt.stock_enforcement == ProductType.StockEnforcement.WARN:
            return PolicyResult(True, warning="Low/insufficient stock (policy: warn)")

        # BLOCK
        return PolicyResult(False, error="Insufficient stock (policy: block)")

    @staticmethod
    def apply_pricing(product, base_price: Decimal, context: Dict[str, Any]) -> Decimal:
        """
        Calculate price according to product type pricing policy.
        Phase 1: FIXED returns base_price. COST_PLUS defers until cost is available.
        """
        pt: ProductType = product.product_type
        if pt.pricing_method == ProductType.PricingMethod.FIXED:
            return base_price

        if pt.pricing_method == ProductType.PricingMethod.COST_PLUS:
            # TODO(Phase 4): Look up item cost and apply markup; fallback to base_price
            return base_price

        return base_price

