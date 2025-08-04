from django.contrib import admin
from .models import Location, InventoryStock, Recipe, RecipeItem
from core_backend.admin.mixins import ArchivingAdminMixin


@admin.register(Location)
class LocationAdmin(ArchivingAdminMixin, admin.ModelAdmin):
    list_display = ("name", "description", "low_stock_threshold", "expiration_threshold")
    search_fields = ("name",)
    fieldsets = (
        (None, {
            'fields': ('name', 'description')
        }),
        ('Threshold Settings', {
            'fields': ('low_stock_threshold', 'expiration_threshold'),
            'description': 'Location-specific threshold settings. Leave blank to use global defaults.'
        }),
    )


@admin.register(InventoryStock)
class InventoryStockAdmin(ArchivingAdminMixin, admin.ModelAdmin):
    list_display = ("product", "location", "quantity")
    list_filter = ("location", "product")
    search_fields = ("product__name", "location__name")
    # Make product and location searchable with a dropdown instead of just an ID
    autocomplete_fields = ("product", "location")


class RecipeItemInline(admin.TabularInline):
    """
    Inline admin for RecipeItem. This allows adding ingredients directly
    within the Recipe admin page.
    """

    model = RecipeItem
    autocomplete_fields = ("product",)
    extra = 1  # Show one extra blank ingredient line by default


@admin.register(Recipe)
class RecipeAdmin(ArchivingAdminMixin, admin.ModelAdmin):
    list_display = ("name", "menu_item")
    search_fields = ("name", "menu_item__name")
    autocomplete_fields = ("menu_item",)
    inlines = [RecipeItemInline]
