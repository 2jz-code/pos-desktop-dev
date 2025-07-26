from django.contrib import admin
from mptt.admin import DraggableMPTTAdmin
from .models import (
    Category, Tax, Product, ProductType, 
    ModifierSet, ModifierOption, ProductModifierSet, ProductSpecificOption
)

class ModifierOptionInline(admin.TabularInline):
    model = ModifierOption
    extra = 1

@admin.register(ModifierSet)
class ModifierSetAdmin(admin.ModelAdmin):
    list_display = ('name', 'internal_name', 'selection_type', 'min_selections', 'max_selections')
    search_fields = ('name', 'internal_name')
    list_filter = ('selection_type',)
    autocomplete_fields = ('triggered_by_option',)
    inlines = [ModifierOptionInline]

class ProductModifierSetInline(admin.TabularInline):
    model = ProductModifierSet
    extra = 1
    autocomplete_fields = ['modifier_set']

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
    inlines = [ProductModifierSetInline]

    def make_public(self, request, queryset):
        queryset.update(is_public=True)
    make_public.short_description = "Mark selected products as public"

    def make_private(self, request, queryset):
        queryset.update(is_public=False)
    make_private.short_description = "Mark selected products as private"


@admin.register(ModifierOption)
class ModifierOptionAdmin(admin.ModelAdmin):
    list_display = ('name', 'modifier_set', 'price_delta', 'display_order')
    search_fields = ('name', 'modifier_set__name')
    list_filter = ('modifier_set',)
    autocomplete_fields = ('modifier_set',)


@admin.register(ProductSpecificOption)
class ProductSpecificOptionAdmin(admin.ModelAdmin):
    list_display = ('product_modifier_set', 'modifier_option')
    search_fields = ('product_modifier_set__product__name', 'modifier_option__name')
    raw_id_fields = ('product_modifier_set', 'modifier_option')
