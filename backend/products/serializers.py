from rest_framework import serializers
from .models import Category, Tax, Product, ProductType
from .services import ProductService


# --- NEW: Basic serializers for nested data ---
class BasicCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]


class BasicProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name"]


# --- END NEW ---


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "description"]


class CategorySerializer(serializers.ModelSerializer):
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=Category.objects.all(), allow_null=True
    )

    class Meta:
        model = Category
        fields = ["id", "name", "description", "parent_id"]


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ["id", "name", "rate"]


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    subcategory = CategorySerializer(source="category.parent", read_only=True)
    taxes = TaxSerializer(many=True, read_only=True)
    product_type = ProductTypeSerializer(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "category",
            "subcategory",
            "taxes",
            "is_active",
            "product_type",
            "created_at",
            "updated_at",
        ]


# Sync-specific serializers that send IDs instead of nested objects
class ProductSyncSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(
        source="category.id", read_only=True, allow_null=True
    )
    product_type_id = serializers.IntegerField(source="product_type.id", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "category_id",
            "product_type_id",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ProductCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(write_only=True, required=False)
    tax_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    product_type_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = Product
        fields = [
            "name",
            "description",
            "price",
            "is_active",
            "product_type_id",
            "category_id",
            "tax_ids",
        ]

    def create(self, validated_data):
        return ProductService.create_product(**validated_data)
