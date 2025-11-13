from rest_framework import serializers
from decimal import Decimal
from django.db import models
from .models import Payment, PaymentTransaction, Order, GiftCard
from .services import PaymentService
from django.shortcuts import get_object_or_404
from orders.serializers import (
    UnifiedOrderSerializer,
    OrderItemSerializer
)
from orders.models import OrderItem
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin


# ============================================================================
# UNIFIED READ SERIALIZERS (Fieldset-based)
# ============================================================================

class UnifiedPaymentTransactionSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for PaymentTransaction model with fieldset support.

    Fieldsets:
    - simple: Minimal transaction info (id, amount, method, status)
    - list: Simple + additional details (tip, surcharge, card info, created_at)
    - detail: All fields except provider_response (debugging field, not for frontend)

    Usage:
        # List view
        UnifiedPaymentTransactionSerializer(txn, context={'view_mode': 'list'})

        # Detail view
        UnifiedPaymentTransactionSerializer(txn, context={'view_mode': 'detail'})
    """

    class Meta:
        model = PaymentTransaction
        exclude = ['provider_response']  # Exclude large debugging field from API

        fieldsets = {
            'simple': [
                'id',
                'amount',
                'method',
                'status',
            ],
            'list': [
                'id',
                'amount',
                'method',
                'status',
                'tip',
                'surcharge',
                'card_brand',
                'card_last4',
                'created_at',
            ],
            'detail': '__all__',  # All fields except provider_response
        }

        required_fields = {'id'}


class UnifiedGiftCardSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for GiftCard model with fieldset support.

    Fieldsets:
    - simple: Minimal gift card info (id, code, current_balance, status)
    - list: Simple + additional details (is_valid, original_balance, dates)
    - detail: All fields (default)

    Usage:
        # List view
        UnifiedGiftCardSerializer(card, context={'view_mode': 'list'})

        # Detail view
        UnifiedGiftCardSerializer(card, context={'view_mode': 'detail'})
    """

    is_valid = serializers.ReadOnlyField()

    class Meta:
        model = GiftCard
        fields = '__all__'
        read_only_fields = [
            'id',
            'issued_date',
            'last_used_date',
            'created_at',
            'updated_at',
            'is_valid',
        ]

        fieldsets = {
            'simple': [
                'id',
                'code',
                'current_balance',
                'status',
            ],
            'list': [
                'id',
                'code',
                'current_balance',
                'status',
                'is_valid',
                'original_balance',
                'issued_date',
                'expiry_date',
            ],
            'detail': '__all__',  # All fields
        }

        required_fields = {'id'}


class UnifiedPaymentSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for Payment model with fieldset support.

    Fieldsets:
    - simple: Minimal payment info (id, status, totals, payment_number)
    - list: Simple + additional details (balance_due, change_due, created_at, order_number)
    - detail: All fields + nested relationships (default)

    Expandable:
    - transactions: Expands transaction_ids to full transaction objects

    Usage:
        # List view
        UnifiedPaymentSerializer(payment, context={'view_mode': 'list'})

        # Detail view (includes nested order & transactions)
        UnifiedPaymentSerializer(payment, context={'view_mode': 'detail'})

        # Expand transactions
        UnifiedPaymentSerializer(
            payment,
            context={'view_mode': 'detail', 'expand': {'transactions'}}
        )
    """

    # Nested serializers for detail view
    transactions = UnifiedPaymentTransactionSerializer(many=True, read_only=True)
    order = serializers.SerializerMethodField()

    # Computed fields
    balance_due = serializers.SerializerMethodField()
    change_due = serializers.SerializerMethodField()
    transaction_count = serializers.SerializerMethodField()
    primary_method = serializers.SerializerMethodField()
    order_number = serializers.CharField(source="order.order_number", read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
        select_related_fields = ['order', 'order__store_location']
        prefetch_related_fields = ['transactions', 'order__items', 'order__items__product']
        read_only_fields = [
            'id',
            'balance_due',
            'change_due',
            'transaction_count',
            'primary_method',
            'created_at',
            'updated_at',
            'transactions',
            'order_number',
            'payment_number',
        ]

        fieldsets = {
            'simple': [
                'id',
                'status',
                'total_amount_due',
                'amount_paid',
                'payment_number',
            ],
            'list': [
                'id',
                'status',
                'payment_number',
                'order_number',
                'store_location',
                'total_collected',
                'transaction_count',
                'primary_method',
                'created_at',
            ],
            'detail': '__all__',  # All fields including nested
        }

        required_fields = {'id'}

    def get_order(self, obj: Payment):
        """
        Returns the order with items including refund information.
        Only included in detail view mode.
        """
        view_mode = self.context.get('view_mode')
        if view_mode == 'detail':
            # Use the specialized OrderWithItemsSerializer for payment-specific order view
            return OrderWithItemsSerializer(obj.order, context=self.context).data
        return None

    def get_balance_due(self, obj: Payment) -> Decimal:
        """
        Calculates the remaining balance for the payment.
        """
        balance = obj.total_amount_due - obj.amount_paid
        return max(Decimal("0.00"), balance)

    def get_change_due(self, obj: Payment) -> Decimal:
        """
        Calculates the change due to the customer ONLY if the order is fully paid.
        """
        if obj.status == Payment.PaymentStatus.PAID:
            overpayment = obj.amount_paid - obj.total_amount_due
            return max(Decimal("0.00"), overpayment)
        return Decimal("0.00")

    def get_transaction_count(self, obj: Payment) -> int:
        """
        Returns the count of transactions associated with this payment.
        """
        return obj.transactions.count()

    def get_primary_method(self, obj: Payment) -> str:
        """
        Returns the primary payment method for this payment.
        - If multiple successful transactions: "SPLIT"
        - If single successful transaction: that method
        - If no successful transactions: first transaction's method or "N/A"
        """
        transactions = obj.transactions.all()

        if not transactions:
            return "N/A"

        # Find transactions that actually processed payment (successful or refunded)
        processed_transactions = [
            t for t in transactions
            if t.status in [PaymentTransaction.TransactionStatus.SUCCESSFUL, PaymentTransaction.TransactionStatus.REFUNDED]
        ]

        if not processed_transactions:
            # No successful payments, show method of first attempted transaction
            return transactions[0].method.replace("_", " ") if transactions[0].method else "N/A"

        # Check if it's a split payment (multiple processed transactions)
        if len(processed_transactions) > 1:
            return "SPLIT"

        # Single payment - return the method of the processed transaction
        return processed_transactions[0].method.replace("_", " ") if processed_transactions[0].method else "N/A"


# ============================================================================
# SPECIALIZED READ SERIALIZERS (Payment-specific views)
# ============================================================================

class OrderItemWithRefundSerializer(BaseModelSerializer):
    """
    OrderItem serializer that includes refund information.
    """
    product_name = serializers.SerializerMethodField()
    refunded_quantity = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "quantity",
            "refunded_quantity",
            "price_at_sale",
            "tax_amount",
            "notes",
            "status",
        ]

    def get_product_name(self, obj):
        """Get the product name or custom name."""
        if obj.product:
            return obj.product.name
        return obj.custom_name or "Custom Item"

    def get_refunded_quantity(self, obj):
        """Calculate total refunded quantity from RefundItem records."""
        from refunds.models import RefundItem

        total_refunded = RefundItem.objects.filter(
            order_item=obj
        ).aggregate(
            total=models.Sum('quantity_refunded')
        )['total'] or 0

        return total_refunded


class OrderWithItemsSerializer(BaseModelSerializer):
    """
    Order serializer for payment details that includes items with refund information.
    Used within PaymentSerializer to avoid circular imports.
    """
    items = OrderItemWithRefundSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "order_type",
            "payment_status",
            "store_location",
            "subtotal",
            "tax_total",
            "grand_total",
            "created_at",
            "updated_at",
            "items",
        ]
        select_related_fields = ["store_location"]
        prefetch_related_fields = ["items", "items__product"]


# ============================================================================
# WRITE/ACTION SERIALIZERS (Keep as-is)
# ============================================================================

class InitiateTerminalPaymentSerializer(serializers.Serializer):
    """
    Serializer for initiating a terminal payment. Only requires the amount,
    as the order is determined from the URL and the method is implicitly
    a terminal payment.
    """

    amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be a positive value.")
        return value


class ProcessPaymentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    method = serializers.ChoiceField(choices=PaymentTransaction.PaymentMethod.choices)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    tip = serializers.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    # Fields specific to online card payments
    payment_method_id = serializers.CharField(required=False, allow_blank=True)
    payment_intent_id = serializers.CharField(required=False, allow_blank=True)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be a positive value.")
        return value

    def validate(self, data):
        """
        Check that for online payments, either payment_method_id or
        payment_intent_id is provided.
        """
        if data.get("method") == PaymentTransaction.PaymentMethod.CARD_ONLINE:
            if not data.get("payment_method_id") and not data.get("payment_intent_id"):
                raise serializers.ValidationError(
                    "For online card payments, 'payment_method_id' or 'payment_intent_id' is required."
                )
        return data

    def create(self, validated_data):
        order = get_object_or_404(Order, id=validated_data["order_id"])

        # We call our service to do all the heavy lifting
        return PaymentService.process_transaction(
            order=order,
            method=validated_data["method"],
            amount=validated_data["amount"],
            tip=validated_data["tip"],
            # Pass extra data for the strategy
            payment_method_id=validated_data.get("payment_method_id"),
            payment_intent_id=validated_data.get("payment_intent_id"),
        )


class RefundTransactionSerializer(serializers.Serializer):
    """
    Serializer for initiating a refund on a specific transaction.
    """

    transaction_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Refund amount must be a positive value.")
        return value


class SurchargeCalculationSerializer(serializers.Serializer):
    """
    Serializer for calculating the surcharge on a given amount.
    Takes an amount and returns the calculated surcharge.
    """
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    amounts = serializers.ListField(
        child=serializers.DecimalField(max_digits=10, decimal_places=2),
        required=False
    )
    surcharge = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    surcharges = serializers.ListField(
        child=serializers.DecimalField(max_digits=10, decimal_places=2),
        read_only=True
    )

    def validate(self, data):
        if 'amount' not in data and 'amounts' not in data:
            raise serializers.ValidationError("Either 'amount' or 'amounts' is required.")
        if 'amount' in data and 'amounts' in data:
            raise serializers.ValidationError("Provide either 'amount' or 'amounts', not both.")
        return data


class GiftCardValidationSerializer(serializers.Serializer):
    """
    Serializer for validating a gift card code and returning balance information.
    """
    code = serializers.CharField(max_length=20)
    
    # Read-only fields for response
    is_valid = serializers.BooleanField(read_only=True)
    current_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    status = serializers.CharField(read_only=True)
    error_message = serializers.CharField(read_only=True, required=False)

    def validate_code(self, value):
        """Validate that the gift card code exists"""
        if not value.strip():
            raise serializers.ValidationError("Gift card code cannot be empty.")
        return value.strip().upper()

    def validate(self, data):
        """Check if the gift card exists and get its details"""
        code = data['code']
        
        try:
            gift_card = GiftCard.objects.get(code=code)
            data['gift_card'] = gift_card
            data['is_valid'] = gift_card.is_valid
            data['current_balance'] = gift_card.current_balance
            data['status'] = gift_card.status
            
            if not gift_card.is_valid:
                if gift_card.status == GiftCard.GiftCardStatus.INACTIVE:
                    data['error_message'] = "This gift card is inactive."
                elif gift_card.status == GiftCard.GiftCardStatus.EXPIRED:
                    data['error_message'] = "This gift card has expired."
                elif gift_card.status == GiftCard.GiftCardStatus.REDEEMED:
                    data['error_message'] = "This gift card has been fully redeemed."
                elif gift_card.current_balance <= 0:
                    data['error_message'] = "This gift card has no remaining balance."
                else:
                    data['error_message'] = "This gift card is not valid for use."
            
        except GiftCard.DoesNotExist:
            data['is_valid'] = False
            data['current_balance'] = Decimal("0.00")
            data['status'] = "NOT_FOUND"
            data['error_message'] = "Gift card not found."
            
        return data


class GiftCardPaymentSerializer(serializers.Serializer):
    """
    Serializer for processing a gift card payment.
    """
    order_id = serializers.UUIDField()
    gift_card_code = serializers.CharField(max_length=20)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    
    def validate_gift_card_code(self, value):
        """Validate that the gift card code exists and is valid"""
        if not value.strip():
            raise serializers.ValidationError("Gift card code cannot be empty.")
        
        code = value.strip().upper()
        try:
            gift_card = GiftCard.objects.get(code=code)
            if not gift_card.is_valid:
                raise serializers.ValidationError("This gift card is not valid for use.")
            return code
        except GiftCard.DoesNotExist:
            raise serializers.ValidationError("Gift card not found.")

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be a positive value.")
        return value

    def validate(self, data):
        """Validate that the gift card can cover the requested amount"""
        code = data['gift_card_code']
        amount = data['amount']
        
        try:
            gift_card = GiftCard.objects.get(code=code)
            if gift_card.current_balance < amount:
                raise serializers.ValidationError(
                    f"Insufficient gift card balance. Available: ${gift_card.current_balance}, Requested: ${amount}"
                )
            data['gift_card'] = gift_card
        except GiftCard.DoesNotExist:
            raise serializers.ValidationError("Gift card not found.")
            
        return data

    def create(self, validated_data):
        """Process the gift card payment"""
        order = get_object_or_404(Order, id=validated_data["order_id"])
        gift_card = validated_data['gift_card']
        amount = validated_data['amount']

        # Use the existing payment service to process the transaction
        return PaymentService.process_transaction(
            order=order,
            method="GIFT_CARD",
            amount=amount,
            tip=Decimal("0.00"),  # No tips on gift card payments
            gift_card_code=gift_card.code,
        )
