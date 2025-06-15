from rest_framework import serializers
from .models import Location, InventoryStock, Recipe, RecipeItem
from products.models import Product
from products.serializers import ProductSerializer
from .services import InventoryService


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "description"]


class InventoryStockSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    location = LocationSerializer(read_only=True)

    class Meta:
        model = InventoryStock
        fields = ["id", "product", "location", "quantity"]


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

    def save(self):
        product = Product.objects.get(id=self.validated_data["product_id"])
        location = Location.objects.get(id=self.validated_data["location_id"])
        quantity = self.validated_data["quantity"]

        # A positive quantity adds stock, a negative quantity decrements stock
        if quantity > 0:
            return InventoryService.add_stock(product, location, quantity)
        else:
            return InventoryService.decrement_stock(product, location, abs(quantity))


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
