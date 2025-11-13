"""
Refund serializers for API interactions.

These serializers handle refund requests, responses, and validation
for the refund system.
"""

from rest_framework import serializers
from decimal import Decimal
from typing import List, Tuple

from .models import RefundItem, RefundAuditLog, ExchangeSession
from orders.models import OrderItem
from payments.models import PaymentTransaction


class RefundItemSerializer(serializers.ModelSerializer):
    """
    Serializer for RefundItem model.
    Read-only for API responses.
    """
    order_item_name = serializers.CharField(source='order_item.product.name', read_only=True)
    order_number = serializers.CharField(source='order_item.order.order_number', read_only=True)
    total_with_extras = serializers.DecimalField(
        source='total_refunded_with_tax_tip_surcharge',
        max_digits=10,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = RefundItem
        fields = [
            'id',
            'payment_transaction',
            'order_item',
            'order_item_name',
            'order_number',
            'quantity_refunded',
            'amount_per_unit',
            'total_refund_amount',
            'tax_refunded',
            'modifier_refund_amount',
            'tip_refunded',
            'surcharge_refunded',
            'total_with_extras',
            'refund_reason',
            'created_at',
        ]
        read_only_fields = fields  # All fields read-only


class RefundAuditLogSerializer(serializers.ModelSerializer):
    """
    Serializer for RefundAuditLog model.
    Read-only for audit trail viewing.
    """
    initiated_by_name = serializers.SerializerMethodField()
    payment_order_number = serializers.CharField(
        source='payment.order.order_number',
        read_only=True
    )

    class Meta:
        model = RefundAuditLog
        fields = [
            'id',
            'payment',
            'payment_order_number',
            'payment_transaction',
            'action',
            'source',
            'refund_amount',
            'reason',
            'initiated_by',
            'initiated_by_name',
            'device_info',
            'provider_response',
            'status',
            'error_message',
            'created_at',
        ]
        read_only_fields = fields  # All fields read-only

    def get_initiated_by_name(self, obj):
        """Get the name of the user who initiated the refund."""
        if obj.initiated_by:
            return f"{obj.initiated_by.first_name} {obj.initiated_by.last_name}".strip() or obj.initiated_by.email
        return None


class ExchangeSessionSerializer(serializers.ModelSerializer):
    """
    Serializer for ExchangeSession model.
    """
    original_order_number = serializers.CharField(
        source='original_order.order_number',
        read_only=True
    )
    new_order_number = serializers.CharField(
        source='new_order.order_number',
        read_only=True,
        allow_null=True
    )
    processed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ExchangeSession
        fields = [
            'id',
            'original_order',
            'original_order_number',
            'original_payment',
            'refund_transaction',
            'new_order',
            'new_order_number',
            'new_payment',
            'refund_amount',
            'new_order_amount',
            'balance_due',
            'session_status',
            'exchange_reason',
            'processed_by',
            'processed_by_name',
            'created_at',
            'completed_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'completed_at',
            'balance_due',
        ]

    def get_processed_by_name(self, obj):
        """Get the name of the user who processed the exchange."""
        if obj.processed_by:
            return f"{obj.processed_by.first_name} {obj.processed_by.last_name}".strip() or obj.processed_by.email
        return None


class ItemRefundRequestSerializer(serializers.Serializer):
    """
    Serializer for requesting a refund of specific order items.

    Expected input:
    {
        "order_item_id": "uuid",
        "quantity": 2,
        "reason": "Customer not satisfied with item"
    }
    """
    order_item_id = serializers.IntegerField(required=True)
    quantity = serializers.IntegerField(required=True, min_value=1)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_quantity(self, value):
        """Validate that quantity is positive."""
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive")
        return value

    def validate(self, data):
        """Validate that the order item exists and quantity is valid."""
        try:
            order_item = OrderItem.objects.get(id=data['order_item_id'])
        except OrderItem.DoesNotExist:
            raise serializers.ValidationError({
                'order_item_id': 'Order item not found'
            })

        if data['quantity'] > order_item.quantity:
            raise serializers.ValidationError({
                'quantity': f'Cannot refund {data["quantity"]} units - only {order_item.quantity} ordered'
            })

        # Store the order_item for later use
        data['order_item'] = order_item
        return data


class MultipleItemsRefundRequestSerializer(serializers.Serializer):
    """
    Serializer for requesting refunds of multiple items at once.

    Expected input:
    {
        "items": [
            {"order_item_id": "uuid", "quantity": 2},
            {"order_item_id": "uuid", "quantity": 1}
        ],
        "reason": "Customer returned multiple items",
        "transaction_id": "uuid" (optional - defaults to most recent)
    }
    """
    items = ItemRefundRequestSerializer(many=True, required=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
    transaction_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_items(self, value):
        """Validate that at least one item is provided."""
        if not value:
            raise serializers.ValidationError("At least one item must be provided")
        return value

    def validate_transaction_id(self, value):
        """Validate that the transaction exists if provided."""
        if value:
            try:
                transaction = PaymentTransaction.objects.get(id=value)
                if transaction.status != PaymentTransaction.TransactionStatus.SUCCESSFUL:
                    raise serializers.ValidationError(
                        "Cannot refund from a transaction that wasn't successful"
                    )
            except PaymentTransaction.DoesNotExist:
                raise serializers.ValidationError("Transaction not found")
        return value


class RefundCalculationResponseSerializer(serializers.Serializer):
    """
    Serializer for refund calculation responses.

    Returns the breakdown of a refund calculation without processing it.
    """
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    tax = serializers.DecimalField(max_digits=10, decimal_places=2)
    tip = serializers.DecimalField(max_digits=10, decimal_places=2)
    surcharge = serializers.DecimalField(max_digits=10, decimal_places=2)
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
    order_item_id = serializers.IntegerField(required=False)
    quantity = serializers.IntegerField(required=False)


class MultipleItemsCalculationResponseSerializer(serializers.Serializer):
    """
    Serializer for multiple items refund calculation responses.
    """
    items = RefundCalculationResponseSerializer(many=True)
    total_subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_tax = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_tip = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_surcharge = serializers.DecimalField(max_digits=10, decimal_places=2)
    grand_total = serializers.DecimalField(max_digits=10, decimal_places=2)


class RefundResponseSerializer(serializers.Serializer):
    """
    Serializer for refund processing responses.

    Returns the result of a refund operation.
    """
    success = serializers.BooleanField()
    message = serializers.CharField()
    refund_transaction_id = serializers.UUIDField(required=False, allow_null=True)
    refund_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True
    )
    refund_items = RefundItemSerializer(many=True, required=False)
    audit_log_id = serializers.UUIDField(required=False, allow_null=True)
    error = serializers.CharField(required=False, allow_null=True)


class FullOrderRefundRequestSerializer(serializers.Serializer):
    """
    Serializer for requesting a full order refund.

    Expected input:
    {
        "payment_id": "uuid",
        "reason": "Customer cancelled order",
        "transaction_id": "uuid" (optional - defaults to most recent)
    }
    """
    payment_id = serializers.UUIDField(required=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
    transaction_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_transaction_id(self, value):
        """Validate that the transaction exists if provided."""
        if value:
            try:
                transaction = PaymentTransaction.objects.get(id=value)
                if transaction.status != PaymentTransaction.TransactionStatus.SUCCESSFUL:
                    raise serializers.ValidationError(
                        "Cannot refund from a transaction that wasn't successful"
                    )
            except PaymentTransaction.DoesNotExist:
                raise serializers.ValidationError("Transaction not found")
        return value


# ============================================================================
# EXCHANGE SERIALIZERS
# ============================================================================


class ExchangeItemSerializer(serializers.Serializer):
    """
    Serializer for an individual item in an exchange (return or new).

    Used for specifying items to return or replacement items.
    """
    order_item_id = serializers.IntegerField(required=True)
    quantity = serializers.IntegerField(required=True, min_value=1)

    def validate_quantity(self, value):
        """Validate that quantity is positive."""
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive")
        return value

    def validate(self, data):
        """Validate that the order item exists."""
        try:
            order_item = OrderItem.objects.get(id=data['order_item_id'])
        except OrderItem.DoesNotExist:
            raise serializers.ValidationError({
                'order_item_id': 'Order item not found'
            })

        # Store the order_item for later use
        data['order_item'] = order_item
        return data


class InitiateExchangeSerializer(serializers.Serializer):
    """
    Serializer for initiating an exchange session.

    Expected input:
    {
        "original_order_id": "uuid",
        "items_to_return": [
            {"order_item_id": "uuid", "quantity": 2},
            {"order_item_id": "uuid", "quantity": 1}
        ],
        "reason": "Customer wants to exchange items"
    }
    """
    original_order_id = serializers.UUIDField(required=True)
    items_to_return = ExchangeItemSerializer(many=True, required=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_items_to_return(self, value):
        """Validate that at least one item is being returned."""
        if not value:
            raise serializers.ValidationError("At least one item must be returned for an exchange")
        return value

    def validate_original_order_id(self, value):
        """Validate that the order exists."""
        from orders.models import Order
        try:
            order = Order.objects.get(id=value)
        except Order.DoesNotExist:
            raise serializers.ValidationError("Order not found")
        return value

    def validate(self, data):
        """Cross-field validation."""
        from orders.models import Order

        # Get the order
        order = Order.objects.get(id=data['original_order_id'])

        # Validate that all items belong to this order
        order_item_ids = set(item.id for item in order.items.all())
        for item_data in data['items_to_return']:
            if item_data['order_item'].id not in order_item_ids:
                raise serializers.ValidationError({
                    'items_to_return': f"Item {item_data['order_item'].product.name} does not belong to this order"
                })

        return data


class NewExchangeItemSerializer(serializers.Serializer):
    """
    Serializer for new items in an exchange (replacement items).

    Expected input per item:
    {
        "product_id": "uuid",
        "quantity": 2,
        "notes": "Extra cheese" (optional)
    }
    """
    product_id = serializers.UUIDField(required=True)
    quantity = serializers.IntegerField(required=True, min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_quantity(self, value):
        """Validate that quantity is positive."""
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive")
        return value

    def validate_product_id(self, value):
        """Validate that the product exists."""
        from products.models import Product
        try:
            product = Product.objects.get(id=value)
        except Product.DoesNotExist:
            raise serializers.ValidationError("Product not found")
        return value


class CreateNewOrderSerializer(serializers.Serializer):
    """
    Serializer for creating a new order in an exchange.

    Expected input:
    {
        "exchange_session_id": "uuid",
        "new_items": [
            {"product_id": "uuid", "quantity": 2},
            {"product_id": "uuid", "quantity": 1, "notes": "No onions"}
        ]
    }
    """
    exchange_session_id = serializers.UUIDField(required=True)
    new_items = NewExchangeItemSerializer(many=True, required=True)

    def validate_new_items(self, value):
        """Validate that at least one new item is provided."""
        if not value:
            raise serializers.ValidationError("At least one new item must be provided")
        return value

    def validate_exchange_session_id(self, value):
        """Validate that the exchange session exists and is in correct state."""
        try:
            session = ExchangeSession.objects.get(id=value)
        except ExchangeSession.DoesNotExist:
            raise serializers.ValidationError("Exchange session not found")

        # Check if session is in the correct state
        from refunds.services import ExchangeService
        if session.session_status != ExchangeService.ExchangeState.REFUND_COMPLETED:
            raise serializers.ValidationError(
                f"Exchange session must be in REFUND_COMPLETED state. Current state: {session.session_status}"
            )

        return value


class CompleteExchangeSerializer(serializers.Serializer):
    """
    Serializer for completing an exchange session.

    Expected input:
    {
        "exchange_session_id": "uuid",
        "payment_method": "CARD_ONLINE" (if customer owes money),
        "payment_transaction_id": "uuid" (if customer owes money),
        "refund_method": "ORIGINAL_PAYMENT" (if customer receives refund)
    }
    """
    exchange_session_id = serializers.UUIDField(required=True)
    payment_method = serializers.CharField(required=False, allow_null=True)
    payment_transaction_id = serializers.UUIDField(required=False, allow_null=True)
    refund_method = serializers.CharField(required=False, allow_null=True)

    def validate_exchange_session_id(self, value):
        """Validate that the exchange session exists and is in correct state."""
        try:
            session = ExchangeSession.objects.get(id=value)
        except ExchangeSession.DoesNotExist:
            raise serializers.ValidationError("Exchange session not found")

        # Check if session is in the correct state
        from refunds.services import ExchangeService
        if session.session_status != ExchangeService.ExchangeState.NEW_ORDER_CREATED:
            raise serializers.ValidationError(
                f"Exchange session must be in NEW_ORDER_CREATED state. Current state: {session.session_status}"
            )

        return value

    def validate(self, data):
        """Cross-field validation based on balance."""
        session = ExchangeSession.objects.get(id=data['exchange_session_id'])

        # Calculate balance
        from refunds.services import ExchangeService
        balance_info = ExchangeService.calculate_balance(session)
        balance = balance_info['balance']

        if balance < 0:
            # Customer owes money - payment required
            if not data.get('payment_method') or not data.get('payment_transaction_id'):
                raise serializers.ValidationError({
                    'payment_method': 'Payment method and transaction ID required when customer owes money',
                    'payment_transaction_id': 'Payment method and transaction ID required when customer owes money'
                })
        elif balance > 0:
            # Customer receives refund
            if not data.get('refund_method'):
                raise serializers.ValidationError({
                    'refund_method': 'Refund method required when customer receives money back'
                })

        return data


class CancelExchangeSerializer(serializers.Serializer):
    """
    Serializer for cancelling an exchange session.

    Expected input:
    {
        "exchange_session_id": "uuid",
        "reason": "Customer changed mind"
    }
    """
    exchange_session_id = serializers.UUIDField(required=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_exchange_session_id(self, value):
        """Validate that the exchange session exists and can be cancelled."""
        try:
            session = ExchangeSession.objects.get(id=value)
        except ExchangeSession.DoesNotExist:
            raise serializers.ValidationError("Exchange session not found")

        # Check if session can be cancelled
        from refunds.services import ExchangeService
        if session.session_status == ExchangeService.ExchangeState.COMPLETED:
            raise serializers.ValidationError("Cannot cancel a completed exchange")
        if session.session_status == ExchangeService.ExchangeState.CANCELLED:
            raise serializers.ValidationError("Exchange is already cancelled")

        return value


class ExchangeSummarySerializer(serializers.Serializer):
    """
    Serializer for exchange session summary/status.

    Returns comprehensive information about an exchange session.
    """
    exchange_session_id = serializers.UUIDField()
    session_status = serializers.CharField()
    original_order_number = serializers.CharField()
    new_order_number = serializers.CharField(allow_null=True)
    refund_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    new_order_amount = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2)
    customer_owes = serializers.BooleanField()
    customer_receives = serializers.BooleanField()
    exchange_reason = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    completed_at = serializers.DateTimeField(allow_null=True)

    # Nested details
    refund_items = RefundItemSerializer(many=True, required=False)
    new_order_items = serializers.ListField(required=False)


class ExchangeBalanceSerializer(serializers.Serializer):
    """
    Serializer for exchange balance calculation.

    Returns the balance information for an exchange.
    """
    balance = serializers.DecimalField(max_digits=10, decimal_places=2)
    customer_owes = serializers.BooleanField()
    customer_receives = serializers.BooleanField()
    refund_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    new_order_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
