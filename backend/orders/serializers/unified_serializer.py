from rest_framework import serializers
from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier, OrderAdjustment
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import FieldsetMixin, TenantFilteredSerializerMixin
from django.db import transaction

from users.serializers import UnifiedUserSerializer
from products.serializers import ProductSerializer
from discounts.serializers import DiscountSerializer
from django.db.models import Prefetch

# Import sibling serializers
from .order_item_serializers import OrderItemSerializer, OrderItemModifierSerializer
from .discount_serializers import OrderDiscountSerializer
from .adjustment_serializers import OrderAdjustmentSerializer


class UnifiedOrderSerializer(
    FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer
):
    """
    Unified serializer for Order that consolidates SimpleOrderSerializer,
    OptimizedOrderSerializer, and OrderSerializer.

    Supports multiple view modes via ?view= param:
    - simple: Minimal fields, breaks circular import with payments (no nested objects)
    - list: Lightweight for list endpoints (minimal computed fields)
    - detail: Full representation with all nested objects (default)

    Supports expansion via ?expand= param:
    - customer: Nests full User object
    - cashier: Nests full User object
    - items: Nests full OrderItem array
    - applied_discounts: Nests full OrderDiscount array
    - payment_details: Nests full Payment object (lazy import)
    - store_location_details: Nests full StoreLocation object (lazy import)

    Usage:
        GET /orders/              → list mode
        GET /orders/?view=simple  → simple mode
        GET /orders/?view=detail  → detail mode
        GET /orders/1/            → detail mode (default for retrieve)
        GET /orders/1/?expand=items,payment_details → detail + nested objects
        GET /orders/?fields=id,order_number → only specified fields
    """

    # Nested serializers for detail mode
    items = OrderItemSerializer(many=True, read_only=True)
    cashier = UnifiedUserSerializer(read_only=True)
    customer = UnifiedUserSerializer(read_only=True)
    applied_discounts = OrderDiscountSerializer(many=True, read_only=True)
    adjustments = OrderAdjustmentSerializer(many=True, read_only=True)

    # SerializerMethodFields (lazy imports for circular dependency)
    payment_details = serializers.SerializerMethodField()
    store_location_details = serializers.SerializerMethodField()

    # Payment-related computed fields
    total_with_tip = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    total_tips = serializers.SerializerMethodField()
    total_surcharges = serializers.SerializerMethodField()
    total_collected = serializers.SerializerMethodField()

    # List mode computed fields
    item_count = serializers.IntegerField(source="items.count", read_only=True)
    cashier_name = serializers.CharField(source="cashier.get_full_name", read_only=True)

    # Model properties
    is_guest_order = serializers.ReadOnlyField()
    customer_email = serializers.ReadOnlyField()
    customer_phone = serializers.ReadOnlyField()
    customer_display_name = serializers.ReadOnlyField()
    payment_in_progress = serializers.ReadOnlyField(
        source="payment_in_progress_derived"
    )

    class Meta:
        model = Order
        fields = "__all__"
        read_only_fields = [
            "id",
            "order_number",
            "status",
            "payment_status",
            "subtotal",
            "total_discounts_amount",
            "total_adjustments_amount",
            "tax_total",
            "grand_total",
            "created_at",
            "updated_at",
        ]

        # Define view modes
        fieldsets = {
            # Minimal reference (breaks circular import with payments)
            "simple": [
                "id",
                "order_number",
                "status",
                "order_type",
                "payment_status",
                "store_location",
                "grand_total",
                "created_at",
                "updated_at",
            ],
            # Lightweight list view (POS/admin)
            "list": [
                "id",
                "order_number",
                "status",
                "order_type",
                "payment_status",
                "store_location",
                "total_with_tip",
                "total_collected",
                "item_count",
                "cashier_name",
                "customer_display_name",
                "created_at",
                "updated_at",
                "completed_at",
                "payment_in_progress",
            ],
            # Optimized for WebSocket real-time updates
            # Only includes fields actively used by frontend (electron-app/src/domains/pos/store/cartSlice.js)
            # Analysis: cartSocket.js setCartFromSocket() only reads:
            #   - items, id, order_number, status, grand_total, subtotal, tax_total,
            #     total_discounts_amount, total_adjustments_amount, applied_discounts, adjustments, guest_first_name, dining_preference
            "websocket": [
                # Core fields (used by cartSlice.js)
                "id",                      # → orderId
                "order_number",            # → orderNumber
                "status",                  # → orderStatus
                "dining_preference",       # → used in resumeCart
                # Financial fields (used by cartSlice.js)
                "subtotal",                # → subtotal
                "tax_total",               # → taxAmount
                "total_discounts_amount",  # → totalDiscountsAmount
                "total_adjustments_amount",# → totalAdjustmentsAmount
                "grand_total",             # → total
                # Relationships (used by cart UI)
                "items",                   # → items array
                "applied_discounts",       # → appliedDiscounts
                "adjustments",             # → adjustments array (one-off discounts, price overrides)
                # Customer info (used in resumeCart)
                "guest_first_name",        # → used when resuming order
            ],
            # Full detail (default) - includes all fields
            "detail": [
                # Core fields
                "id",
                "order_number",
                "status",
                "order_type",
                "payment_status",
                "dining_preference",
                "store_location",
                # Financial fields
                "subtotal",
                "tax_total",
                "total_discounts_amount",
                "total_adjustments_amount",
                "surcharges_total",
                "grand_total",
                "total_with_tip",
                "amount_paid",
                "total_tips",
                "total_surcharges",
                "total_collected",
                # Relationships (nested)
                "customer",
                "cashier",
                "items",
                "applied_discounts",
                "adjustments",
                "payment_details",
                "store_location_details",
                # Customer info
                "is_guest_order",
                "customer_display_name",
                "customer_email",
                "customer_phone",
                "guest_first_name",
                "guest_last_name",
                "guest_email",
                "guest_phone",
                "guest_session_key",
                # Metadata
                "created_at",
                "updated_at",
                "completed_at",
                "legacy_id",
            ],
        }

        # Define expandable relationships
        expandable = {
            "customer": (UnifiedUserSerializer, {"source": "customer", "many": False}),
            "cashier": (UnifiedUserSerializer, {"source": "cashier", "many": False}),
            "items": (OrderItemSerializer, {"source": "items", "many": True}),
            "applied_discounts": (
                OrderDiscountSerializer,
                {"source": "applied_discounts", "many": True},
            ),
            "adjustments": (
                OrderAdjustmentSerializer,
                {"source": "adjustments", "many": True},
            ),
            # payment_details and store_location_details use lazy imports via SerializerMethodFields
        }

        # Optimization fields
        select_related_fields = [
            "customer",
            "cashier",
            "payment_details",
            "store_location",
        ]
        prefetch_related_fields = [
            "items__product__category",
            "items__product__product_type",
            "items__selected_modifiers_snapshot",
            "applied_discounts__discount",
            "payment_details__transactions",
        ]

        # Fields that must always be included
        required_fields = {"id", "order_number"}

    def to_internal_value(self, data):
        """
        Override to populate missing constraint fields from instance for partial updates.

        For partial updates (PATCH), UniqueConstraint validators with conditions need
        all condition fields to be present in the attrs dict. We populate missing
        fields from the existing instance so validators can access them.
        """
        attrs = super().to_internal_value(data)

        # For partial updates, add fields from instance that validators need
        if self.partial and self.instance:
            condition_fields = set()
            for validator in self.get_validators():
                if hasattr(validator, "condition_fields"):
                    condition_fields.update(validator.condition_fields)

            for field in condition_fields:
                if field not in attrs and hasattr(self.instance, field):
                    attrs[field] = getattr(self.instance, field)

        return attrs

    # SerializerMethodField implementations

    def get_payment_details(self, obj):
        """
        Lazily import PaymentSerializer to avoid circular dependency.
        """
        from payments.serializers import UnifiedPaymentSerializer

        if hasattr(obj, "payment_details") and obj.payment_details:
            return UnifiedPaymentSerializer(obj.payment_details).data
        return None

    def get_store_location_details(self, obj):
        """
        Return nested store location details for confirmation page.
        Includes all relevant contact and address information.
        """
        from settings.serializers import StoreLocationSerializer

        if hasattr(obj, "store_location") and obj.store_location:
            return StoreLocationSerializer(obj.store_location).data
        return None

    def get_total_with_tip(self, obj):
        """Get total with tip from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_amount_due + obj.payment_details.total_tips
        return obj.grand_total

    def get_amount_paid(self, obj):
        """Get amount paid from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.amount_paid
        return 0.00

    def get_total_tips(self, obj):
        """Get total tips from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_tips
        return 0.00

    def get_total_surcharges(self, obj):
        """Get total surcharges from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_surcharges
        return 0.00

    def get_total_collected(self, obj):
        """Get total collected from prefetched payment details"""
        if hasattr(obj, "payment_details") and obj.payment_details:
            return obj.payment_details.total_collected
        return 0.00

