"""
Django admin configuration for COGS models.
"""
from django.contrib import admin
from core_backend.admin.mixins import TenantAdminMixin, ArchivingAdminMixin
from cogs.models import Unit, UnitConversion, IngredientConfig, ItemCostSource


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    """
    Admin for Unit model.
    Units are GLOBAL (not tenant-scoped), so no TenantAdminMixin needed.
    """
    list_display = ['code', 'name', 'category']
    list_filter = ['category']
    search_fields = ['code', 'name']
    ordering = ['category', 'code']


@admin.register(UnitConversion)
class UnitConversionAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    """
    Admin for UnitConversion model.
    Uses TenantAdminMixin to show all tenants and ArchivingAdminMixin for soft-delete.
    """
    list_display = ['from_unit', 'to_unit', 'multiplier', 'product']
    search_fields = ['from_unit__code', 'to_unit__code', 'product__name']
    autocomplete_fields = ['from_unit', 'to_unit', 'product']
    ordering = ['from_unit__code', 'to_unit__code']

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries."""
        return UnitConversion.all_objects.select_related(
            'tenant', 'from_unit', 'to_unit', 'product'
        )


@admin.register(IngredientConfig)
class IngredientConfigAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    """
    Admin for IngredientConfig model.
    Uses TenantAdminMixin to show all tenants and ArchivingAdminMixin for soft-delete.
    """
    list_display = ['product', 'base_unit']
    search_fields = ['product__name']
    autocomplete_fields = ['product', 'base_unit']
    ordering = ['product__name']

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries."""
        return IngredientConfig.all_objects.select_related(
            'tenant', 'product', 'base_unit'
        )


@admin.register(ItemCostSource)
class ItemCostSourceAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    """
    Admin for ItemCostSource model.
    Uses TenantAdminMixin to show all tenants and ArchivingAdminMixin for soft-delete.
    """
    list_display = [
        'product', 'store_location', 'unit_cost', 'unit',
        'source_type', 'effective_at', 'created_by'
    ]
    list_filter = ['source_type', 'store_location']
    search_fields = ['product__name', 'store_location__name']
    autocomplete_fields = ['product', 'store_location', 'unit', 'created_by']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['-effective_at', '-created_at']
    date_hierarchy = 'effective_at'

    fieldsets = (
        (None, {
            'fields': ('tenant', 'store_location', 'product')
        }),
        ('Cost Information', {
            'fields': ('unit_cost', 'unit', 'source_type', 'effective_at')
        }),
        ('Notes', {
            'fields': ('notes',),
            'classes': ('collapse',)
        }),
        ('Audit', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries."""
        return ItemCostSource.all_objects.select_related(
            'tenant', 'product', 'store_location', 'unit', 'created_by'
        )
