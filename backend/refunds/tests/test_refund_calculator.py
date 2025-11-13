"""
Tests for RefundCalculator service.

These tests verify that refund calculations are accurate for:
- Single item refunds
- Multiple item refunds
- Proportional tax allocation
- Proportional tip/surcharge allocation
- Full order refunds
"""
import pytest
from decimal import Decimal

from tenant.managers import set_current_tenant
from refunds.services import RefundCalculator, RefundValidator


@pytest.mark.django_db
class TestRefundCalculator:
    """Tests for RefundCalculator service."""

    def test_calculate_single_item_refund(self, completed_order_with_payment):
        """
        Test refund calculation for a single item.

        Refunding 1 unit from an order of 2 units should:
        - Calculate correct subtotal ($15.99 for 1 unit)
        - Calculate proportional tax
        - Calculate proportional tip/surcharge
        """
        set_current_tenant(completed_order_with_payment['tenant'])

        calculator = RefundCalculator(completed_order_with_payment['payment'])

        # Refund 1 of the 2 units
        result = calculator.calculate_item_refund(
            completed_order_with_payment['order_item'],
            quantity=1
        )

        # Verify subtotal (1 * $15.99)
        assert result['subtotal'] == Decimal("15.99"), \
            f"Expected subtotal $15.99, got {result['subtotal']}"

        # Verify tax is proportional (1/2 of total tax)
        expected_tax = Decimal("1.60")  # Half of $3.20
        assert result['tax'] == expected_tax, \
            f"Expected tax {expected_tax}, got {result['tax']}"

        # Verify tip and surcharge are present
        assert result['tip'] > Decimal("0"), "Tip should be allocated"
        assert result['surcharge'] > Decimal("0"), "Surcharge should be allocated"

        # Verify total is sum of components
        expected_total = result['subtotal'] + result['tax'] + result['tip'] + result['surcharge']
        assert result['total'] == expected_total, \
            f"Total {result['total']} doesn't match sum of components {expected_total}"

    def test_calculate_multiple_items_refund(self, multi_item_order_with_payment):
        """Test refund calculation for multiple items."""
        set_current_tenant(multi_item_order_with_payment['tenant'])

        calculator = RefundCalculator(multi_item_order_with_payment['payment'])

        # Refund 1 unit of item1 and 1 unit of item2
        items = [
            (multi_item_order_with_payment['order_item1'], 1),
            (multi_item_order_with_payment['order_item2'], 1)
        ]

        result = calculator.calculate_multiple_items_refund(items)

        # Verify subtotal ($15.99 + $25.00)
        expected_subtotal = Decimal("40.99")
        assert result['total_subtotal'] == expected_subtotal, \
            f"Expected subtotal {expected_subtotal}, got {result['total_subtotal']}"

        # Verify tax is allocated
        assert result['total_tax'] > Decimal("0"), "Tax should be calculated"

        # Verify total includes all components
        assert result['grand_total'] > result['total_subtotal'], "Total should include tax, tip, surcharge"

    def test_proportional_tip_allocation(self, multi_item_order_with_payment):
        """
        Test that tips are allocated proportionally to refund amount.

        When refunding part of an order, tip should be allocated based on
        the proportion of the subtotal being refunded.
        """
        set_current_tenant(multi_item_order_with_payment['tenant'])

        calculator = RefundCalculator(multi_item_order_with_payment['payment'])

        # Refund 1 unit of product_a ($15.99 out of $62.68 subtotal)
        result = calculator.calculate_item_refund(
            multi_item_order_with_payment['order_item1'],
            quantity=1
        )

        # Verify tip is allocated (should be > 0)
        assert result['tip'] > Decimal("0"), "Tip should be allocated for partial refund"

        # Verify tip is reasonable (not more than total transaction tip)
        transaction_tip = Decimal("5.00")
        assert result['tip'] <= transaction_tip, \
            f"Refund tip {result['tip']} should not exceed transaction tip {transaction_tip}"

        # Verify tip is proportional (should be less than full tip since partial refund)
        refund_subtotal = Decimal("15.99")
        order_subtotal = Decimal("62.68")
        proportion = refund_subtotal / order_subtotal
        # Tip should be roughly proportional (within reasonable range)
        expected_min = transaction_tip * proportion * Decimal("0.5")  # Allow 50% variance
        expected_max = transaction_tip * proportion * Decimal("2.0")  # Allow 100% variance for rounding
        assert expected_min <= result['tip'] <= expected_max, \
            f"Tip {result['tip']} outside reasonable proportional range [{expected_min}, {expected_max}]"

    def test_full_order_refund_calculation(self, completed_order_with_payment):
        """Test calculating refund for entire order."""
        set_current_tenant(completed_order_with_payment['tenant'])

        calculator = RefundCalculator(completed_order_with_payment['payment'])

        # Calculate full refund using all order items
        items = [(completed_order_with_payment['order_item'], 2)]
        result = calculator.calculate_multiple_items_refund(items)

        # Total refund should match transaction total
        transaction_total = (
            completed_order_with_payment['transaction'].amount +
            completed_order_with_payment['transaction'].tip +
            completed_order_with_payment['transaction'].surcharge
        )

        assert result['grand_total'] == transaction_total, \
            f"Full refund {result['grand_total']} should match transaction total {transaction_total}"

    def test_validation_prevents_over_refund(self, completed_order_with_payment):
        """Test that RefundValidator prevents refunding more than ordered."""
        set_current_tenant(completed_order_with_payment['tenant'])

        order_item = completed_order_with_payment['order_item']

        # Try to refund more than available (quantity is 2, try to refund 3)
        is_valid, error = RefundValidator.validate_item_refund(order_item, quantity=3)

        assert not is_valid, "Should not allow over-refund"
        assert "only 2 ordered" in error.lower(), \
            f"Error message should mention quantity limit: {error}"

    def test_validation_prevents_double_refund(self, completed_order_with_payment):
        """Test that RefundValidator prevents refunding the same item twice."""
        set_current_tenant(completed_order_with_payment['tenant'])

        from refunds.models import RefundItem
        order_item = completed_order_with_payment['order_item']
        transaction = completed_order_with_payment['transaction']

        # Create a refund record for all units
        RefundItem.objects.create(
            tenant=completed_order_with_payment['tenant'],
            payment_transaction=transaction,
            order_item=order_item,
            quantity_refunded=2,
            amount_per_unit=Decimal("15.99"),
            total_refund_amount=Decimal("31.98")
        )

        # Try to refund again
        is_valid, error = RefundValidator.validate_item_refund(order_item, quantity=1)

        assert not is_valid, "Should not allow double refund"
        assert "already refunded" in error.lower(), \
            f"Error message should mention already refunded: {error}"


