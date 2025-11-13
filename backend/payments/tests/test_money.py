"""
Unit tests for payments.money module.

These tests are CRITICAL for preventing penny drift bugs.
All tests must pass before deploying refund system.
"""

import pytest
from decimal import Decimal

# Mark all tests to not require database
pytestmark = pytest.mark.django_db(transaction=False)

from payments.money import (
    currency_exponent,
    quantize_decimal,
    quantize,
    to_minor,
    from_minor,
    allocate_minor,
    validate_minor_sum,
    calculate_percentage,
    calculate_proportion,
    format_money,
    assert_no_drift,
)


class TestCurrencyExponent:
    """Test currency exponent lookup."""

    def test_usd_exponent(self):
        assert currency_exponent("USD") == 2

    def test_jpy_exponent(self):
        assert currency_exponent("JPY") == 0

    def test_kwd_exponent(self):
        assert currency_exponent("KWD") == 3

    def test_case_insensitive(self):
        assert currency_exponent("usd") == 2
        assert currency_exponent("Usd") == 2

    def test_unknown_currency_defaults_to_2(self):
        assert currency_exponent("XXX") == 2


class TestQuantize:
    """Test Decimal quantization with banker's rounding."""

    def test_quantize_usd_normal(self):
        result = quantize("USD", "10.127")
        assert result == Decimal("10.13")

    def test_quantize_usd_bankers_rounding_down(self):
        # 10.125 → 10.12 (round to even)
        result = quantize("USD", "10.125")
        assert result == Decimal("10.12")

    def test_quantize_usd_bankers_rounding_up(self):
        # 10.135 → 10.14 (round to even)
        result = quantize("USD", "10.135")
        assert result == Decimal("10.14")

    def test_quantize_jpy_no_decimals(self):
        result = quantize("JPY", "1234.56")
        assert result == Decimal("1235")

    def test_quantize_kwd_three_decimals(self):
        result = quantize("KWD", "10.1234")
        assert result == Decimal("10.123")

    def test_quantize_from_float(self):
        # Floats converted to string first
        result = quantize("USD", 10.127)
        assert result == Decimal("10.13")

    def test_quantize_from_int(self):
        result = quantize("USD", 10)
        assert result == Decimal("10.00")


class TestToMinor:
    """Test conversion to minor units (cents)."""

    def test_usd_to_cents(self):
        assert to_minor("USD", "10.13") == 1013

    def test_usd_rounds_before_converting(self):
        # 10.127 → quantize → 10.13 → 1013 cents
        assert to_minor("USD", "10.127") == 1013

    def test_usd_bankers_rounding(self):
        # 10.125 → 10.12 → 1012 cents (banker's rounding)
        assert to_minor("USD", "10.125") == 1012

    def test_jpy_no_decimals(self):
        assert to_minor("JPY", "1235") == 1235
        assert to_minor("JPY", "1234.56") == 1235  # Rounded to 1235

    def test_kwd_three_decimals(self):
        assert to_minor("KWD", "10.123") == 10123

    def test_negative_amount(self):
        assert to_minor("USD", "-10.50") == -1050

    def test_zero(self):
        assert to_minor("USD", "0") == 0
        assert to_minor("USD", "0.00") == 0


class TestFromMinor:
    """Test conversion from minor units to Decimal."""

    def test_usd_from_cents(self):
        assert from_minor("USD", 1013) == Decimal("10.13")

    def test_jpy_from_yen(self):
        assert from_minor("JPY", 1235) == Decimal("1235")

    def test_kwd_from_fils(self):
        assert from_minor("KWD", 10123) == Decimal("10.123")

    def test_negative(self):
        assert from_minor("USD", -1050) == Decimal("-10.50")

    def test_zero(self):
        assert from_minor("USD", 0) == Decimal("0.00")


class TestRoundTrip:
    """Test that to_minor → from_minor is consistent."""

    def test_usd_round_trip(self):
        original = "10.13"
        minor = to_minor("USD", original)
        result = from_minor("USD", minor)
        assert result == Decimal(original)

    def test_jpy_round_trip(self):
        original = "1235"
        minor = to_minor("JPY", original)
        result = from_minor("JPY", minor)
        assert result == Decimal(original)

    def test_round_trip_with_quantization(self):
        # 10.127 gets quantized to 10.13
        original = "10.127"
        minor = to_minor("USD", original)
        result = from_minor("USD", minor)
        assert result == Decimal("10.13")  # Not 10.127


