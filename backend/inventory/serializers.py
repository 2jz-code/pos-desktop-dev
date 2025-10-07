from rest_framework import serializers
from .models import Location, InventoryStock, Recipe, RecipeItem, StockHistoryEntry
from products.models import Product
from products.serializers import ProductSerializer
from .services import InventoryService
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import TenantFilteredSerializerMixin


class LocationSerializer(BaseModelSerializer):
    effective_low_stock_threshold = serializers.ReadOnlyField()
    effective_expiration_threshold = serializers.ReadOnlyField()

    class Meta:
        model = Location
        fields = [
            "id",
            "name",
            "description",
            "low_stock_threshold",
            "expiration_threshold",
            "effective_low_stock_threshold",
            "effective_expiration_threshold",
        ]
        prefetch_related_fields = ["stock_levels__product"]


# Optimized serializers for stock management to avoid N+1 queries
class OptimizedProductSerializer(BaseModelSerializer):
    """Lightweight product serializer for inventory management"""

    category_name = serializers.CharField(source="category.name", read_only=True)
    product_type_name = serializers.CharField(
        source="product_type.name", read_only=True
    )

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "barcode",
            "is_active",
            "is_public",
            "track_inventory",
            "category_name",
            "product_type_name",
        ]
        select_related_fields = ["category", "product_type"]


class OptimizedLocationSerializer(BaseModelSerializer):
    """Lightweight location serializer for inventory management"""

    effective_low_stock_threshold = serializers.ReadOnlyField()
    effective_expiration_threshold = serializers.ReadOnlyField()

    class Meta:
        model = Location
        fields = [
            "id",
            "name",
            "description",
            "effective_low_stock_threshold",
            "effective_expiration_threshold",
        ]


class OptimizedInventoryStockSerializer(BaseModelSerializer):
    """Optimized serializer for stock management endpoint"""

    product = OptimizedProductSerializer(read_only=True)
    location = OptimizedLocationSerializer(read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    is_expiring_soon = serializers.ReadOnlyField()
    effective_low_stock_threshold = serializers.ReadOnlyField()
    effective_expiration_threshold = serializers.ReadOnlyField()

    class Meta:
        model = InventoryStock
        fields = [
            "id",
            "product",
            "location",
            "quantity",
            "expiration_date",
            "low_stock_threshold",
            "expiration_threshold",
            "effective_low_stock_threshold",
            "effective_expiration_threshold",
            "is_low_stock",
            "is_expiring_soon",
        ]
        # Optimized for list view - minimal relationships
        select_related_fields = ["product__category", "product__product_type", "location"]


class FullInventoryStockSerializer(BaseModelSerializer):
    """Full serializer for detailed inventory operations"""

    product = ProductSerializer(read_only=True)
    location = LocationSerializer(read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    is_expiring_soon = serializers.ReadOnlyField()
    effective_low_stock_threshold = serializers.ReadOnlyField()
    effective_expiration_threshold = serializers.ReadOnlyField()

    class Meta:
        model = InventoryStock
        fields = [
            "id",
            "product",
            "location",
            "quantity",
            "expiration_date",
            "low_stock_threshold",
            "expiration_threshold",
            "effective_low_stock_threshold",
            "effective_expiration_threshold",
            "is_low_stock",
            "is_expiring_soon",
        ]
        select_related_fields = ["product__category", "location"]
        prefetch_related_fields = ["product__taxes"]


class RecipeItemSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
    product = OptimizedProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source="product", write_only=True
    )

    class Meta:
        model = RecipeItem
        fields = ["id", "product_id", "product", "quantity", "unit"]
        select_related_fields = ["product__category", "product__product_type"]


class RecipeSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
    menu_item = OptimizedProductSerializer(read_only=True)
    menu_item_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(product_type__name="menu"),
        source="menu_item",
        write_only=True,
    )
    ingredients = RecipeItemSerializer(many=True)

    class Meta:
        model = Recipe
        fields = ["id", "name", "menu_item_id", "menu_item", "ingredients"]
        select_related_fields = ["menu_item__category", "menu_item__product_type"]
        prefetch_related_fields = ["ingredients__product__category", "ingredients__product__product_type"]

    def to_representation(self, instance):
        representation = super().to_representation(instance)

        # Manually serialize the prefetched ingredients
        if hasattr(instance, "ingredients"):
            representation["ingredients"] = RecipeItemSerializer(
                instance.ingredients.all(), many=True
            ).data

        return representation

    def create(self, validated_data):
        from tenant.managers import get_current_tenant

        ingredients_data = validated_data.pop("ingredients")
        tenant = get_current_tenant()

        # Create recipe with tenant
        recipe = Recipe.objects.create(tenant=tenant, **validated_data)

        # Create recipe items with tenant
        for ingredient_data in ingredients_data:
            RecipeItem.objects.create(recipe=recipe, tenant=tenant, **ingredient_data)

        return recipe


