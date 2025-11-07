from rest_framework import serializers
from products.models import Product, Category
import warnings


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


class FieldsetMixin:
    """
    Mixin that enables dynamic field control via context:
    - Fieldsets (view modes: list, detail, custom)
    - Dynamic field filtering (?fields=id,name)
    - Expandable relationships (?expand=category,taxes)

    Usage:
        class ProductSerializer(FieldsetMixin, TenantFilteredSerializerMixin, BaseModelSerializer):
            class Meta:
                model = Product
                fields = '__all__'

                # Define view modes
                fieldsets = {
                    'list': ['id', 'name', 'price', 'category_id'],
                    'detail': ['id', 'name', 'price', 'description', 'category_id', 'track_inventory'],
                    'pos': ['id', 'name', 'price', 'barcode', 'category_id'],
                }

                # Define expandable relationships
                expandable = {
                    'category': (CategorySerializer, {'source': 'category', 'many': False}),
                    'taxes': (TaxSerializer, {'source': 'taxes', 'many': True}),
                }

                # Fields that must always be included (even if forgotten in fieldsets or ?fields=)
                required_fields = {'id'}  # Default

    Note: Inherits from object (implicit) to avoid diamond inheritance.
    MRO: YourSerializer → FieldsetMixin → TenantFilteredSerializerMixin → BaseModelSerializer → ModelSerializer
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._apply_fieldset_filtering()
        self._apply_dynamic_field_filtering()
        self._apply_relationship_expansion()

    def _apply_fieldset_filtering(self):
        """
        Apply fieldset based on view_mode from context.

        IMPORTANT: Always preserve required fields even if not in fieldset.
        Prevents forgetting 'id' in fieldsets['list'] definition.
        """
        view_mode = self.context.get('view_mode')
        fieldsets = getattr(self.Meta, 'fieldsets', {})

        if view_mode and view_mode in fieldsets:
            fieldset_value = fieldsets[view_mode]

            # If fieldset is '__all__', skip filtering (return all fields)
            if fieldset_value == '__all__':
                return

            # Get required fields that must always be included
            required_fields = getattr(self.Meta, 'required_fields', {'id'})

            # Combine fieldset + required
            allowed = set(fieldset_value) | required_fields
            existing = set(self.fields.keys())

            for field_name in existing - allowed:
                self.fields.pop(field_name)

    def _apply_dynamic_field_filtering(self):
        """
        Apply ?fields=id,name filtering.

        IMPORTANT: Always preserve required fields (id, etc.) even if not requested.
        Prevents orphaned payloads where ?fields=name strips id.
        """
        requested = self.context.get('requested_fields')
        if requested:
            # Get required fields that must always be included
            required_fields = getattr(self.Meta, 'required_fields', {'id'})

            # Combine requested + required
            allowed = set(requested) | required_fields
            existing = set(self.fields.keys())

            for field_name in existing - allowed:
                self.fields.pop(field_name)

    def _apply_relationship_expansion(self):
        """
        Apply ?expand=category,taxes logic.

        By default, relationships are IDs only.
        When expanded, replace ID field with nested serializer.
        """
        expand = self.context.get('expand', set())
        expandable = getattr(self.Meta, 'expandable', {})

        for field_name in expand:
            if field_name in expandable:
                serializer_class, options = expandable[field_name]
                source = options.get('source', field_name)

                # Remove the _id field if it exists
                id_field_name = f"{field_name}_id"
                if id_field_name in self.fields:
                    self.fields.pop(id_field_name)

                # Add nested serializer
                many = options.get('many', False)
                self.fields[field_name] = serializer_class(
                    source=source,
                    many=many,
                    read_only=True,
                    context=self.context
                )


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
    - Fails loud if tenant context is missing for write operations (create/update)

    Note: Primarily useful for write serializers. Read-only serializers should rely on
    TenantScopedQuerysetMixin in the viewset instead.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')

        # Tighter error handling: fail loud if request is missing for write operations
        if not request:
            # This is acceptable for read-only serializers or nested serializers
            # But for write operations, we need request context
            if hasattr(self, 'instance') and self.instance is None:
                # This is a write operation (create), warn if no request
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"{self.__class__.__name__}: No request in context for write operation. "
                    f"Tenant validation will be skipped."
                )
            return

        # Fail loud if tenant-aware model but no tenant
        if hasattr(request, 'tenant'):
            if request.tenant:
                self._filter_all_querysets_by_tenant(request.tenant)
            else:
                # No tenant on request - check if user is admin
                if not (hasattr(request, 'user') and (request.user.is_superuser or request.user.is_staff)):
                    # Not admin and no tenant - this is a problem
                    raise serializers.ValidationError(
                        "Tenant context is required for this operation. "
                        "This likely indicates a middleware configuration issue."
                    )

    def _filter_all_querysets_by_tenant(self, tenant):
        """Iterate through all fields and filter querysets by tenant"""
        for field_name, field in self.fields.items():
            # Handle many=True fields (wrapped in ManyRelatedField)
            if hasattr(field, 'child_relation') and hasattr(field.child_relation, 'queryset'):
                # Check if queryset is not None before accessing .model
                if field.child_relation.queryset is not None:
                    model = field.child_relation.queryset.model
                    if hasattr(model, 'tenant'):  # Only filter tenant-aware models
                        field.child_relation.queryset = model.objects.filter(tenant=tenant)

            # Handle single FK fields (PrimaryKeyRelatedField, SlugRelatedField, etc.)
            elif hasattr(field, 'queryset') and field.queryset is not None:
                model = field.queryset.model
                if hasattr(model, 'tenant'):  # Only filter tenant-aware models
                    field.queryset = model.objects.filter(tenant=tenant)


class TimestampedSerializer(serializers.ModelSerializer):
    """
    Base serializer for models with created_at/updated_at fields.
    Provides consistent timestamp handling.
    """
    
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    
    class Meta:
        abstract = True