class TestAllocateMinor:
    """
    CRITICAL TESTS: allocate_minor() must be deterministic and exact.
    These tests prevent all penny drift bugs.
    """

    def test_equal_weights_three_way_split(self):
        """Split $1.00 evenly 3 ways → 34¢ + 33¢ + 33¢"""
        weights = [100, 100, 100]
        total = 100

        result = allocate_minor(weights, total)

        assert sum(result) == total  # CRITICAL: exact sum
        assert result == [34, 33, 33]  # First gets extra penny

    def test_proportional_weights(self):
        """Allocate proportionally by weight."""
        weights = [1000, 1500, 2000]  # 22%, 33%, 44%
        total = 100

        result = allocate_minor(weights, total)

        assert sum(result) == total
        assert result == [22, 33, 45]

    def test_single_item(self):
        """Single item gets all."""
        result = allocate_minor([100], 100)
        assert result == [100]

    def test_zero_total(self):
        """Zero total → all zeros."""
        result = allocate_minor([100, 200, 300], 0)
        assert result == [0, 0, 0]

    def test_zero_weights(self):
        """Zero weights → all zeros."""
        result = allocate_minor([0, 0, 0], 100)
        assert result == [0, 0, 0]

    def test_determinism(self):
        """Same inputs → same outputs (critical for idempotency)."""
        weights = [333, 444, 555]
        total = 100

        result1 = allocate_minor(weights, total)
        result2 = allocate_minor(weights, total)

        assert result1 == result2

    def test_large_remainder(self):
        """Many small weights with large remainder."""
        weights = [1] * 10  # 10 items, equal weight
        total = 100

        result = allocate_minor(weights, total)

        assert sum(result) == total
        assert len(result) == 10

    def test_realistic_tip_allocation(self):
        """Real-world example: $5.00 tip across 3 items."""
        # Item 1: $10.00, Item 2: $15.00, Item 3: $20.00
        weights = [1000, 1500, 2000]  # In cents
        tip_total = 500  # $5.00

        result = allocate_minor(weights, tip_total)

        assert sum(result) == tip_total
        # Proportional: 111¢ + 167¢ + 222¢ = 500¢
        assert result == [111, 167, 222]

    def test_realistic_surcharge_allocation(self):
        """Real-world: $1.50 surcharge across 4 items."""
        weights = [800, 1200, 1500, 2000]  # Item subtotals in cents
        surcharge = 150  # $1.50

        result = allocate_minor(weights, surcharge)

        assert sum(result) == surcharge

    def test_no_drift_in_repeated_allocations(self):
        """Repeated allocations should never accumulate drift."""
        weights = [1234, 5678, 9012]

        for total in range(1, 1000):
            result = allocate_minor(weights, total)
            assert sum(result) == total, f"Drift detected at total={total}"


class TestValidateMinorSum:
    """Test validation helper."""

    def test_valid_sum(self):
        """Valid sum passes silently."""
        validate_minor_sum([50, 30, 20], 100)
        # No exception = success

    def test_invalid_sum_raises(self):
        """Invalid sum raises ValueError."""
        with pytest.raises(ValueError, match="Minor unit sum mismatch"):
            validate_minor_sum([50, 30, 21], 100)

    def test_error_message_includes_context(self):
        """Context appears in error message."""
        with pytest.raises(ValueError, match="tip allocation"):
            validate_minor_sum([50], 100, context="tip allocation")

    def test_tolerance(self):
        """Tolerance allows small differences."""
        validate_minor_sum([50], 51, tolerance=1)  # Passes
        validate_minor_sum([50], 49, tolerance=1)  # Passes

        with pytest.raises(ValueError):
            validate_minor_sum([50], 52, tolerance=1)  # Fails


class TestCalculatePercentage:
    """Test percentage calculation helper."""

    def test_simple_percentage(self):
        # 8.5% of $100 = $8.50 = 850 cents
        result = calculate_percentage("USD", "100.00", "8.5")
        assert result == 850

    def test_percentage_with_rounding(self):
        # 8.5% of $10.00 = $0.85 = 85 cents
        result = calculate_percentage("USD", "10.00", "8.5")
        assert result == 85

    def test_zero_percentage(self):
        result = calculate_percentage("USD", "100.00", "0")
        assert result == 0


class TestCalculateProportion:
    """Test proportional calculation helper."""

    def test_half_proportion(self):
        # (5 / 10) * $8.00 = $4.00 = 400 cents
        result = calculate_proportion("USD", "10.00", "5.00", "8.00")
        assert result == 400

    def test_full_proportion(self):
        # (10 / 10) * $8.00 = $8.00 = 800 cents
        result = calculate_proportion("USD", "10.00", "10.00", "8.00")
        assert result == 800

    def test_zero_total(self):
        # (5 / 0) * $8.00 = 0 (prevent division by zero)
        result = calculate_proportion("USD", "0", "5.00", "8.00")
        assert result == 0