# --- Service-driven Serializers ---


class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    location_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    expiration_date = serializers.DateField(required=False, allow_null=True)
    low_stock_threshold = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    expiration_threshold = serializers.IntegerField(required=False)
    user_id = serializers.IntegerField(required=False)
    
    # New structured reason fields
    reason_id = serializers.IntegerField(
        required=True,
        help_text="ID of the stock action reason configuration"
    )
    detailed_reason = serializers.CharField(
        max_length=500, 
        required=False, 
        allow_blank=True,
        help_text="Optional detailed explanation for this stock adjustment"
    )
    
    # Legacy reason field (for backward compatibility during migration)
    reason = serializers.CharField(
        max_length=255, 
        required=False, 
        allow_blank=True,
        help_text="Legacy reason field - will be deprecated"
    )
    
    def validate_reason_id(self, value):
        """Validate that the reason_id corresponds to an active reason config"""
        try:
            from settings.models import StockActionReasonConfig
            # Validate the reason exists and is active, but return the ID
            StockActionReasonConfig.objects.get(id=value, is_active=True)
            return value  # Return the ID, not the object
        except StockActionReasonConfig.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive reason configuration.")

    def save(self):
        product = Product.objects.get(id=self.validated_data["product_id"])
        location = Location.objects.get(id=self.validated_data["location_id"])
        quantity = self.validated_data["quantity"]
        expiration_date = self.validated_data.get("expiration_date")
        low_stock_threshold = self.validated_data.get("low_stock_threshold")
        expiration_threshold = self.validated_data.get("expiration_threshold")
        user_id = self.validated_data.get("user_id")
        reason_id = self.validated_data.get("reason_id")
        detailed_reason = self.validated_data.get("detailed_reason", "")
        legacy_reason = self.validated_data.get("reason", "")  # For backward compatibility
        
        # Convert reason_id to reason_config object
        reason_config = None
        if reason_id:
            from settings.models import StockActionReasonConfig
            try:
                reason_config = StockActionReasonConfig.objects.get(id=reason_id, is_active=True)
            except StockActionReasonConfig.DoesNotExist:
                # This shouldn't happen due to validation, but just in case
                reason_config = None
        
        # Get user object if user_id provided
        user = None
        if user_id:
            from users.models import User
            user = User.objects.get(id=user_id)

        # A positive quantity adds stock, a negative quantity decrements stock
        if quantity > 0:
            stock = InventoryService.add_stock(
                product, 
                location, 
                quantity, 
                user=user, 
                reason_config=reason_config,
                detailed_reason=detailed_reason,
                legacy_reason=legacy_reason
            )
        else:
            stock = InventoryService.decrement_stock(
                product, 
                location, 
                abs(quantity), 
                user=user, 
                reason_config=reason_config,
                detailed_reason=detailed_reason,
                legacy_reason=legacy_reason
            )

        # Update additional fields if provided
        if expiration_date is not None:
            stock.expiration_date = expiration_date
        if low_stock_threshold is not None:
            stock.low_stock_threshold = low_stock_threshold
        if expiration_threshold is not None:
            stock.expiration_threshold = expiration_threshold

        if any(
            [
                expiration_date is not None,
                low_stock_threshold is not None,
                expiration_threshold is not None,
            ]
        ):
            stock.save()

        return stock


class StockTransferSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    from_location_id = serializers.IntegerField()
    to_location_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    user_id = serializers.IntegerField(required=False)
    
    # New structured reason fields
    reason_id = serializers.IntegerField(
        required=True,
        help_text="ID of the stock action reason configuration"
    )
    detailed_reason = serializers.CharField(
        max_length=500, 
        required=False, 
        allow_blank=True,
        help_text="Optional detailed explanation for this stock transfer"
    )
    
    # Legacy reason field (for backward compatibility during migration)
    reason = serializers.CharField(
        max_length=255, 
        required=False, 
        allow_blank=True,
        help_text="Legacy reason field - will be deprecated"
    )
    
    def validate_reason_id(self, value):
        """Validate that the reason_id corresponds to an active reason config"""
        try:
            from settings.models import StockActionReasonConfig
            # Validate the reason exists and is active, but return the ID
            StockActionReasonConfig.objects.get(id=value, is_active=True)
            return value  # Return the ID, not the object
        except StockActionReasonConfig.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive reason configuration.")

    def validate(self, data):
        if data["from_location_id"] == data["to_location_id"]:
            raise serializers.ValidationError(
                "Source and destination locations cannot be the same."
            )
        if data["quantity"] <= 0:
            raise serializers.ValidationError(
                "Quantity must be positive for a transfer."
            )
        return data

    def save(self):
        product = Product.objects.get(id=self.validated_data["product_id"])
        from_location = Location.objects.get(id=self.validated_data["from_location_id"])
        to_location = Location.objects.get(id=self.validated_data["to_location_id"])
        quantity = self.validated_data["quantity"]
        user_id = self.validated_data.get("user_id")
        reason_id = self.validated_data.get("reason_id")
        detailed_reason = self.validated_data.get("detailed_reason", "")
        legacy_reason = self.validated_data.get("reason", "")  # For backward compatibility
        
        # Convert reason_id to reason_config object
        reason_config = None
        if reason_id:
            from settings.models import StockActionReasonConfig
            try:
                reason_config = StockActionReasonConfig.objects.get(id=reason_id, is_active=True)
            except StockActionReasonConfig.DoesNotExist:
                # This shouldn't happen due to validation, but just in case
                reason_config = None
        
        # Get user object if user_id provided
        user = None
        if user_id:
            from users.models import User
            user = User.objects.get(id=user_id)

        return InventoryService.transfer_stock(
            product, 
            from_location, 
            to_location, 
            quantity, 
            user=user, 
            reason_config=reason_config,
            detailed_reason=detailed_reason,
            legacy_reason=legacy_reason
        )


# --- Bulk Operations Serializers ---

class BulkStockAdjustmentItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    location_id = serializers.IntegerField()
    adjustment_type = serializers.ChoiceField(choices=[("Add", "Add"), ("Subtract", "Subtract")])
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    
    # New structured reason fields
    reason_id = serializers.IntegerField(
        required=True,
        help_text="ID of the stock action reason configuration"
    )
    detailed_reason = serializers.CharField(
        max_length=500, 
        required=False, 
        allow_blank=True,
        help_text="Optional detailed explanation for this stock adjustment"
    )
    
    # Legacy reason field (for backward compatibility during migration)
    reason = serializers.CharField(
        max_length=255, 
        required=False, 
        allow_blank=True,
        help_text="Legacy reason field - will be deprecated"
    )
    
    def validate_reason_id(self, value):
        """Validate that the reason_id corresponds to an active reason config"""
        try:
            from settings.models import StockActionReasonConfig
            # Validate the reason exists and is active, but return the ID
            StockActionReasonConfig.objects.get(id=value, is_active=True)
            return value  # Return the ID, not the object
        except StockActionReasonConfig.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive reason configuration.")

