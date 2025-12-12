"""
Django admin configuration for measurements models.
"""
from django.contrib import admin
from measurements.models import Unit


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    """
    Admin for Unit model.
    Units are GLOBAL (not tenant-scoped) and READ-ONLY - seeded on deployment.
    """
    list_display = ['code', 'name', 'category']
    list_filter = ['category']
    search_fields = ['code', 'name']
    ordering = ['category', 'code']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
