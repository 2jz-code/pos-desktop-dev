"""
Unit and UnitConversion views.
"""
from django.db import models
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from measurements.models import Unit
from cogs.models import UnitConversion
from cogs.serializers import (
    UnitSerializer,
    UnitConversionSerializer,
    UnitConversionCreateSerializer,
)
from cogs.permissions import CanManageCOGS, CanViewCOGS


class UnitViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing Units (read-only).

    Units are GLOBAL reference data - they're seeded on deployment and
    shared across all tenants. No create/update/delete operations are
    allowed via the API.

    list: Get all available units.
    retrieve: Get a specific unit.
    """
    permission_classes = [IsAuthenticated, CanViewCOGS]
    serializer_class = UnitSerializer

    def get_queryset(self):
        return Unit.objects.all().order_by('category', 'code')


class UnitConversionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing UnitConversions.

    list: Get all conversions for the tenant.
    retrieve: Get a specific conversion.
    create: Create a new conversion (manager+).
    update: Update a conversion (manager+).
    destroy: Soft delete a conversion (manager+).
    """
    permission_classes = [IsAuthenticated, CanViewCOGS]
    serializer_class = UnitConversionSerializer

    def get_queryset(self):
        queryset = UnitConversion.objects.select_related(
            'from_unit', 'to_unit', 'product'
        ).order_by('from_unit__code', 'to_unit__code')

        # Filter by product if specified
        product_id = self.request.query_params.get('product')
        if product_id:
            # Include both product-specific and generic conversions
            queryset = queryset.filter(
                models.Q(product_id=product_id) | models.Q(product__isnull=True)
            )

        return queryset

    def get_serializer_class(self):
        if self.action in ['create']:
            return UnitConversionCreateSerializer
        return UnitConversionSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), CanManageCOGS()]
        return [IsAuthenticated(), CanViewCOGS()]

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)
