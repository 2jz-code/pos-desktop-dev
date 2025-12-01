"""
Serializers for offline ingest endpoints.

These serializers validate complex payloads from terminals that were
created while offline and are now being synced to the backend.

PAYLOAD CONTRACT: Keep in sync with frontend types:
- electron-app/src/shared/types/offlineSync.ts
- electron-app/src/services/OfflineSyncService.js (buildIngestPayload)

ID TYPES NOTE:
- Most models use UUID primary keys (Product, Order, User, etc.)
- ModifierSet and ModifierOption use integer PKs
- modifier_set_id and modifier_option_id use CharField to accept both
"""
from rest_framework import serializers
from decimal import Decimal


class OfflineModifierSerializer(serializers.Serializer):
    """Modifier applied to an order item"""
    # Use CharField to accept both integer PKs (from ModifierSet/ModifierOption models)
    # and UUIDs (if codebase migrates to UUIDs in future)
    modifier_set_id = serializers.CharField(max_length=50)
    modifier_option_id = serializers.CharField(max_length=50)
    price_delta = serializers.DecimalField(max_digits=10, decimal_places=2)


class OfflineItemAdjustmentSerializer(serializers.Serializer):
    """Item-level adjustment (price override, tax exempt, one-off discount)"""
    # Allow all adjustment types at item level - they can all apply to items
    adjustment_type = serializers.ChoiceField(
        choices=['PRICE_OVERRIDE', 'TAX_EXEMPT', 'ONE_OFF_DISCOUNT', 'FEE_EXEMPT']
    )
    discount_type = serializers.ChoiceField(
        choices=['PERCENTAGE', 'FIXED'],
        required=False,
        allow_null=True
    )
    # Increased max_digits to handle larger values safely
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    notes = serializers.CharField(max_length=500, allow_blank=True, default='')
    approved_by_user_id = serializers.UUIDField(allow_null=True, required=False)
    approval_pin = serializers.CharField(max_length=255, allow_null=True, required=False)


class OfflineOrderItemSerializer(serializers.Serializer):
    """Single line item in an offline order"""
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    price_at_sale = serializers.DecimalField(max_digits=10, decimal_places=2)
    notes = serializers.CharField(max_length=500, allow_blank=True, default='')
    modifiers = OfflineModifierSerializer(many=True, required=False, default=list)
    adjustments = OfflineItemAdjustmentSerializer(many=True, required=False, default=list)


class OfflineDiscountSerializer(serializers.Serializer):
    """Applied discount"""
    discount_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)


class OfflineOrderAdjustmentSerializer(serializers.Serializer):
    """Order-level adjustment (one-off discount, fee exempt, tax exempt)"""
    # Allow all adjustment types at order level
    adjustment_type = serializers.ChoiceField(
        choices=['ONE_OFF_DISCOUNT', 'FEE_EXEMPT', 'TAX_EXEMPT', 'PRICE_OVERRIDE']
    )
    discount_type = serializers.ChoiceField(
        choices=['PERCENTAGE', 'FIXED'],
        required=False,
        allow_null=True
    )
    # Increased max_digits to handle larger values safely
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    notes = serializers.CharField(max_length=500, allow_blank=True, default='')
    approved_by_user_id = serializers.UUIDField(allow_null=True, required=False)
    approval_pin = serializers.CharField(max_length=255, allow_null=True, required=False)


class OfflinePaymentSerializer(serializers.Serializer):
    """Payment made offline"""
    method = serializers.ChoiceField(choices=['CASH', 'CARD_TERMINAL', 'GIFT_CARD'])
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    tip = serializers.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    surcharge = serializers.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    status = serializers.ChoiceField(choices=['COMPLETED', 'PENDING'], default='COMPLETED')
    transaction_id = serializers.CharField(max_length=255, allow_null=True, required=False)
    provider_response = serializers.JSONField(required=False, default=dict)
    gift_card_code = serializers.CharField(max_length=255, allow_null=True, required=False)
    cash_tendered = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True, required=False)
    change_given = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True, required=False)


class OfflineInventoryDeltaSerializer(serializers.Serializer):
    """Inventory stock change"""
    product_id = serializers.UUIDField()
    location_id = serializers.UUIDField()
    quantity_change = serializers.DecimalField(max_digits=10, decimal_places=2)
    reason = serializers.CharField(max_length=50, default='ORDER_DEDUCTION')


class OfflineApprovalSerializer(serializers.Serializer):
    """Manager approval performed offline"""
    user_id = serializers.UUIDField()
    pin = serializers.CharField(max_length=255)
    action = serializers.ChoiceField(choices=['DISCOUNT', 'VOID', 'REFUND', 'PRICE_OVERRIDE'])
    reference = serializers.CharField(max_length=255)
    timestamp = serializers.DateTimeField()


class OfflineOrderSerializer(serializers.Serializer):
    """
    Complete offline order payload.

    This represents an order that was created while the terminal was offline
    and is now being synced to the backend.
    """
    # Operation metadata
    operation_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=255)  # Can be device_id or fingerprint
    nonce = serializers.CharField(max_length=255)
    # created_at is used for auth freshness check (must be recent)
    created_at = serializers.DateTimeField()
    # offline_created_at is the actual time the order was created offline
    offline_created_at = serializers.DateTimeField(required=False, allow_null=True)
    dataset_versions = serializers.DictField(
        child=serializers.CharField(),
        required=False,
        default=dict
    )

    # Order details
    order = serializers.DictField()  # Will be validated separately

    # Payments
    payments = OfflinePaymentSerializer(many=True, default=list)

    # Inventory changes
    inventory_deltas = OfflineInventoryDeltaSerializer(many=True, required=False, default=list)

    # Approvals
    approvals = OfflineApprovalSerializer(many=True, required=False, default=list)

    def validate_order(self, value):
        """Validate nested order object"""
        # Basic required fields
        required = ['order_type', 'status', 'store_location_id', 'items', 'subtotal', 'tax', 'total']
        for field in required:
            if field not in value:
                raise serializers.ValidationError(f"Missing required field: {field}")

        # Validate order_type (matches Order.OrderType choices)
        valid_order_types = ['POS', 'WEB', 'APP', 'DOORDASH', 'UBER_EATS']
        if value['order_type'] not in valid_order_types:
            raise serializers.ValidationError(f"Invalid order_type: {value['order_type']}. Must be one of {valid_order_types}")

        # Validate dining_preference (matches Order.DiningPreference choices)
        valid_dining_prefs = ['DINE_IN', 'TAKE_OUT']
        dining_pref = value.get('dining_preference', 'TAKE_OUT')
        if dining_pref not in valid_dining_prefs:
            raise serializers.ValidationError(f"Invalid dining_preference: {dining_pref}. Must be one of {valid_dining_prefs}")

        # Validate status
        if value['status'] not in ['PENDING', 'COMPLETED']:
            raise serializers.ValidationError(f"Invalid status: {value['status']}")

        # Validate items
        if not isinstance(value['items'], list) or len(value['items']) == 0:
            raise serializers.ValidationError("Order must have at least one item")

        # Validate items using serializer
        items_serializer = OfflineOrderItemSerializer(data=value['items'], many=True)
        if not items_serializer.is_valid():
            raise serializers.ValidationError({'items': items_serializer.errors})

        # Validate discounts if present
        if 'discounts' in value and value['discounts']:
            discounts_serializer = OfflineDiscountSerializer(data=value['discounts'], many=True)
            if not discounts_serializer.is_valid():
                raise serializers.ValidationError({'discounts': discounts_serializer.errors})

        # Validate adjustments if present
        if 'adjustments' in value and value['adjustments']:
            adjustments_serializer = OfflineOrderAdjustmentSerializer(data=value['adjustments'], many=True)
            if not adjustments_serializer.is_valid():
                raise serializers.ValidationError({'adjustments': adjustments_serializer.errors})

        return value


class OfflineInventoryIngestSerializer(serializers.Serializer):
    """
    Inventory deltas payload.

    Batch of inventory stock changes to apply.
    """
    operation_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=255)
    nonce = serializers.CharField(max_length=255)
    store_location_id = serializers.UUIDField()
    dataset_version = serializers.CharField(required=False, allow_blank=True)
    deltas = OfflineInventoryDeltaSerializer(many=True)


class OfflineApprovalsIngestSerializer(serializers.Serializer):
    """
    Manager approvals payload.

    Batch of approvals performed offline.
    """
    operation_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=255)
    nonce = serializers.CharField(max_length=255)
    approvals = OfflineApprovalSerializer(many=True)


class ConflictDetailSerializer(serializers.Serializer):
    """Details about a conflict"""
    type = serializers.ChoiceField(choices=[
        'PRODUCT_DELETED',
        'PRICE_CHANGED',
        'INSUFFICIENT_STOCK',
        'DISCOUNT_EXPIRED',
        'VERSION_MISMATCH'
    ])
    product_id = serializers.UUIDField(required=False, allow_null=True)
    message = serializers.CharField()
    expected_version = serializers.CharField(required=False, allow_null=True)
    actual_version = serializers.CharField(required=False, allow_null=True)


class OfflineOrderIngestResponseSerializer(serializers.Serializer):
    """
    Response from offline order ingest.

    Returns success/conflict/error status with details.
    """
    status = serializers.ChoiceField(choices=['SUCCESS', 'CONFLICT', 'ERROR'])
    order_number = serializers.CharField(required=False, allow_null=True)
    order_id = serializers.UUIDField(required=False, allow_null=True)
    conflicts = ConflictDetailSerializer(many=True, required=False, default=list)
    errors = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list
    )