@pytest.mark.django_db
class TestRefundValidator:
    """Tests for RefundValidator service."""

    def test_can_refund_valid_item(self, completed_order_with_payment):
        """Test that validator allows valid refund."""
        set_current_tenant(completed_order_with_payment['tenant'])

        order_item = completed_order_with_payment['order_item']

        is_valid, error = RefundValidator.validate_item_refund(order_item, quantity=1)

        assert is_valid, f"Should allow valid refund: {error}"
        assert error is None, "No error for valid refund"

    def test_cannot_refund_negative_quantity(self, completed_order_with_payment):
        """Test that validator rejects negative quantities."""
        set_current_tenant(completed_order_with_payment['tenant'])

        order_item = completed_order_with_payment['order_item']

        is_valid, error = RefundValidator.validate_item_refund(order_item, quantity=-1)

        assert not is_valid, "Should reject negative quantity"
        assert error is not None, "Should provide error message"

    def test_cannot_refund_zero_quantity(self, completed_order_with_payment):
        """Test that validator rejects zero quantity."""
        set_current_tenant(completed_order_with_payment['tenant'])

        order_item = completed_order_with_payment['order_item']

        is_valid, error = RefundValidator.validate_item_refund(order_item, quantity=0)

        assert not is_valid, "Should reject zero quantity"
        assert error is not None, "Should provide error message"
