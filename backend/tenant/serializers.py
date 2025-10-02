from rest_framework import serializers


class TenantSerializerMixin:
    """
    Mixin for serializers to ensure tenant consistency.

    - Automatically sets tenant on create
    - Validates that all related objects belong to same tenant

    Usage:
        class ProductSerializer(TenantSerializerMixin, serializers.ModelSerializer):
            class Meta:
                model = Product
                fields = ['id', 'name', 'price', 'category']

            # Mixin automatically:
            # - Sets tenant on create
            # - Validates category.tenant == request.tenant
    """

    def create(self, validated_data):
        """Automatically set tenant from request context."""
        tenant = self.context['request'].tenant
        validated_data['tenant'] = tenant
        return super().create(validated_data)

    def validate(self, data):
        """
        Validate that all foreign key relations match tenant.

        Prevents creating objects with references to other tenants' data.
        Example: Prevents Order with Product from different tenant.
        """
        tenant = self.context['request'].tenant

        # Check all ForeignKey fields
        for field_name, field in self.fields.items():
            if isinstance(field, serializers.PrimaryKeyRelatedField):
                value = data.get(field_name)
                if value and hasattr(value, 'tenant'):
                    if value.tenant != tenant:
                        raise serializers.ValidationError({
                            field_name: f"Must belong to tenant {tenant.slug}"
                        })

        return super().validate(data)
