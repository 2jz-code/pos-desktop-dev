"""
Tests for ExchangeService workflows.

These tests verify the complete exchange workflow:
1. Initiate exchange (refund original item)
2. Create new order for replacement item
3. Calculate balance (customer owes or receives money)
4. Complete or cancel exchange
"""
import pytest
from decimal import Decimal
from unittest.mock import patch

from tenant.managers import set_current_tenant
from refunds.services import ExchangeService
from refunds.models import ExchangeSession
from orders.models import Order


@pytest.mark.django_db
class TestExchangeService:
    """Tests for exchange workflows."""

    @patch('payments.services.PaymentService.process_item_level_refund')
    def test_initiate_exchange(self, mock_process_refund, completed_order_with_payment):
        """Test initiating an exchange session."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock successful refund processing
        mock_process_refund.return_value = {
            'refund_transaction': completed_order_with_payment['transaction'],
            'total_refunded': Decimal("19.34")
        }

        order_item = completed_order_with_payment['order_item']

        # Initiate exchange for 1 unit
        session = ExchangeService.initiate_exchange(
            original_order=completed_order_with_payment['order'],
            items_to_return=[(order_item, 1)],
            reason="Wrong size"
        )

        # Verify session created
        assert session is not None, "Exchange session should be created"
        assert session.original_order == completed_order_with_payment['order']
        assert session.session_status == ExchangeService.ExchangeState.REFUND_COMPLETED
        assert session.refund_amount > Decimal("0")

    @patch('payments.services.PaymentService.process_item_level_refund')
    def test_create_new_order_for_exchange(self, mock_process_refund, completed_order_with_payment, product_tenant_a_alt, store_location_tenant_a):
        """Test creating new order in exchange workflow."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock refund processing
        mock_process_refund.return_value = {
            'refund_transaction': completed_order_with_payment['transaction'],
            'total_refunded': Decimal("19.34")
        }

        # Initiate exchange
        session = ExchangeService.initiate_exchange(
            original_order=completed_order_with_payment['order'],
            items_to_return=[(completed_order_with_payment['order_item'], 1)],
            reason="Exchange"
        )

        # Create new order with different product
        new_order = ExchangeService.create_new_order(
            session=session,
            new_items_data=[{
                'product_id': str(product_tenant_a_alt.id),
                'quantity': 1,
                'modifiers': [],
                'notes': ''
            }],
            customer=completed_order_with_payment['order'].customer,
            order_type='POS',
            store_location=store_location_tenant_a
        )

        # Refresh session from database
        session.refresh_from_db()

        # Verify new order created
        assert session.new_order is not None, "New order should be created"
        assert session.session_status == ExchangeService.ExchangeState.NEW_ORDER_CREATED
        assert session.new_order_amount > Decimal("0")

    @patch('payments.services.PaymentService.process_item_level_refund')
    def test_calculate_exchange_balance(self, mock_process_refund, completed_order_with_payment, product_tenant_a_alt, store_location_tenant_a):
        """Test exchange balance calculation."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock refund processing
        mock_process_refund.return_value = {
            'refund_transaction': completed_order_with_payment['transaction'],
            'total_refunded': Decimal("19.34")
        }

        # Setup exchange with new order
        session = ExchangeService.initiate_exchange(
            original_order=completed_order_with_payment['order'],
            items_to_return=[(completed_order_with_payment['order_item'], 1)],
            reason="Exchange"
        )

        ExchangeService.create_new_order(
            session=session,
            new_items_data=[{
                'product_id': str(product_tenant_a_alt.id),
                'quantity': 1,
                'modifiers': [],
                'notes': ''
            }],
            customer=completed_order_with_payment['order'].customer,
            order_type='POS',
            store_location=store_location_tenant_a
        )

        # Refresh session from database
        session.refresh_from_db()

        # Calculate balance
        balance = ExchangeService.calculate_balance(session)

        # Verify balance calculated
        assert balance is not None, "Should calculate balance"

        # Refresh session to get updated balance_due field
        session.refresh_from_db()
        assert session.balance_due == balance, "Session should have balance_due set"

        # Balance should be non-zero (different products)
        assert balance != Decimal("0"), "Balance should be calculated"

    @patch('payments.services.PaymentService.process_item_level_refund')
    def test_complete_exchange(self, mock_process_refund, completed_order_with_payment, product_tenant_a_alt, store_location_tenant_a):
        """Test completing an exchange."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock refund processing
        mock_process_refund.return_value = {
            'refund_transaction': completed_order_with_payment['transaction'],
            'total_refunded': Decimal("19.34")
        }

        # Setup complete exchange workflow
        session = ExchangeService.initiate_exchange(
            original_order=completed_order_with_payment['order'],
            items_to_return=[(completed_order_with_payment['order_item'], 1)],
            reason="Exchange"
        )

        ExchangeService.create_new_order(
            session=session,
            new_items_data=[{
                'product_id': str(product_tenant_a_alt.id),
                'quantity': 1,
                'modifiers': [],
                'notes': ''
            }],
            customer=completed_order_with_payment['order'].customer,
            order_type='POS',
            store_location=store_location_tenant_a
        )

        # Refresh session from database
        session.refresh_from_db()

        # Complete exchange (provide payment method since customer owes money)
        result = ExchangeService.complete_exchange(
            session,
            payment_method='CASH',
            payment_details={}
        )

        # Refresh session from database to get updated fields
        session.refresh_from_db()

        # Verify exchange completed
        assert result['success'] is True, "Exchange should complete successfully"
        assert session.session_status == ExchangeService.ExchangeState.COMPLETED
        assert session.completed_at is not None
        assert result['action'] == 'payment_required', "Should require payment since new item costs more"

    @patch('payments.services.PaymentService.process_item_level_refund')
    def test_cancel_exchange(self, mock_process_refund, completed_order_with_payment):
        """Test cancelling an exchange."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Mock refund processing
        mock_process_refund.return_value = {
            'refund_transaction': completed_order_with_payment['transaction'],
            'total_refunded': Decimal("19.34")
        }

        # Initiate exchange
        session = ExchangeService.initiate_exchange(
            original_order=completed_order_with_payment['order'],
            items_to_return=[(completed_order_with_payment['order_item'], 1)],
            reason="Exchange"
        )

        # Cancel exchange
        result = ExchangeService.cancel_exchange(
            session,
            reason="Customer changed mind"
        )

        # Refresh session from database
        session.refresh_from_db()

        # Verify exchange cancelled
        assert result is True, "Cancel should return True"
        assert session.session_status == ExchangeService.ExchangeState.CANCELLED
        assert "Customer changed mind" in session.exchange_reason
