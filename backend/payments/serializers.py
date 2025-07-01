from rest_framework import serializers
from decimal import Decimal
from .models import Payment, PaymentTransaction, Order
from .services import PaymentService
from django.shortcuts import get_object_or_404
from orders.serializers import SimpleOrderSerializer


class PaymentTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTransaction
        fields = "__all__"


class PaymentSerializer(serializers.ModelSerializer):
    transactions = PaymentTransactionSerializer(many=True, read_only=True)
    order = SimpleOrderSerializer(read_only=True)

    balance_due = serializers.SerializerMethodField()
    change_due = serializers.SerializerMethodField()
    order_number = serializers.CharField(source="order.order_number", read_only=True)

    class Meta:
        model = Payment
        fields = "__all__"
        select_related_fields = ["order", "order__customer", "order__cashier"]
        prefetch_related_fields = ["transactions"]
        read_only_fields = [
            "id",
            "balance_due",
            "change_due",
            "created_at",
            "updated_at",
            "transactions",
            "order_number",  # Keep if applicable
            "payment_number",
        ]

    def get_balance_due(self, obj: Payment) -> Decimal:
        """
        Calculates the remaining balance for the payment.
        """
        # The 'obj' is the Payment instance being serialized.
        balance = obj.total_amount_due - obj.amount_paid
        # Ensure balance doesn't go below zero for representation purposes.
        return max(Decimal("0.00"), balance)

    def get_change_due(self, obj: Payment) -> Decimal:
        """
        Calculates the change due to the customer ONLY if the order is fully paid.
        """
        if obj.status == Payment.PaymentStatus.PAID:
            # Change is calculated as the amount overpaid.
            overpayment = obj.amount_paid - obj.total_amount_due
            return max(Decimal("0.00"), overpayment)

        # If the payment is not fully paid, no change is due.
        return Decimal("0.00")


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
