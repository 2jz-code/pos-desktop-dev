"""
API integration tests for refund endpoints.

These tests verify the complete API layer including:
- Request validation
- Response formats
- Permission checks
- Error handling
- End-to-end refund workflows
"""
import pytest
from decimal import Decimal
from unittest.mock import patch
from rest_framework.test import APIClient
from rest_framework import status

from tenant.managers import set_current_tenant
from refunds.models import RefundItem, RefundAuditLog


@pytest.mark.django_db
class TestRefundCalculationAPI:
    """Tests for refund calculation (preview) endpoints."""

    def test_calculate_single_item_refund_success(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test successful single item refund calculation."""
        set_current_tenant(completed_order_with_payment['tenant'])

        # Authenticate
        api_client.force_authenticate(user=admin_user_tenant_a)

        order_item = completed_order_with_payment['order_item']

        # Calculate refund for 1 unit
        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 1,
            'reason': 'Customer request'
        })

        # Verify response
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['can_refund'] is True
        assert data['quantity_available_for_refund'] == 2
        assert data['quantity_to_refund'] == 1
        assert 'refund_breakdown' in data
        assert Decimal(data['refund_breakdown']['total']) > Decimal('0')
        assert data['validation_errors'] == []

    def test_calculate_single_item_refund_validation_error(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test calculation with invalid quantity returns validation error."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        order_item = completed_order_with_payment['order_item']

        # Try to refund more than available
        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 10,  # Only 2 available
            'reason': 'Test'
        })

        # Should still return 200 but with validation errors
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['can_refund'] is False
        assert len(data['validation_errors']) > 0
        assert 'exceeds available quantity' in data['validation_errors'][0].lower()

    def test_calculate_single_item_requires_auth(self, api_client, completed_order_with_payment):
        """Test that calculation endpoint requires authentication."""
        set_current_tenant(completed_order_with_payment['tenant'])

        order_item = completed_order_with_payment['order_item']

        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 1,
            'reason': 'Test'
        })

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_calculate_multiple_items_success(self, api_client, admin_user_tenant_a, multi_item_order_with_payment):
        """Test successful multiple items refund calculation."""
        set_current_tenant(multi_item_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        order_item1 = multi_item_order_with_payment['order_item1']
        order_item2 = multi_item_order_with_payment['order_item2']

        response = api_client.post('/api/refunds/calculate-multiple/', {
            'items': [
                {'order_item_id': str(order_item1.id), 'quantity': 1},
                {'order_item_id': str(order_item2.id), 'quantity': 1}
            ],
            'reason': 'Customer request'
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['can_refund'] is True
        assert len(data['items']) == 2
        assert 'total_refund' in data
        assert Decimal(data['total_refund']['total']) > Decimal('0')

    def test_calculate_missing_required_fields(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test that missing required fields returns 400."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        # Missing quantity field
        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(completed_order_with_payment['order_item'].id),
            'reason': 'Test'
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestRefundProcessingAPI:
    """Tests for actual refund processing endpoints."""

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_process_item_refund_success(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test successful item refund processing."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        # Mock successful provider refund
        mock_refund.return_value = completed_order_with_payment['transaction']

        order_item = completed_order_with_payment['order_item']

        response = api_client.post('/api/refunds/process-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 1,
            'reason': 'Customer request'
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['success'] is True
        assert 'refund_transaction' in data
        assert 'refund_items' in data
        assert 'total_refunded' in data
        assert Decimal(data['total_refunded']) > Decimal('0')

        # Verify RefundItem was created
        assert RefundItem.objects.filter(order_item=order_item).exists()

        # Verify audit log was created
        assert RefundAuditLog.objects.filter(
            payment=completed_order_with_payment['payment'],
            action='ITEM_REFUND'
        ).exists()

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_process_full_order_refund_success(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test successful full order refund."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        # Mock successful provider refund
        mock_refund.return_value = completed_order_with_payment['transaction']

        payment = completed_order_with_payment['payment']

        response = api_client.post('/api/refunds/process-full-order/', {
            'payment_id': str(payment.id),
            'reason': 'Order cancelled'
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['success'] is True
        assert len(data['refund_items']) > 0
        assert Decimal(data['total_refunded']) > Decimal('0')

        # Verify all items were refunded
        order = completed_order_with_payment['order']
        for item in order.items.all():
            assert RefundItem.objects.filter(order_item=item).exists()

    def test_process_refund_requires_staff_permission(self, api_client, tenant_a, completed_order_with_payment):
        """Test that processing refunds requires staff permissions."""
        set_current_tenant(tenant_a)

        # Create a regular customer user (not staff)
        from users.models import User
        customer_user = User.objects.create_user(
            email='customer@test.com',
            password='testpass123',
            tenant=tenant_a,
            role='CUSTOMER'
        )

        api_client.force_authenticate(user=customer_user)

        order_item = completed_order_with_payment['order_item']

        response = api_client.post('/api/refunds/process-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 1,
            'reason': 'Test'
        })

        # Should be forbidden for non-staff users
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_process_refund_invalid_quantity(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test that invalid quantity returns 400 error."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        order_item = completed_order_with_payment['order_item']

        # Try to refund more than available
        response = api_client.post('/api/refunds/process-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 10,  # Only 2 available
            'reason': 'Test'
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_process_refund_provider_failure(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test that payment provider failures are handled properly."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        # Mock provider failure
        mock_refund.side_effect = Exception("Payment provider error: Insufficient funds")

        order_item = completed_order_with_payment['order_item']

        response = api_client.post('/api/refunds/process-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 1,
            'reason': 'Test'
        })

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        data = response.json()
        assert 'error' in data
        assert 'payment provider' in data['error'].lower() or 'insufficient' in data['error'].lower()


@pytest.mark.django_db
class TestRefundItemViewSetAPI:
    """Tests for RefundItem viewing endpoints."""

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_list_refund_items(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test listing refund items."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        # First create a refund
        mock_refund.return_value = completed_order_with_payment['transaction']

        from payments.services import PaymentService
        payment = completed_order_with_payment['payment']
        order_item = completed_order_with_payment['order_item']

        PaymentService(payment).process_item_level_refund(
            order_items_with_quantities=[(order_item, 1)],
            reason="Test refund"
        )

        # Now list refund items
        response = api_client.get('/api/refunds/items/')

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert 'results' in data
        assert len(data['results']) > 0

        refund_item = data['results'][0]
        assert 'id' in refund_item
        assert 'quantity_refunded' in refund_item
        assert 'total_refunded' in refund_item
        assert 'reason' in refund_item

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_retrieve_single_refund_item(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test retrieving a single refund item."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        # Create a refund
        mock_refund.return_value = completed_order_with_payment['transaction']

        from payments.services import PaymentService
        payment = completed_order_with_payment['payment']
        order_item = completed_order_with_payment['order_item']

        result = PaymentService(payment).process_item_level_refund(
            order_items_with_quantities=[(order_item, 1)],
            reason="Test refund"
        )

        refund_item_id = result['refund_items'][0].id

        # Retrieve it
        response = api_client.get(f'/api/refunds/items/{refund_item_id}/')

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['id'] == str(refund_item_id)
        assert data['quantity_refunded'] == 1

    def test_list_refund_items_filter_by_payment(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test filtering refund items by payment transaction."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        transaction_id = completed_order_with_payment['transaction'].id

        response = api_client.get(f'/api/refunds/items/?payment_transaction={transaction_id}')

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestRefundAuditLogAPI:
    """Tests for RefundAuditLog viewing endpoints."""

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_list_audit_logs(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test listing audit logs."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        # Create a refund to generate audit log
        mock_refund.return_value = completed_order_with_payment['transaction']

        from payments.services import PaymentService
        payment = completed_order_with_payment['payment']
        order_item = completed_order_with_payment['order_item']

        PaymentService(payment).process_item_level_refund(
            order_items_with_quantities=[(order_item, 1)],
            reason="Test refund"
        )

        # List audit logs
        response = api_client.get('/api/refunds/audit-logs/')

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert 'results' in data
        assert len(data['results']) > 0

        log = data['results'][0]
        assert 'action' in log
        assert 'amount' in log
        assert 'reason' in log
        assert 'processed_by' in log
        assert log['action'] == 'ITEM_REFUND'

    def test_audit_logs_filter_by_action(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test filtering audit logs by action type."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        response = api_client.get('/api/refunds/audit-logs/?action=ITEM_REFUND')

        assert response.status_code == status.HTTP_200_OK

    def test_audit_logs_require_auth(self, api_client):
        """Test that audit logs require authentication."""
        response = api_client.get('/api/refunds/audit-logs/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestRefundAPIEdgeCases:
    """Tests for edge cases and error conditions."""

    def test_refund_nonexistent_order_item(self, api_client, admin_user_tenant_a, tenant_a):
        """Test refunding a non-existent order item returns 404."""
        set_current_tenant(tenant_a)
        api_client.force_authenticate(user=admin_user_tenant_a)

        import uuid
        fake_id = uuid.uuid4()

        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(fake_id),
            'quantity': 1,
            'reason': 'Test'
        })

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_refund_zero_quantity(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test that zero quantity returns validation error."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        order_item = completed_order_with_payment['order_item']

        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 0,
            'reason': 'Test'
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_refund_negative_quantity(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test that negative quantity returns validation error."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        order_item = completed_order_with_payment['order_item']

        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(order_item.id),
            'quantity': -1,
            'reason': 'Test'
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch('payments.services.PaymentService.refund_transaction_with_provider')
    def test_double_refund_prevention(self, mock_refund, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test that refunding the same item twice is prevented."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        mock_refund.return_value = completed_order_with_payment['transaction']

        order_item = completed_order_with_payment['order_item']

        # First refund - full quantity
        response1 = api_client.post('/api/refunds/process-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 2,  # Refund all
            'reason': 'First refund'
        })

        assert response1.status_code == status.HTTP_200_OK

        # Try to refund again
        response2 = api_client.post('/api/refunds/process-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 1,
            'reason': 'Second refund'
        })

        # Should fail because nothing left to refund
        assert response2.status_code == status.HTTP_400_BAD_REQUEST

    def test_refund_missing_reason(self, api_client, admin_user_tenant_a, completed_order_with_payment):
        """Test that missing reason field returns validation error."""
        set_current_tenant(completed_order_with_payment['tenant'])
        api_client.force_authenticate(user=admin_user_tenant_a)

        order_item = completed_order_with_payment['order_item']

        response = api_client.post('/api/refunds/calculate-item/', {
            'order_item_id': str(order_item.id),
            'quantity': 1
            # Missing reason field
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST
