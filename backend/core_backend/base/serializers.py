from rest_framework import serializers
from products.models import Product, Category


class BaseModelSerializer(serializers.ModelSerializer):
    """
    Base serializer that provides common functionality.

    Features:
    - Automatic optimization field detection
    - Common validation patterns
    - Consistent error handling
    """

    class Meta:
        # Default optimization fields (can be overridden)
        select_related_fields = []
        prefetch_related_fields = []

    def validate(self, data):
        """
        Base validation that can be extended by child classes.
        """
        data = super().validate(data)

        # Add any project-wide validation logic here

        return data


class TenantFilteredSerializerMixin:
    """
    Automatically filters all FK/M2M querysets by tenant context.
    Eliminates the need for repetitive __init__() boilerplate in every serializer.

    Usage:
        class ProductTypeSerializer(TenantFilteredSerializerMixin, BaseModelSerializer):
            default_taxes_ids = serializers.PrimaryKeyRelatedField(
                source="default_taxes",
                many=True,
                queryset=Tax.objects.all(),  # Mixin auto-filters by tenant!
                required=False
            )

    Features:
    - Automatically filters all FK fields by tenant
    - Handles many=True fields (via child_relation.queryset)
    - Only filters models that have a 'tenant' attribute
    - Works with any serializer that has request in context
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and hasattr(request, 'tenant') and request.tenant:
            self._filter_all_querysets_by_tenant(request.tenant)

    def _filter_all_querysets_by_tenant(self, tenant):
        """Iterate through all fields and filter querysets by tenant"""
        for field_name, field in self.fields.items():
            # Handle many=True fields (wrapped in ManyRelatedField)
            if hasattr(field, 'child_relation') and hasattr(field.child_relation, 'queryset'):
                model = field.child_relation.queryset.model
                if hasattr(model, 'tenant'):  # Only filter tenant-aware models
                    field.child_relation.queryset = model.objects.filter(tenant=tenant)

            # Handle single FK fields (PrimaryKeyRelatedField, SlugRelatedField, etc.)
            elif hasattr(field, 'queryset') and field.queryset is not None:
                model = field.queryset.model
                if hasattr(model, 'tenant'):  # Only filter tenant-aware models
                    field.queryset = model.objects.filter(tenant=tenant)


# Common lightweight serializers used across multiple apps
class BasicProductSerializer(serializers.ModelSerializer):
    """Lightweight product serializer for dropdowns and references"""
    
    class Meta:
        model = Product
        fields = ["id", "name", "barcode", "price"]


class BasicCategorySerializer(serializers.ModelSerializer):
    """Lightweight category serializer for dropdowns and references"""
    
    class Meta:
        model = Category
        fields = ["id", "name", "order"]


class TimestampedSerializer(serializers.ModelSerializer):
    """
    Base serializer for models with created_at/updated_at fields.
    Provides consistent timestamp handling.
    """
    
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    
    class Meta:
        abstract = True
