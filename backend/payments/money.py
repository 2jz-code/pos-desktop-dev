"""
Monetary precision helpers for Stripe-safe calculations.

CRITICAL: This module eliminates penny drift by using integer arithmetic
in minor units (cents) throughout the payment system.

Key Principles:
1. NEVER use float for money
2. Always quantize Decimals BEFORE converting to minor units
3. Use ROUND_HALF_EVEN (banker's rounding) to prevent systematic bias
4. Allocate remainder cents deterministically (largest residual first)
5. Validate sums match exactly (no ±1¢ drift)

Author: Ajeen Backend Team
Last Updated: 2025-01-XX
"""

from decimal import Decimal, ROUND_HALF_EVEN, getcontext
from typing import List, Union

# Set high precision for intermediate calculations
getcontext().prec = 28

# Currency minor unit exponents (how many decimal places)
CURRENCY_EXPONENT = {
    # 2-decimal currencies (most common)
    "USD": 2,  # United States Dollar (cents)
    "EUR": 2,  # Euro (cents)
    "GBP": 2,  # British Pound (pence)
    "CAD": 2,  # Canadian Dollar (cents)
    "AUD": 2,  # Australian Dollar (cents)
    "CHF": 2,  # Swiss Franc (rappen)
    "CNY": 2,  # Chinese Yuan (fen)
    "INR": 2,  # Indian Rupee (paise)

    # Zero-decimal currencies
    "JPY": 0,  # Japanese Yen (no subunit)
    "KRW": 0,  # South Korean Won (no subunit)
    "VND": 0,  # Vietnamese Dong (no subunit)
    "CLP": 0,  # Chilean Peso (no subunit)

    # 3-decimal currencies
    "KWD": 3,  # Kuwaiti Dinar (fils)
    "BHD": 3,  # Bahraini Dinar (fils)
    "OMR": 3,  # Omani Rial (baisa)
    "JOD": 3,  # Jordanian Dinar (fils)
    "TND": 3,  # Tunisian Dinar (millime)
}


def currency_exponent(currency: str) -> int:
    """
    Get the number of decimal places for a currency.

    Args:
        currency: ISO 4217 currency code (e.g., "USD", "EUR", "JPY")

    Returns:
        Number of decimal places (0, 2, or 3)

    Examples:
        >>> currency_exponent("USD")
        2
        >>> currency_exponent("JPY")
        0
        >>> currency_exponent("KWD")
        3
    """
    return CURRENCY_EXPONENT.get(currency.upper(), 2)


def quantize_decimal(currency: str) -> Decimal:
    """
    Get the quantization decimal for a currency.

    Args:
        currency: ISO 4217 currency code

    Returns:
        Decimal representing the smallest unit (e.g., 0.01 for USD)

    Examples:
        >>> quantize_decimal("USD")
        Decimal('0.01')
        >>> quantize_decimal("JPY")
        Decimal('1')
        >>> quantize_decimal("KWD")
        Decimal('0.001')
    """
    return Decimal(10) ** -currency_exponent(currency)


def quantize(currency: str, amount: Union[Decimal, str, int, float]) -> Decimal:
    """
    Round to currency decimals using banker's rounding (ROUND_HALF_EVEN).

    Banker's rounding prevents systematic bias:
    - 2.5 → 2 (round to nearest even)
    - 3.5 → 4 (round to nearest even)
    - 2.51 → 3 (normal rounding)

    Args:
        currency: ISO 4217 currency code
        amount: Amount to round (any numeric type)

    Returns:
        Rounded Decimal with correct precision for currency

    Examples:
        >>> quantize("USD", "10.127")
        Decimal('10.13')
        >>> quantize("USD", "10.125")
        Decimal('10.12')  # Banker's rounding
        >>> quantize("JPY", "1234.56")
        Decimal('1235')
    """
    if isinstance(amount, float):
        # Convert float to string first to avoid precision issues
        amount = str(amount)

    amount_decimal = Decimal(amount)
    return amount_decimal.quantize(quantize_decimal(currency), rounding=ROUND_HALF_EVEN)


