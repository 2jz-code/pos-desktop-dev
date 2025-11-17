from rest_framework import serializers
from core_backend.base.serializers import (
    BaseModelSerializer,
    FieldsetMixin,
    TenantFilteredSerializerMixin,
)
from .models import ManagerApprovalRequest, ApprovalPolicy


# ===== READ SERIALIZERS (Unified Pattern with Fieldsets) =====

class UnifiedManagerApprovalRequestSerializer(
    FieldsetMixin,
    TenantFilteredSerializerMixin,
    BaseModelSerializer
):
    """
    Unified read serializer for ManagerApprovalRequest with multiple fieldsets.

    Supports:
    - ?view=list|detail|queue (fieldsets)
    - ?fields=id,status,action_type (dynamic field filtering)
    - ?expand=initiator,approver,order,discount (expandable relationships)
    """

    # Display fields for better readability
    action_type_display = serializers.CharField(
        source='get_action_type_display',
        read_only=True
    )
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )

    # Computed properties
    is_expired = serializers.BooleanField(read_only=True)
    is_pending = serializers.BooleanField(read_only=True)
    can_be_approved = serializers.BooleanField(read_only=True)

    # Nested representation stubs (replaced by expandable)
    initiator_email = serializers.EmailField(source='initiator.email', read_only=True)
    initiator_name = serializers.SerializerMethodField()
    approver_email = serializers.EmailField(source='approver.email', read_only=True, allow_null=True)
    approver_name = serializers.SerializerMethodField()

    class Meta:
        model = ManagerApprovalRequest
        fields = '__all__'

        # Query optimization
        select_related_fields = ['initiator', 'approver', 'store_location', 'order', 'discount']
        prefetch_related_fields = []

        # Fieldsets for different views
        fieldsets = {
            'list': [
                'id',
                'action_type',
                'action_type_display',
                'status',
                'status_display',
                'initiator_id',
                'initiator_email',
                'initiator_name',
                'store_location_id',
                'order_id',
                'reason',
                'threshold_value',
                'expires_at',
                'created_at',
                'is_expired',
                'is_pending',
            ],
            'detail': '__all__',  # All fields
            'queue': [
                # Optimized for manager queue dashboards
                'id',
                'action_type',
                'action_type_display',
                'status',
                'status_display',
                'initiator_id',
                'initiator_email',
                'initiator_name',
                'store_location_id',
                'order_id',
                'discount_id',
                'payload',
                'reason',
                'threshold_value',
                'expires_at',
                'created_at',
                'is_expired',
                'is_pending',
                'can_be_approved',
            ],
        }

        # Expandable relationships
        expandable = {
            'initiator': ('users.serializers.UserSerializer', {'source': 'initiator', 'many': False}),
            'approver': ('users.serializers.UserSerializer', {'source': 'approver', 'many': False}),
            'order': ('orders.serializers.UnifiedOrderSerializer', {'source': 'order', 'many': False}),
            'discount': ('discounts.serializers.DiscountSerializer', {'source': 'discount', 'many': False}),
            'store_location': ('settings.serializers.StoreLocationSerializer', {'source': 'store_location', 'many': False}),
        }

    def get_initiator_name(self, obj):
        """Get initiator username or email"""
        if obj.initiator:
            return obj.initiator.username or obj.initiator.email
        return None

    def get_approver_name(self, obj):
        """Get approver username or email"""
        if obj.approver:
            return obj.approver.username or obj.approver.email
        return None


class UnifiedApprovalPolicySerializer(
    FieldsetMixin,
    TenantFilteredSerializerMixin,
    BaseModelSerializer
):
    """
    Unified read serializer for ApprovalPolicy with multiple fieldsets.
    """

    store_location_name = serializers.CharField(source='store_location.name', read_only=True)

    class Meta:
        model = ApprovalPolicy
        fields = '__all__'

        select_related_fields = ['store_location']
        prefetch_related_fields = []

        fieldsets = {
            'list': [
                'id',
                'store_location_id',
                'store_location_name',
                'max_discount_percent',
                'max_fixed_discount_amount',
                'max_refund_amount',
                'max_price_override_amount',
                'max_void_order_amount',
                'always_require_approval_for',
                'approval_expiry_minutes',
                'allow_self_approval',
            ],
            'detail': '__all__',
        }

        expandable = {
            'store_location': ('settings.serializers.StoreLocationSerializer', {'source': 'store_location', 'many': False}),
        }


# ===== WRITE SERIALIZERS =====

