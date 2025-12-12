"""
Unit conversion service for COGS.

Handles converting quantities between units, including product-specific conversions.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from measurements.models import Unit
from measurements.services import UNIT_STRING_MAPPINGS
from cogs.models import UnitConversion
from cogs.exceptions import ConversionError, UnitMappingError


class ConversionService:
    """
    Service for converting quantities between units.

    Supports:
    - Generic conversions (applicable to all products)
    - Product-specific conversions (override generic)
    - Bi-directional conversion (will invert multiplier if needed)
    - String-to-Unit mapping for legacy RecipeItem.unit fields
    """

    def __init__(self, tenant):
        self.tenant = tenant
        self._conversion_cache = {}
        self._unit_cache = {}

    def map_string_to_unit(self, unit_string: str) -> Optional[Unit]:
        """
        Map a unit string (e.g., from RecipeItem.unit) to a Unit model instance.

        Args:
            unit_string: The unit string to map (e.g., "grams", "oz", "each")

        Returns:
            Unit instance if found, None otherwise.
        """
        if not unit_string:
            return None

        # Normalize the string
        normalized = unit_string.strip().lower()

        # Check cache first
        cache_key = f"unit_str:{normalized}"
        if cache_key in self._unit_cache:
            return self._unit_cache[cache_key]

        # Try to map to canonical code
        canonical_code = UNIT_STRING_MAPPINGS.get(normalized)

        if canonical_code:
            # Look up unit by canonical code (units are global, no tenant filter)
            unit = Unit.objects.filter(code=canonical_code).first()
        else:
            # Try direct lookup by code or name (units are global)
            unit = Unit.objects.filter(code__iexact=normalized).first()

            if not unit:
                unit = Unit.objects.filter(name__iexact=normalized).first()

        self._unit_cache[cache_key] = unit
        return unit

    def get_unit_by_code(self, code: str) -> Optional[Unit]:
        """
        Get a unit by its code.

        Args:
            code: The unit code (e.g., "g", "kg")

        Returns:
            Unit instance if found, None otherwise.
        """
        cache_key = f"unit_code:{code}"
        if cache_key in self._unit_cache:
            return self._unit_cache[cache_key]

        # Units are global, no tenant filter
        unit = Unit.objects.filter(code=code).first()

        self._unit_cache[cache_key] = unit
        return unit

    def convert(
        self,
        quantity: Decimal,
        from_unit: Unit,
        to_unit: Unit,
        product=None,
        precision: int = 4
    ) -> Decimal:
        """
        Convert a quantity from one unit to another.

        Args:
            quantity: The quantity to convert.
            from_unit: The source unit.
            to_unit: The target unit.
            product: Optional product for product-specific conversions.
            precision: Decimal places to round to (default 4).

        Returns:
            The converted quantity.

        Raises:
            ConversionError: If no conversion path is found.
        """
        # Same unit, no conversion needed
        if from_unit.id == to_unit.id:
            return quantity

        # Try to find conversion
        multiplier = self._find_conversion_multiplier(from_unit, to_unit, product)

        if multiplier is None:
            raise ConversionError(
                from_unit=from_unit.code,
                to_unit=to_unit.code,
                product=product
            )

        result = quantity * multiplier
        return result.quantize(Decimal(f"0.{'0' * precision}"), rounding=ROUND_HALF_UP)

    def _find_conversion_multiplier(
        self,
        from_unit: Unit,
        to_unit: Unit,
        product=None
    ) -> Optional[Decimal]:
        """
        Find the conversion multiplier between two units.

        Checks:
        1. Product-specific conversion (if product provided)
        2. Generic conversion
        3. Inverse of either (reciprocal multiplier)

        Args:
            from_unit: The source unit.
            to_unit: The target unit.
            product: Optional product for product-specific conversions.

        Returns:
            The multiplier, or None if not found.
        """
        # Cache key
        product_id = product.id if product else None
        cache_key = (from_unit.id, to_unit.id, product_id)

        if cache_key in self._conversion_cache:
            return self._conversion_cache[cache_key]

        multiplier = None

        # All conversions are tenant-scoped - explicitly filter by tenant
        # to avoid relying on thread-local tenant (safe for Celery, scripts, etc.)
        base_qs = UnitConversion.all_objects.filter(
            tenant=self.tenant,
            is_active=True,
        )

        # 1. Try product-specific conversion first
        if product:
            conversion = base_qs.filter(
                product=product,
                from_unit=from_unit,
                to_unit=to_unit,
            ).first()
            if conversion:
                multiplier = conversion.multiplier

            # Try inverse product-specific
            if multiplier is None:
                inverse = base_qs.filter(
                    product=product,
                    from_unit=to_unit,
                    to_unit=from_unit,
                ).first()
                if inverse and inverse.multiplier != 0:
                    multiplier = Decimal("1") / inverse.multiplier

        # 2. Try generic conversion for this tenant
        if multiplier is None:
            conversion = base_qs.filter(
                product__isnull=True,
                from_unit=from_unit,
                to_unit=to_unit,
            ).first()
            if conversion:
                multiplier = conversion.multiplier

        # 3. Try inverse generic conversion
        if multiplier is None:
            inverse = base_qs.filter(
                product__isnull=True,
                from_unit=to_unit,
                to_unit=from_unit,
            ).first()
            if inverse and inverse.multiplier != 0:
                multiplier = Decimal("1") / inverse.multiplier

        # Cache the result
        self._conversion_cache[cache_key] = multiplier
        return multiplier

    def can_convert(self, from_unit: Unit, to_unit: Unit, product=None) -> bool:
        """
        Check if conversion between two units is possible.

        Args:
            from_unit: The source unit.
            to_unit: The target unit.
            product: Optional product for product-specific conversions.

        Returns:
            True if conversion is possible, False otherwise.
        """
        if from_unit.id == to_unit.id:
            return True

        return self._find_conversion_multiplier(from_unit, to_unit, product) is not None

    def convert_from_string(
        self,
        quantity: Decimal,
        from_unit_string: str,
        to_unit: Unit,
        product=None,
        precision: int = 4
    ) -> Decimal:
        """
        Convert a quantity using a unit string for the source.

        Convenience method for converting from RecipeItem.unit CharField values.

        Args:
            quantity: The quantity to convert.
            from_unit_string: The source unit as a string (e.g., "grams").
            to_unit: The target Unit instance.
            product: Optional product for product-specific conversions.
            precision: Decimal places to round to.

        Returns:
            The converted quantity.

        Raises:
            UnitMappingError: If the unit string cannot be mapped.
            ConversionError: If no conversion path is found.
        """
        from_unit = self.map_string_to_unit(from_unit_string)

        if not from_unit:
            raise UnitMappingError(from_unit_string)

        return self.convert(quantity, from_unit, to_unit, product, precision)