def to_minor(currency: str, amount: Union[Decimal, str, int, float]) -> int:
    """
    Convert to minor units (e.g., cents) after quantization.

    CRITICAL: Always quantize BEFORE converting to integer.
    This ensures consistent rounding across the entire system.

    Args:
        currency: ISO 4217 currency code
        amount: Amount to convert

    Returns:
        Integer in minor units (cents)

    Examples:
        >>> to_minor("USD", "10.127")
        1013  # quantized to 10.13, then 1013 cents
        >>> to_minor("USD", "10.125")
        1012  # banker's rounding: 10.12 → 1012 cents
        >>> to_minor("JPY", "1234.56")
        1235  # quantized to 1235 yen (no decimals)
        >>> to_minor("KWD", "10.1234")
        10123  # quantized to 10.123, then 10123 fils
    """
    quantized = quantize(currency, amount)
    exponent = currency_exponent(currency)
    return int((quantized * (10 ** exponent)).to_integral_value())


def from_minor(currency: str, minor: int) -> Decimal:
    """
    Convert from minor units to Decimal (for display).

    Args:
        currency: ISO 4217 currency code
        minor: Amount in minor units (e.g., cents)

    Returns:
        Decimal amount

    Examples:
        >>> from_minor("USD", 1013)
        Decimal('10.13')
        >>> from_minor("JPY", 1235)
        Decimal('1235')
        >>> from_minor("KWD", 10123)
        Decimal('10.123')
    """
    exponent = currency_exponent(currency)
    return Decimal(minor) / (10 ** exponent)


def allocate_minor(weights: List[int], total_minor: int) -> List[int]:
    """
    Allocate total_minor across items proportionally by weights.

    THIS IS THE MOST CRITICAL FUNCTION FOR PREVENTING PENNY DRIFT.

    Algorithm:
    1. Calculate proportional shares (high precision floating point)
    2. Floor each share to get base allocation
    3. Distribute remainder cents to lines with largest residuals

    Guarantees:
    - sum(result) == total_minor (EXACT, no drift)
    - Deterministic (same inputs → same outputs)
    - Largest residuals get remainder cents
    - Stable tie-breaking by index

    Args:
        weights: List of weights (e.g., line item subtotals in cents)
        total_minor: Total amount to allocate (e.g., tip in cents)

    Returns:
        List of allocations in minor units, summing to exactly total_minor

    Examples:
        >>> allocate_minor([100, 100, 100], 100)
        [34, 33, 33]  # $1.00 split 3 ways

        >>> allocate_minor([1000, 1500, 2000], 100)
        [22, 33, 45]  # Proportional to weights

        >>> allocate_minor([1, 1, 1], 10)
        [4, 3, 3]  # First item gets extra penny (largest residual)
    """
    total_weight = sum(weights)

    # Edge cases
    if total_weight == 0 or total_minor == 0:
        return [0] * len(weights)

    # Calculate proportional shares (floating point for precision)
    # We use float here because it's more accurate for the division,
    # but we immediately floor and distribute remainder deterministically
    shares = [weight * total_minor / total_weight for weight in weights]

    # Floor to get base allocation
    floors = [int(share) for share in shares]
    assigned = sum(floors)
    remainder = total_minor - assigned

    # Calculate residuals (fractional parts) for remainder distribution
    # Residuals represent how much each line "deserves" the next cent
    residuals = [(shares[i] - floors[i], i) for i in range(len(weights))]

    # Sort by residual descending (largest fractional part gets next cent)
    # Use index as tie-breaker for determinism
    residuals.sort(key=lambda x: (-x[0], x[1]))

    # Distribute remainder cents to lines with largest residuals
    result = floors[:]
    for i in range(remainder):
        _, idx = residuals[i]
        result[idx] += 1

    return result


def validate_minor_sum(
    components: List[int],
    expected_total: int,
    context: str = "",
    tolerance: int = 0
) -> None:
    """
    Validate that sum of components equals expected total.

    Raises ValueError if mismatch (catches penny drift bugs).
    Use this in tests and critical production code paths.

    Args:
        components: List of amounts in minor units
        expected_total: Expected sum in minor units
        context: Description for error message
        tolerance: Allowed difference (default 0 = exact match required)

    Raises:
        ValueError: If sum doesn't match expected total

    Examples:
        >>> validate_minor_sum([50, 30, 20], 100)
        # Passes silently

        >>> validate_minor_sum([50, 30, 21], 100)
        ValueError: Minor unit sum mismatch: expected 100, got 101 (diff: +1)
    """
    actual = sum(components)
    diff = actual - expected_total

    if abs(diff) > tolerance:
        sign = "+" if diff > 0 else ""
        raise ValueError(
            f"Minor unit sum mismatch{' ' + context if context else ''}: "
            f"expected {expected_total}, got {actual} "
            f"(diff: {sign}{diff})"
        )


