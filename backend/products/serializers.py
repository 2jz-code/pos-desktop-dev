from rest_framework import serializers
from .models import Category, Tax, Product, ProductType
from .services import ProductService
from rest_framework.fields import ImageField
from django.conf import settings


# --- NEW: Basic serializers for nested data ---
class BasicCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "order"]


class BasicProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "barcode"]


# --- END NEW ---


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "description"]


class CategorySerializer(serializers.ModelSerializer):
    parent = BasicCategorySerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent",
        queryset=Category.objects.all(),
        allow_null=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "description",
            "parent",
            "parent_id",
            "order",
            "is_public",
        ]


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ["id", "name", "rate"]


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    subcategory = CategorySerializer(source="category.parent", read_only=True)
    taxes = TaxSerializer(many=True, read_only=True)
    product_type = ProductTypeSerializer(read_only=True)
    image = ImageField(read_only=True)  # Add image field
    image_url = (
        serializers.SerializerMethodField()
    )  # Add image_url field for frontend compatibility
    original_filename = serializers.CharField(
        read_only=True
    )  # Add original_filename field

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
            "is_public",
            "track_inventory",
            "product_type",
            "barcode",
            "created_at",
            "updated_at",
            "image",  # Add image to fields
            "image_url",  # Add image_url to fields
            "original_filename",  # Add original_filename to fields
        ]

    def get_image_url(self, obj):
        """Return the full URL for the product image"""
        if obj.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.image.url)
            else:
                # For S3 URLs, obj.image.url is already absolute
                # For local storage, we need to build absolute URL
                image_url = obj.image.url
                if image_url.startswith("http"):
                    # Already absolute (S3)
                    return image_url
                else:
                    # Local storage - build absolute URL
                    base_url = getattr(settings, "BASE_URL", "http://127.0.0.1:8001")
                    return f"{base_url}{image_url}"
        return None


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
            "is_public",
            "track_inventory",
            "barcode",
            "created_at",
            "updated_at",
        ]


class ProductCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(write_only=True, required=False)
    tax_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    product_type_id = serializers.IntegerField(write_only=True)

    # Inventory fields
    initial_stock = serializers.DecimalField(
        max_digits=10, decimal_places=2, write_only=True, required=False, default=0
    )
    location_id = serializers.IntegerField(write_only=True, required=False)
    image = ImageField(write_only=True, required=False)  # Add image field for upload

    class Meta:
        model = Product
        fields = [
            "name",
            "description",
            "price",
            "is_active",
            "is_public",
            "track_inventory",
            "product_type_id",
            "category_id",
            "tax_ids",
            "barcode",
            "initial_stock",
            "location_id",
            "image",  # Add image to fields
        ]

    def create(self, validated_data):
        return ProductService.create_product(**validated_data)
