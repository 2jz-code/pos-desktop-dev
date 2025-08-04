from rest_framework import serializers
from .models import Location, InventoryStock, Recipe, RecipeItem
from products.models import Product
from products.serializers import ProductSerializer
from .services import InventoryService


class LocationSerializer(serializers.ModelSerializer):
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
            "effective_expiration_threshold"
        ]


# Optimized serializers for stock management to avoid N+1 queries
class OptimizedProductSerializer(serializers.ModelSerializer):
    """Lightweight product serializer for inventory management"""
    category_name = serializers.CharField(source='category.name', read_only=True)
    product_type_name = serializers.CharField(source='product_type.name', read_only=True)
    
    class Meta:
        model = Product
        fields = [
            "id", "name", "description", "price", "barcode", 
            "is_active", "is_public", "track_inventory",
            "category_name", "product_type_name"
        ]

class OptimizedLocationSerializer(serializers.ModelSerializer):
    """Lightweight location serializer for inventory management"""
    effective_low_stock_threshold = serializers.ReadOnlyField()
    effective_expiration_threshold = serializers.ReadOnlyField()
    
    class Meta:
        model = Location
        fields = [
            "id", "name", "description",
            "effective_low_stock_threshold",
            "effective_expiration_threshold"
        ]

class OptimizedInventoryStockSerializer(serializers.ModelSerializer):
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
            "is_expiring_soon"
        ]

class InventoryStockSerializer(serializers.ModelSerializer):
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
            "is_expiring_soon"
        ]


class RecipeItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source="product", write_only=True
    )

    class Meta:
        model = RecipeItem
        fields = ["id", "product_id", "product", "quantity", "unit"]


class RecipeSerializer(serializers.ModelSerializer):
    menu_item = ProductSerializer(read_only=True)
    menu_item_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(product_type__name="menu"),
        source="menu_item",
        write_only=True,
    )
    ingredients = RecipeItemSerializer(many=True)

    class Meta:
        model = Recipe
        fields = ["id", "name", "menu_item_id", "menu_item", "ingredients"]

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        
        # Manually serialize the prefetched ingredients
        if hasattr(instance, 'ingredients'):
            representation['ingredients'] = RecipeItemSerializer(instance.ingredients.all(), many=True).data
        
        return representation

    def create(self, validated_data):
        ingredients_data = validated_data.pop("ingredients")
        recipe = Recipe.objects.create(**validated_data)
        for ingredient_data in ingredients_data:
            RecipeItem.objects.create(recipe=recipe, **ingredient_data)
        return recipe


# --- Service-driven Serializers ---


class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    location_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    expiration_date = serializers.DateField(required=False, allow_null=True)
    low_stock_threshold = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    expiration_threshold = serializers.IntegerField(required=False)

    def save(self):
        product = Product.objects.get(id=self.validated_data["product_id"])
        location = Location.objects.get(id=self.validated_data["location_id"])
        quantity = self.validated_data["quantity"]
        expiration_date = self.validated_data.get("expiration_date")
        low_stock_threshold = self.validated_data.get("low_stock_threshold")
        expiration_threshold = self.validated_data.get("expiration_threshold")

        # A positive quantity adds stock, a negative quantity decrements stock
        if quantity > 0:
            stock = InventoryService.add_stock(product, location, quantity)
        else:
            stock = InventoryService.decrement_stock(product, location, abs(quantity))
        
        # Update additional fields if provided
        if expiration_date is not None:
            stock.expiration_date = expiration_date
        if low_stock_threshold is not None:
            stock.low_stock_threshold = low_stock_threshold
        if expiration_threshold is not None:
            stock.expiration_threshold = expiration_threshold
        
        if any([expiration_date is not None, low_stock_threshold is not None, expiration_threshold is not None]):
            stock.save()
        
        return stock


class StockTransferSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    from_location_id = serializers.IntegerField()
    to_location_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)

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

        return InventoryService.transfer_stock(
            product, from_location, to_location, quantity
        )