class ManagerApprovalRequestCreateSerializer(
    TenantFilteredSerializerMixin,
    serializers.ModelSerializer
):
    """
    Write serializer for creating new approval requests.

    Auto-sets: tenant, store_location, initiator, status, expires_at
    """

    class Meta:
        model = ManagerApprovalRequest
        fields = [
            'action_type',
            'order',
            'order_item',
            'discount',
            'related_object_label',
            'payload',
            'reason',
            'threshold_value',
        ]

    def validate(self, data):
        """Validate that at least one related object is provided"""
        related_objects = ['order', 'order_item', 'discount']
        if not any(data.get(field) for field in related_objects):
            # Check if related_object_label is provided for custom types
            if not data.get('related_object_label'):
                raise serializers.ValidationError(
                    "At least one related object (order, order_item, discount) "
                    "or related_object_label must be provided"
                )
        return data

    def create(self, validated_data):
        """
        Create approval request using the service layer.

        Note: This assumes the service is called from the view.
        This serializer just validates the input data.
        """
        # This is a validation-only serializer
        # Actual creation happens in the view via ManagerApprovalService.request_approval()
        raise NotImplementedError(
            "Use ManagerApprovalService.request_approval() to create approval requests"
        )


class ApprovalPolicyUpdateSerializer(
    TenantFilteredSerializerMixin,
    serializers.ModelSerializer
):
    """
    Write serializer for updating approval policies.

    Only allows updating threshold and configuration fields.
    """

    class Meta:
        model = ApprovalPolicy
        fields = [
            'max_discount_percent',
            'max_fixed_discount_amount',
            'max_refund_amount',
            'max_price_override_amount',
            'max_void_order_amount',
            'always_require_approval_for',
            'approval_expiry_minutes',
            'allow_self_approval',
            'purge_after_days',
        ]

    def validate_max_discount_percent(self, value):
        """Ensure discount percentage is between 0 and 100"""
        if value < 0 or value > 100:
            raise serializers.ValidationError("Discount percentage must be between 0 and 100")
        return value

    def validate_approval_expiry_minutes(self, value):
        """Ensure expiry is between 1 minute and 24 hours"""
        if value < 1 or value > 1440:
            raise serializers.ValidationError("Expiry must be between 1 and 1440 minutes (24 hours)")
        return value

    def validate_purge_after_days(self, value):
        """Ensure purge period is reasonable"""
        if value < 1 or value > 730:
            raise serializers.ValidationError("Purge period must be between 1 and 730 days (2 years)")
        return value

    def validate_always_require_approval_for(self, value):
        """Ensure only valid action types are provided"""
        from .models import ActionType

        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of action types")

        valid_action_types = [choice[0] for choice in ActionType.choices]
        invalid_types = [v for v in value if v not in valid_action_types]

        if invalid_types:
            raise serializers.ValidationError(
                f"Invalid action types: {', '.join(invalid_types)}. "
                f"Valid options: {', '.join(valid_action_types)}"
            )

        return value


# ===== ACTION SERIALIZERS =====

class ApproveRequestSerializer(serializers.Serializer):
    """
    Input serializer for approve action.
    """
    username = serializers.CharField(
        write_only=True,
        required=True,
        max_length=150,
        help_text="Manager's username"
    )
    pin = serializers.CharField(
        write_only=True,
        required=True,
        min_length=4,
        max_length=6,
        help_text="Manager's 4-6 digit PIN code"
    )

    def validate_pin(self, value):
        """Validate PIN format"""
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits")
        if len(value) < 4 or len(value) > 6:
            raise serializers.ValidationError("PIN must be 4-6 digits")
        return value


class DenyRequestSerializer(serializers.Serializer):
    """
    Input serializer for deny action.
    """
    username = serializers.CharField(
        write_only=True,
        required=True,
        max_length=150,
        help_text="Manager's username"
    )
    pin = serializers.CharField(
        write_only=True,
        required=True,
        min_length=4,
        max_length=6,
        help_text="Manager's 4-6 digit PIN code"
    )
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
        help_text="Optional reason for denial"
    )

    def validate_pin(self, value):
        """Validate PIN format"""
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits")
        if len(value) < 4 or len(value) > 6:
            raise serializers.ValidationError("PIN must be 4-6 digits")
        return value


# ===== RESPONSE SERIALIZERS =====

class ApprovalActionResponseSerializer(serializers.Serializer):
    """
    Output serializer for approve/deny action responses.
    """
    success = serializers.BooleanField()
    message = serializers.CharField()
    request = UnifiedManagerApprovalRequestSerializer()
