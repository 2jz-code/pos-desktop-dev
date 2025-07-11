from django.contrib import admin
from mptt.admin import DraggableMPTTAdmin
from .models import Category, Tax, Product, ProductType


@admin.register(ProductType)
class ProductTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "description")
    search_fields = ("name",)


@admin.register(Category)
class CategoryAdmin(DraggableMPTTAdmin):
    list_display = (
        "tree_actions",
        "indented_title",
        "order",
    )
    list_display_links = ("indented_title",)
    search_fields = ("name",)
    list_filter = ("parent",)
    # Using raw_id_fields for parent makes it easier to select a parent from a long list of categories.
    raw_id_fields = ("parent",)


@admin.register(Tax)
class TaxAdmin(admin.ModelAdmin):
    list_display = ("name", "rate")
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "product_type", "price", "category", "is_active", "is_public")
    list_filter = ("is_active", "is_public", "category", "product_type")
    search_fields = ("name", "description")
    list_editable = ("price", "is_active", "is_public")
    autocomplete_fields = ("category", "taxes")
    actions = ["make_public", "make_private"]

    def make_public(self, request, queryset):
        queryset.update(is_public=True)
    make_public.short_description = "Mark selected products as public"

    def make_private(self, request, queryset):
        queryset.update(is_public=False)
    make_private.short_description = "Mark selected products as private"


# We don't register the base Product model itself because we only want to interact
# with the specific subtypes (MenuItem, GroceryItem) in the admin.