class TestFormatMoney:
    """Test money formatting for display."""

    def test_format_usd(self):
        assert format_money("USD", 1013) == "$10.13"

    def test_format_large_usd(self):
        assert format_money("USD", 123456) == "$1,234.56"

    def test_format_jpy(self):
        assert format_money("JPY", 1235) == "¥1,235"

    def test_format_eur(self):
        assert format_money("EUR", 1050) == "€10.50"


class TestAssertNoDrift:
    """Test assertion helper for tests."""

    def test_no_drift_passes(self):
        assert_no_drift(1000, 1000)
        # No exception = success

    def test_drift_raises(self):
        with pytest.raises(AssertionError, match="Penny drift detected"):
            assert_no_drift(1000, 1001)

    def test_error_includes_formatted_amounts(self):
        with pytest.raises(AssertionError, match=r"\$10\.00.*\$10\.01"):
            assert_no_drift(1000, 1001, currency="USD")


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_very_small_amounts(self):
        """$0.01 operations."""
        assert to_minor("USD", "0.01") == 1
        assert from_minor("USD", 1) == Decimal("0.01")

    def test_very_large_amounts(self):
        """$10,000,000.00 operations."""
        assert to_minor("USD", "10000000.00") == 1000000000
        assert from_minor("USD", 1000000000) == Decimal("10000000.00")

    def test_many_decimal_places_input(self):
        """Input with many decimals gets quantized."""
        assert to_minor("USD", "10.123456789") == 1012

    def test_allocate_with_single_weight_zero(self):
        """One zero weight among non-zero weights."""
        weights = [0, 100, 200]
        total = 100

        result = allocate_minor(weights, total)

        assert sum(result) == total
        assert result[0] == 0  # Zero weight gets nothing


class TestStripeParity:
    """
    CRITICAL: Verify our calculations match what Stripe expects.
    These scenarios must produce EXACT integer amounts for Stripe API.
    """

    def test_simple_refund_parity(self):
        """Simple refund: $50.00 order → refund $50.00"""
        # Order total
        order_total_minor = to_minor("USD", "50.00")

        # Refund calculation
        refund_minor = to_minor("USD", "50.00")

        # Stripe expects exact match
        assert refund_minor == order_total_minor == 5000

    def test_partial_refund_parity(self):
        """Partial refund with tip."""
        # Transaction: $50.00 + $5.00 tip = $55.00
        amount_minor = to_minor("USD", "50.00")
        tip_minor = to_minor("USD", "5.00")
        total_minor = amount_minor + tip_minor

        # Refund 50% of items
        refund_amount_minor = amount_minor // 2
        refund_tip_minor = tip_minor // 2
        refund_total_minor = refund_amount_minor + refund_tip_minor

        # Send to Stripe
        stripe_refund_amount = refund_total_minor

        assert stripe_refund_amount == 2750  # $27.50

    def test_multi_item_refund_with_allocation(self):
        """Complex: 3 items with tip allocation."""
        # Item 1: $10.00, Item 2: $15.00, Item 3: $20.00
        item_amounts = [1000, 1500, 2000]
        order_subtotal = sum(item_amounts)

        # Tip: $5.00 allocated across items
        tip_total = 500
        tip_allocations = allocate_minor(item_amounts, tip_total)

        # Validate allocation
        assert sum(tip_allocations) == tip_total  # CRITICAL

        # Refund items 1 and 2 (not item 3)
        refund_subtotal = item_amounts[0] + item_amounts[1]
        refund_tip = tip_allocations[0] + tip_allocations[1]
        refund_total = refund_subtotal + refund_tip

        # Send to Stripe (must be exact integer)
        stripe_refund_amount = refund_total

        # Verify no drift
        assert isinstance(stripe_refund_amount, int)
        assert stripe_refund_amount == 2778  # $27.78


class TestRandomizedStressTest:
    """
    Randomized tests to catch edge cases.
    Run 1000+ scenarios to ensure zero drift.
    """

    def test_allocate_random_scenarios(self):
        """1000 random allocation scenarios - must never drift."""
        import random

        random.seed(42)  # Reproducible

        for _ in range(1000):
            # Random weights and total
            num_items = random.randint(1, 10)
            weights = [random.randint(1, 10000) for _ in range(num_items)]
            total = random.randint(1, 10000)

            # Allocate
            result = allocate_minor(weights, total)

            # CRITICAL: Must sum exactly
            assert sum(result) == total, f"Drift in weights={weights}, total={total}"

    def test_to_minor_from_minor_random(self):
        """Random amounts round-trip correctly."""
        import random

        random.seed(42)

        for _ in range(1000):
            # Random amount (2 decimals)
            dollars = random.randint(0, 1000000)
            cents = random.randint(0, 99)
            amount_str = f"{dollars}.{cents:02d}"

            # Round trip
            minor = to_minor("USD", amount_str)
            result = from_minor("USD", minor)

            assert result == Decimal(amount_str)


# Run with: pytest payments/tests/test_money.py -v
