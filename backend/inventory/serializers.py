from rest_framework import serializers
from .models import Location, InventoryStock, Recipe, RecipeItem, StockHistoryEntry
from products.models import Product
from products.serializers import ProductSerializer
from .services import InventoryService
from core_backend.base import BaseModelSerializer
from core_backend.base.serializers import (
    TenantFilteredSerializerMixin,
    FieldsetMixin,
)


# ============================================================================
# SPECIALIZED SERIALIZERS (Lightweight helpers used across multiple serializers)
# ============================================================================

class StockHistoryUserSerializer(serializers.Serializer):
    """Lightweight user serializer for stock history"""
    id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    username = serializers.CharField()


class StockHistoryStoreLocationSerializer(serializers.Serializer):
    """Lightweight store location serializer for stock history"""
    id = serializers.IntegerField()
    name = serializers.CharField()


# ============================================================================
# UNIFIED READ SERIALIZERS (Fieldset-based)
# ============================================================================

class UnifiedLocationSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for Location model with fieldset support.

    Fieldsets:
    - simple: Minimal location info (id, name)
    - list: Simple + additional details (description, thresholds)
    - detail: All fields (default)

    Usage:
        # List view
        UnifiedLocationSerializer(location, context={'view_mode': 'list'})

        # Detail view
        UnifiedLocationSerializer(location, context={'view_mode': 'detail'})
    """

    effective_low_stock_threshold = serializers.ReadOnlyField()
    effective_expiration_threshold = serializers.ReadOnlyField()

    class Meta:
        model = Location
        fields = '__all__'
        read_only_fields = ['tenant', 'store_location']  # Set via perform_create
        prefetch_related_fields = ["stock_levels__product"]

        fieldsets = {
            'simple': [
                'id',
                'name',
            ],
            'list': [
                'id',
                'name',
                'description',
                'effective_low_stock_threshold',
                'effective_expiration_threshold',
            ],
            'detail': '__all__',
        }

        required_fields = {'id'}


class UnifiedInventoryStockSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for InventoryStock model with fieldset support.

    Fieldsets:
    - simple: Minimal stock info (id, product, location, quantity, is_low_stock)
    - list: Simple + additional details (optimized with lightweight nested serializers)
    - detail: All fields with full nested relationships

    Expandable:
    - product: Can expand to full ProductSerializer
    - location: Can expand to full UnifiedLocationSerializer

    Usage:
        # List view (optimized with lightweight nested serializers)
        UnifiedInventoryStockSerializer(stock, context={'view_mode': 'list'})

        # Detail view
        UnifiedInventoryStockSerializer(stock, context={'view_mode': 'detail'})
    """

    # Default nested serializers (lightweight for list view)
    product = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()

    # Write-only fields for creating/updating stock
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source="product", write_only=True, required=False
    )
    location_id = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), source="location", write_only=True, required=False
    )

    # Computed fields
    is_low_stock = serializers.ReadOnlyField()
    is_expiring_soon = serializers.ReadOnlyField()
    effective_low_stock_threshold = serializers.ReadOnlyField()
    effective_expiration_threshold = serializers.ReadOnlyField()

    class Meta:
        model = InventoryStock
        fields = '__all__'
        read_only_fields = ['tenant', 'store_location']  # Set via perform_create
        select_related_fields = ["product__category", "product__product_type", "location", "store_location"]

        fieldsets = {
            'simple': [
                'id',
                'product',
                'location',
                'quantity',
                'is_low_stock',
            ],
            'list': [
                'id',
                'product',
                'location',
                'store_location',
                'quantity',
                'is_low_stock',
                'is_expiring_soon',
                'effective_low_stock_threshold',
            ],
            'detail': '__all__',
        }

        required_fields = {'id'}

    def get_product(self, obj):
        """Return product with appropriate view mode"""
        view_mode = self.context.get('view_mode', 'list')
        # Use ProductSerializer with 'reference' for list, 'detail' for detail
        product_view_mode = 'detail' if view_mode == 'detail' else 'reference'
        return ProductSerializer(obj.product, context={'view_mode': product_view_mode}).data

    def get_location(self, obj):
        """Return location with appropriate view mode"""
        view_mode = self.context.get('view_mode', 'list')
        # Use UnifiedLocationSerializer with matching view mode
        return UnifiedLocationSerializer(obj.location, context={'view_mode': view_mode}).data

    def create(self, validated_data):
        """
        Create inventory stock with tenant context.

        Note: tenant and store_location can be passed via perform_create in the viewset,
        or they will be automatically retrieved from the current context.
        """
        # Tenant and store_location may be passed from viewset's perform_create
        # If not provided, get them from context
        if 'tenant' not in validated_data:
            from tenant.managers import get_current_tenant
            validated_data['tenant'] = get_current_tenant()

        if 'store_location' not in validated_data:
            request = self.context.get('request')
            if request and hasattr(request, 'store_location_id'):
                from settings.models import StoreLocation
                validated_data['store_location'] = StoreLocation.objects.filter(
                    id=request.store_location_id
                ).first()

        # Create the stock record
        return InventoryStock.objects.create(**validated_data)


class UnifiedRecipeItemSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for RecipeItem model with fieldset support.

    Fieldsets:
    - simple: Minimal recipe item info (id, product, quantity, unit)
    - list: Same as simple (recipe items are typically nested)
    - detail: All fields

    Usage:
        # List view
        UnifiedRecipeItemSerializer(item, context={'view_mode': 'list'})

        # Detail view
        UnifiedRecipeItemSerializer(item, context={'view_mode': 'detail'})
    """

    product = serializers.SerializerMethodField()
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source="product", write_only=True
    )

    def get_product(self, obj):
        """Return product with 'reference' view mode"""
        return ProductSerializer(obj.product, context={'view_mode': 'reference'}).data

    class Meta:
        model = RecipeItem
        fields = '__all__'
        read_only_fields = ['tenant', 'recipe']  # Set via create method
        select_related_fields = ["product__category", "product__product_type"]

        fieldsets = {
            'simple': [
                'id',
                'product',
                'quantity',
                'unit',
            ],
            'list': [
                'id',
                'product',
                'quantity',
                'unit',
            ],
            'detail': '__all__',
        }

        required_fields = {'id'}


class UnifiedRecipeSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for Recipe model with fieldset support.

    Fieldsets:
    - simple: Minimal recipe info (id, name, menu_item)
    - list: Same as simple
    - detail: All fields including nested ingredients

    Usage:
        # List view
        UnifiedRecipeSerializer(recipe, context={'view_mode': 'list'})

        # Detail view
        UnifiedRecipeSerializer(recipe, context={'view_mode': 'detail'})
    """

    menu_item = serializers.SerializerMethodField()
    menu_item_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(product_type__name="menu"),
        source="menu_item",
        write_only=True,
    )
    ingredients = UnifiedRecipeItemSerializer(many=True)

    def get_menu_item(self, obj):
        """Return menu item product with 'reference' view mode"""
        return ProductSerializer(obj.menu_item, context={'view_mode': 'reference'}).data

    class Meta:
        model = Recipe
        fields = '__all__'
        read_only_fields = ['tenant']  # Set via create method
        select_related_fields = ["menu_item__category", "menu_item__product_type"]
        prefetch_related_fields = ["ingredients__product__category", "ingredients__product__product_type"]

        fieldsets = {
            'simple': [
                'id',
                'name',
                'menu_item',
            ],
            'list': [
                'id',
                'name',
                'menu_item',
            ],
            'detail': '__all__',
        }

        required_fields = {'id'}

    def to_representation(self, instance):
        """Manually serialize prefetched ingredients to avoid N+1 queries"""
        representation = super().to_representation(instance)

        # Manually serialize the prefetched ingredients
        if hasattr(instance, "ingredients"):
            representation["ingredients"] = UnifiedRecipeItemSerializer(
                instance.ingredients.all(), many=True, context=self.context
            ).data

        return representation

    def create(self, validated_data):
        """Create recipe with tenant context"""
        from tenant.managers import get_current_tenant

        ingredients_data = validated_data.pop("ingredients")
        tenant = get_current_tenant()

        # Create recipe with tenant
        recipe = Recipe.objects.create(tenant=tenant, **validated_data)

        # Create recipe items with tenant
        for ingredient_data in ingredients_data:
            RecipeItem.objects.create(recipe=recipe, tenant=tenant, **ingredient_data)

        return recipe


class UnifiedStockHistoryEntrySerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
    """
    Unified serializer for StockHistoryEntry model with fieldset support.

    Fieldsets:
    - simple: Minimal history info (id, product, operation_type, quantity_change, timestamp)
    - list: Simple + additional details (location, new_quantity, reason)
    - detail: All fields including nested relationships

    Usage:
        # List view
        UnifiedStockHistoryEntrySerializer(entry, context={'view_mode': 'list'})

        # Detail view
        UnifiedStockHistoryEntrySerializer(entry, context={'view_mode': 'detail'})
    """

    # Nested serializers
    product = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    store_location = StockHistoryStoreLocationSerializer(read_only=True)
    user = StockHistoryUserSerializer(read_only=True)

    def get_product(self, obj):
        """Return product with 'reference' view mode"""
        return ProductSerializer(obj.product, context={'view_mode': 'reference'}).data

    def get_location(self, obj):
        """Return location with 'simple' view mode"""
        return UnifiedLocationSerializer(obj.location, context={'view_mode': 'simple'}).data

    # Computed fields from model properties
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
        fields = '__all__'
        select_related_fields = ['product__category', 'product__product_type', 'location', 'store_location', 'user', 'reason_config']

        fieldsets = {
            'simple': [
                'id',
                'product',
                'operation_type',
                'quantity_change',
                'timestamp',
            ],
            'list': [
                'id',
                'product',
                'location',
                'operation_type',
                'operation_display',
                'quantity_change',
                'new_quantity',
                'reason_config',
                'reason_category',
                'reason_category_display',
                'get_reason_display',
                'timestamp',
            ],
            'detail': '__all__',
        }

        required_fields = {'id'}

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








# --- Service-driven Serializers ---


class StockAdjustmentSerializer(TenantFilteredSerializerMixin, serializers.Serializer):
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


class StockTransferSerializer(TenantFilteredSerializerMixin, serializers.Serializer):
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

class BulkStockAdjustmentItemSerializer(TenantFilteredSerializerMixin, serializers.Serializer):
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

class BulkStockAdjustmentSerializer(TenantFilteredSerializerMixin, serializers.Serializer):
    adjustments = BulkStockAdjustmentItemSerializer(many=True)
    user_id = serializers.IntegerField()

    def save(self):
        adjustments_data = self.validated_data["adjustments"]
        user_id = self.validated_data["user_id"]
        return InventoryService.perform_bulk_stock_adjustment(adjustments_data, user_id)


class BulkStockTransferItemSerializer(TenantFilteredSerializerMixin, serializers.Serializer):
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

class BulkStockTransferSerializer(TenantFilteredSerializerMixin, serializers.Serializer):
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