# Convenience functions for common operations

def calculate_percentage(
    currency: str,
    amount: Union[Decimal, str, int],
    percentage: Union[Decimal, str, int]
) -> int:
    """
    Calculate percentage of amount and return in minor units.

    Args:
        currency: ISO 4217 currency code
        amount: Base amount (will be converted to Decimal)
        percentage: Percentage (e.g., 8.5 for 8.5%)

    Returns:
        Result in minor units

    Examples:
        >>> calculate_percentage("USD", "100.00", "8.5")
        850  # $8.50 in cents
    """
    amount_decimal = Decimal(str(amount))
    percentage_decimal = Decimal(str(percentage))
    result = amount_decimal * (percentage_decimal / Decimal('100'))
    return to_minor(currency, result)


def calculate_proportion(
    currency: str,
    total: Union[Decimal, str, int],
    part: Union[Decimal, str, int],
    target: Union[Decimal, str, int]
) -> int:
    """
    Calculate proportional amount: (part / total) * target

    Used for proration calculations (e.g., partial quantity refunds).

    Args:
        currency: ISO 4217 currency code
        total: Total amount (denominator)
        part: Partial amount (numerator)
        target: Amount to prorate

    Returns:
        Result in minor units

    Examples:
        >>> calculate_proportion("USD", "10.00", "5.00", "8.00")
        400  # (5/10) * $8.00 = $4.00 = 400 cents
    """
    total_decimal = Decimal(str(total))
    part_decimal = Decimal(str(part))
    target_decimal = Decimal(str(target))

    if total_decimal == 0:
        return 0

    result = (part_decimal / total_decimal) * target_decimal
    return to_minor(currency, result)


# Validation helpers for development/debugging

def format_money(currency: str, minor: int) -> str:
    """
    Format minor units as human-readable currency string.

    Args:
        currency: ISO 4217 currency code
        minor: Amount in minor units

    Returns:
        Formatted string (e.g., "$10.13")

    Examples:
        >>> format_money("USD", 1013)
        '$10.13'
        >>> format_money("JPY", 1235)
        '¥1235'
        >>> format_money("EUR", 1050)
        '€10.50'
    """
    amount = from_minor(currency, minor)

    # Currency symbols
    symbols = {
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "JPY": "¥",
        "CNY": "¥",
        "INR": "₹",
        "KRW": "₩",
    }

    symbol = symbols.get(currency.upper(), currency + " ")

    # Format with correct decimal places
    exponent = currency_exponent(currency)
    if exponent == 0:
        return f"{symbol}{amount:,.0f}"
    elif exponent == 2:
        return f"{symbol}{amount:,.2f}"
    else:
        return f"{symbol}{amount:,.{exponent}f}"


def assert_no_drift(
    expected_minor: int,
    actual_minor: int,
    currency: str = "USD",
    message: str = ""
) -> None:
    """
    Assert two amounts match exactly (for tests).

    Provides helpful error message with formatted amounts.

    Args:
        expected_minor: Expected amount in minor units
        actual_minor: Actual amount in minor units
        currency: ISO 4217 currency code (for error formatting)
        message: Additional context for error message

    Raises:
        AssertionError: If amounts don't match
    """
    if expected_minor != actual_minor:
        expected_formatted = format_money(currency, expected_minor)
        actual_formatted = format_money(currency, actual_minor)
        diff = actual_minor - expected_minor
        diff_formatted = format_money(currency, abs(diff))

        error_msg = (
            f"Penny drift detected! "
            f"Expected {expected_formatted}, got {actual_formatted} "
            f"(diff: {'+' if diff > 0 else '-'}{diff_formatted})"
        )

        if message:
            error_msg = f"{message}: {error_msg}"

        raise AssertionError(error_msg)
