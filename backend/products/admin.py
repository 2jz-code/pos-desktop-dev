from django.contrib import admin
from mptt.admin import DraggableMPTTAdmin
from core_backend.admin.mixins import ArchivingAdminMixin
from .admin_mixins import CategoryDependencyAdminMixin, ProductTypeDependencyAdminMixin
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
class ProductTypeAdmin(ProductTypeDependencyAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    list_display = (
        "name",
        "inventory_behavior",
        "stock_enforcement",
        "pricing_method",
        "tax_inclusive",
        "is_active",
    )
    list_filter = (
        "is_active",
        "inventory_behavior",
        "stock_enforcement",
        "pricing_method",
        "tax_inclusive",
    )
    search_fields = ("name", "description")
    filter_horizontal = ("default_taxes",)

    fieldsets = (
        (
            "Basics",
            {
                "fields": (
                    "name",
                    "description",
                )
            },
        ),
        (
            "Inventory Policy",
            {
                "fields": (
                    "inventory_behavior",
                    "stock_enforcement",
                    "allow_negative_stock",
                )
            },
        ),
        (
            "Tax & Pricing",
            {
                "fields": (
                    "tax_inclusive",
                    "default_taxes",
                    "pricing_method",
                    "default_markup_percent",
                )
            },
        ),
        (
            "Prep Metadata",
            {
                "fields": (
                    "standard_prep_minutes",
                )
            },
        ),
    )
    
    def get_queryset(self, request):
        """
        Override to ensure archived product types are included in admin.
        This fixes the issue where archived records don't appear when filtering by is_active=False.
        """
        # Explicitly include archived records using the ProductType manager
        return ProductType.objects.with_archived()


@admin.register(Category)
class CategoryAdmin(CategoryDependencyAdminMixin, ArchivingAdminMixin, DraggableMPTTAdmin):
    list_display = (
        "tree_actions",
        "indented_title",
        "order",
        "is_active",
    )
    list_display_links = ("indented_title",)
    search_fields = ("name",)
    list_filter = ("is_active", "parent")
    raw_id_fields = ("parent",)
    
    def get_queryset(self, request):
        """
        Override to ensure archived categories are included in admin.
        This fixes MRO issues between ArchivingAdminMixin and DraggableMPTTAdmin.
        """
        # Get the MPTT queryset first to preserve tree functionality
        queryset = super(DraggableMPTTAdmin, self).get_queryset(request)
        
        # Explicitly include archived records using the Category manager
        queryset = Category.objects.with_archived().select_related('parent')
        
        return queryset


@admin.register(Tax)
class TaxAdmin(admin.ModelAdmin):
    list_display = ("name", "rate")
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(ArchivingAdminMixin, admin.ModelAdmin):
    list_display = ("name", "product_type", "price", "category", "is_active", "is_public")
    list_filter = ("is_active", "is_public", "category", "product_type")
    search_fields = ("name", "description")
    list_editable = ("price", "is_public")  # Removed is_active from editable fields
    autocomplete_fields = ("category", "taxes")
    inlines = [ProductModifierSetInline]
    
    def get_queryset(self, request):
        """Optimize admin queryset"""
        return super().get_queryset(request).select_related(
            'category',
            'product_type'
        ).prefetch_related(
            'modifier_sets__options'
        )

    def get_actions(self, request):
        """Combine archiving actions with custom product actions."""
        actions = super().get_actions(request)
        # Add our custom actions
        actions['make_public'] = (ProductAdmin.make_public, 'make_public', ProductAdmin.make_public.short_description)
        actions['make_private'] = (ProductAdmin.make_private, 'make_private', ProductAdmin.make_private.short_description)
        return actions

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
