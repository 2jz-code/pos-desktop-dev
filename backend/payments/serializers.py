from rest_framework import serializers
from decimal import Decimal
from .models import Payment, PaymentTransaction, Order, GiftCard
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


class GiftCardSerializer(serializers.ModelSerializer):
    """
    Serializer for GiftCard model - used for display purposes.
    """
    is_valid = serializers.ReadOnlyField()
    
    class Meta:
        model = GiftCard
        fields = "__all__"
        read_only_fields = [
            "id",
            "issued_date",
            "last_used_date",
            "created_at",
            "updated_at",
            "is_valid",
        ]


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
