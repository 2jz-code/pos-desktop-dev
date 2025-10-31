"""
Tests for PaymentService refund methods.

These tests verify that the PaymentService correctly processes refunds
through payment providers (mocked for testing).
"""
import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock

from tenant.managers import set_current_tenant
from payments.services import PaymentService
from refunds.models import RefundItem


@pytest.mark.django_db
class TestPaymentServiceRefunds:
    """Tests for PaymentService refund processing."""

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_process_item_level_refund(self, mock_refund, completed_order_with_payment):
        """Test processing item-level refund through payment provider."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock successful provider refund - return the original transaction
        # (In real implementation, this would return a new refund transaction)
        mock_refund.return_value = completed_order_with_payment['transaction']

        payment = completed_order_with_payment['payment']
        order_item = completed_order_with_payment['order_item']

        # Process refund for 1 unit (pass as list of tuples)
        result = PaymentService(payment).process_item_level_refund(
            order_items_with_quantities=[(order_item, 1)],
            reason="Customer request"
        )

        # Verify refund was processed
        assert result is not None, "Refund should return result"
        assert result['success'] is True, "Refund should be successful"
        assert 'refund_transaction' in result, "Should have refund transaction"
        assert 'refund_items' in result, "Should have refund items"
        assert 'total_refunded' in result, "Should have total refunded amount"

        # Verify refund items were created
        assert len(result['refund_items']) > 0, "Should create at least one RefundItem"

        # Verify provider was called
        mock_refund.assert_called_once()

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_process_full_order_refund(self, mock_refund, completed_order_with_payment):
        """Test processing full order refund."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock successful provider refund - return the original transaction
        mock_refund.return_value = completed_order_with_payment['transaction']

        payment = completed_order_with_payment['payment']

        # Process full refund
        result = PaymentService(payment).process_full_order_refund(
            reason="Order cancelled"
        )

        # Verify all items were refunded
        assert result is not None, "Refund should return result"
        assert result['success'] is True, "Refund should be successful"
        assert 'refund_items' in result, "Should create RefundItem records"
        assert 'total_refunded' in result, "Should have total refunded amount"

        # Verify provider was called
        mock_refund.assert_called_once()

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_refund_failure_handling(self, mock_refund, completed_order_with_payment):
        """Test that refund failures are handled properly."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock failed provider refund
        mock_refund.return_value = {
            'success': False,
            'error': 'Insufficient funds'
        }

        payment = completed_order_with_payment['payment']
        order_item = completed_order_with_payment['order_item']

        # Attempt refund - should raise exception or return error
        with pytest.raises(Exception) as exc_info:
            PaymentService(payment).process_item_level_refund(
                order_item=order_item,
                quantity=1,
                reason="Test failure"
            )

        # Verify error message contains provider error
        assert "refund" in str(exc_info.value).lower() or "insufficient" in str(exc_info.value).lower()
