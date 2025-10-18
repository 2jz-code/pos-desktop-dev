"""
Cart serializers for API representation.

These serializers handle the conversion between Cart models and JSON
for the customer-facing API.
"""

from rest_framework import serializers
from decimal import Decimal

from .models import Cart, CartItem, CartItemModifier
from products.serializers import ProductSerializer
from products.models import Product


class CartItemModifierSerializer(serializers.ModelSerializer):
    """
    Serializer for cart item modifiers.
    Shows modifier details with live pricing.
    """
    modifier_set_name = serializers.CharField(
        source='modifier_option.modifier_set.name',
        read_only=True
    )
    option_name = serializers.CharField(
        source='modifier_option.name',
        read_only=True
    )
    price_delta = serializers.DecimalField(
        source='modifier_option.price_delta',
        max_digits=10,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = CartItemModifier
        fields = [
            'id',
            'modifier_set_name',
            'option_name',
            'price_delta',
            'quantity',
            'total_price'
        ]
        read_only_fields = ['id', 'total_price']


class CartItemSerializer(serializers.ModelSerializer):
    """
    Serializer for cart items.
    Includes product details and calculated prices (dynamic, not snapshot).
    """
    product = ProductSerializer(read_only=True)
    modifiers = CartItemModifierSerializer(many=True, read_only=True)

    # Calculated fields (dynamic pricing)
    base_price = serializers.SerializerMethodField()
    modifiers_total = serializers.SerializerMethodField()
    item_price = serializers.SerializerMethodField()
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            'id',
            'product',
            'quantity',
            'notes',
            'base_price',
            'modifiers',
            'modifiers_total',
            'item_price',
            'total_price',
            'added_at',
            'updated_at'
        ]
        read_only_fields = [
            'id',
            'base_price',
            'modifiers_total',
            'item_price',
            'total_price',
            'added_at',
            'updated_at'
        ]

    def get_base_price(self, obj):
        """Get base price for this product (future: location-specific)."""
        return str(obj.get_base_price())

    def get_modifiers_total(self, obj):
        """Get total price from all modifiers."""
        return str(obj.get_modifiers_total())

    def get_item_price(self, obj):
        """Get price for one item (base + modifiers)."""
        return str(obj.get_item_price())

    def get_total_price(self, obj):
        """Get total price for this cart item (item_price * quantity)."""
        return str(obj.get_total_price())


class CartSerializer(serializers.ModelSerializer):
    """
    Serializer for cart with all totals.
    Includes calculated financial data using OrderCalculator.
    """
    items = CartItemSerializer(many=True, read_only=True)

    # Store location info
    store_location_id = serializers.UUIDField(
        source='store_location.id',
        read_only=True,
        allow_null=True
    )
    store_location_name = serializers.CharField(
        source='store_location.name',
        read_only=True,
        allow_null=True
    )
    store_location_tax_rate = serializers.DecimalField(
        source='store_location.tax_rate',
        max_digits=5,
        decimal_places=4,
        read_only=True,
        allow_null=True
    )

    # Calculated totals
    totals = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = [
            'id',
            'customer',
            'session_id',
            'store_location_id',
            'store_location_name',
            'store_location_tax_rate',
            'guest_first_name',
            'guest_last_name',
            'guest_email',
            'guest_phone',
            'items',
            'totals',
            'item_count',
            'is_guest_cart',
            'created_at',
            'updated_at',
            'last_activity'
        ]
        read_only_fields = [
            'id',
            'customer',
            'session_id',
            'item_count',
            'is_guest_cart',
            'created_at',
            'updated_at',
            'last_activity'
        ]

    def get_totals(self, obj):
        """
        Get all calculated totals using OrderCalculator (DRY).

        Returns:
            dict: {
                'subtotal': str,
                'discount_total': str,
                'tax_total': str,
                'grand_total': str,
                'item_count': int,
                'has_location': bool
            }
        """
        totals = obj.get_totals()

        # Convert Decimals to strings for JSON serialization
        return {
            'subtotal': str(totals['subtotal']),
            'discount_total': str(totals['discount_total']),
            'tax_total': str(totals['tax_total']),
            'grand_total': str(totals['grand_total']),
            'item_count': totals['item_count'],
            'has_location': totals['has_location']
        }


class AddToCartSerializer(serializers.Serializer):
    """
    Serializer for adding items to cart.

    Request body format:
    {
        "product_id": "uuid",
        "quantity": 1,
        "selected_modifiers": [
            {"option_id": "uuid", "quantity": 1}
        ],
        "notes": "No onions"
    }
    """
    product_id = serializers.UUIDField(required=True)
    quantity = serializers.IntegerField(default=1, min_value=1)
    selected_modifiers = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list
    )
    notes = serializers.CharField(
        required=False,
        default="",
        allow_blank=True,
        max_length=500
    )

    def validate_product_id(self, value):
        """Validate product exists."""
        try:
            Product.objects.get(id=value)
        except Product.DoesNotExist:
            raise serializers.ValidationError("Product not found")
        return value

    def validate_selected_modifiers(self, value):
        """Validate modifier format."""
        for modifier in value:
            if 'option_id' not in modifier:
                raise serializers.ValidationError(
                    "Each modifier must have 'option_id'"
                )
        return value


class UpdateCartItemSerializer(serializers.Serializer):
    """
    Serializer for updating cart item quantity.

    Request body format:
    {
        "quantity": 2
    }
    """
    quantity = serializers.IntegerField(min_value=1, required=True)


class SetCartLocationSerializer(serializers.Serializer):
    """
    Serializer for setting cart location (checkout step 1).

    Request body format:
    {
        "store_location_id": "uuid"
    }
    """
    store_location_id = serializers.UUIDField(required=True)

    def validate_store_location_id(self, value):
        """Validate store location exists and belongs to tenant."""
        from settings.models import StoreLocation

        # Get tenant from context
        request = self.context.get('request')
        if not request or not hasattr(request, 'tenant'):
            raise serializers.ValidationError("Tenant context not available")

        try:
            location = StoreLocation.objects.get(
                id=value,
                tenant=request.tenant
            )
        except StoreLocation.DoesNotExist:
            raise serializers.ValidationError(
                "Store location not found or doesn't belong to this tenant"
            )

        return value


class UpdateCartCustomerInfoSerializer(serializers.Serializer):
    """
    Serializer for updating cart customer info (checkout step 2).

    Request body format:
    {
        "guest_first_name": "John",
        "guest_last_name": "Doe",
        "guest_email": "john@example.com",
        "guest_phone": "1234567890"
    }
    """
    guest_first_name = serializers.CharField(required=False, max_length=100, allow_blank=True)
    guest_last_name = serializers.CharField(required=False, max_length=100, allow_blank=True)
    guest_email = serializers.EmailField(required=False, allow_blank=True)
    guest_phone = serializers.CharField(required=False, max_length=20, allow_blank=True)