class BulkStockAdjustmentSerializer(serializers.Serializer):
    adjustments = BulkStockAdjustmentItemSerializer(many=True)
    user_id = serializers.IntegerField()

    def save(self):
        adjustments_data = self.validated_data["adjustments"]
        user_id = self.validated_data["user_id"]
        return InventoryService.perform_bulk_stock_adjustment(adjustments_data, user_id)


class BulkStockTransferItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    from_location_id = serializers.IntegerField()
    to_location_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    
    # Optional reason fields (will use system bulk transfer reason if not provided)
    reason_id = serializers.IntegerField(
        required=False,
        help_text="Optional ID of the stock action reason configuration"
    )
    detailed_reason = serializers.CharField(
        max_length=500, 
        required=False, 
        allow_blank=True,
        help_text="Optional detailed explanation for this stock transfer"
    )
    
    def validate_reason_id(self, value):
        """Validate that the reason_id corresponds to an active reason config"""
        if value is not None:
            try:
                from settings.models import StockActionReasonConfig
                reason_config = StockActionReasonConfig.objects.get(id=value, is_active=True)
                return reason_config
            except StockActionReasonConfig.DoesNotExist:
                raise serializers.ValidationError("Invalid or inactive reason configuration.")
        return None

class BulkStockTransferSerializer(serializers.Serializer):
    transfers = BulkStockTransferItemSerializer(many=True)
    user_id = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_transfers(self, transfers):
        for transfer in transfers:
            if transfer['from_location_id'] == transfer['to_location_id']:
                raise serializers.ValidationError(
                    "Source and destination locations cannot be the same for product ID {}.".format(transfer['product_id'])
                )
            if transfer['quantity'] <= 0:
                raise serializers.ValidationError(
                    "Quantity must be positive for a transfer for product ID {}.".format(transfer['product_id'])
                )
        return transfers

    def save(self):
        transfers_data = self.validated_data["transfers"]
        user_id = self.validated_data["user_id"]
        notes = self.validated_data.get("notes", "")
        return InventoryService.perform_bulk_stock_transfer(transfers_data, user_id, notes)


# --- Stock History Serializers ---

class StockHistoryUserSerializer(serializers.Serializer):
    """Lightweight user serializer for stock history"""
    id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    username = serializers.CharField()


class StockHistoryEntrySerializer(BaseModelSerializer):
    """
    Serializer for stock history entries with optimized queries.
    """
    product = OptimizedProductSerializer(read_only=True)
    location = OptimizedLocationSerializer(read_only=True)
    user = StockHistoryUserSerializer(read_only=True)
    operation_display = serializers.ReadOnlyField()
    reason_category = serializers.ReadOnlyField()
    reason_category_display = serializers.ReadOnlyField()
    truncated_reason = serializers.ReadOnlyField()
    
    # New structured reason fields
    reason_config = serializers.SerializerMethodField()
    get_reason_display = serializers.ReadOnlyField()
    get_full_reason = serializers.ReadOnlyField()
    
    class Meta:
        model = StockHistoryEntry
        fields = [
            'id',
            'product',
            'location', 
            'user',
            'operation_type',
            'operation_display',
            'quantity_change',
            'previous_quantity',
            'new_quantity',
            
            # New structured reason fields
            'reason_config',
            'detailed_reason',
            'get_reason_display',
            'get_full_reason',
            
            # Legacy reason fields (for backward compatibility)
            'reason',
            'notes',
            'reason_category',
            'reason_category_display',
            'truncated_reason',
            
            'reference_id',
            'timestamp',
        ]
        select_related_fields = ['product__category', 'product__product_type', 'location', 'user', 'reason_config']
        
    def get_reason_config(self, obj):
        """Return basic reason config information"""
        if obj.reason_config:
            return {
                'id': obj.reason_config.id,
                'name': obj.reason_config.name,
                'category': obj.reason_config.category,
                'category_display': obj.reason_config.get_category_display(),
                'is_system_reason': obj.reason_config.is_system_reason,
            }
        return None
