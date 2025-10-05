from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from .models import Location, InventoryStock, Recipe, RecipeItem, StockHistoryEntry
from core_backend.admin.mixins import ArchivingAdminMixin, TenantAdminMixin


@admin.register(Location)
class LocationAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
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

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return Location.all_objects.select_related('tenant')


@admin.register(InventoryStock)
class InventoryStockAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    list_display = ("product", "location", "quantity")
    list_filter = ("location", "product")
    search_fields = ("product__name", "location__name")
    # Make product and location searchable with a dropdown instead of just an ID
    autocomplete_fields = ("product", "location")

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries"""
        return InventoryStock.all_objects.select_related(
            "tenant", "product", "location"
        )


class RecipeItemInline(admin.TabularInline):
    """
    Inline admin for RecipeItem. This allows adding ingredients directly
    within the Recipe admin page.
    """

    model = RecipeItem
    autocomplete_fields = ("product",)
    extra = 1  # Show one extra blank ingredient line by default


@admin.register(Recipe)
class RecipeAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    list_display = ("name", "menu_item")
    search_fields = ("name", "menu_item__name")
    autocomplete_fields = ("menu_item",)
    inlines = [RecipeItemInline]

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries"""
        return Recipe.all_objects.select_related(
            "tenant", "menu_item"
        )


@admin.register(StockHistoryEntry)
class StockHistoryEntryAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "timestamp",
        "product_link",
        "location",
        "operation_display",
        "quantity_change_formatted",
        "new_quantity",
        "user",
        "reason_category_badge",
        "reference_id_link"
    )
    list_filter = (
        "operation_type", 
        "location", 
        "timestamp",
        "user"
    )
    search_fields = (
        "product__name", 
        "product__barcode", 
        "location__name", 
        "reason", 
        "notes", 
        "reference_id"
    )
    date_hierarchy = "timestamp"
    ordering = ("-timestamp",)
    readonly_fields = (
        "timestamp", 
        "product", 
        "location", 
        "user", 
        "operation_type", 
        "quantity_change", 
        "previous_quantity", 
        "new_quantity",
        "reason_category",
        "reason_category_display_info",
        "related_operations_link"
    )
    
    fieldsets = (
        ("Operation Details", {
            "fields": (
                "timestamp",
                "operation_type", 
                "reason_category",
                "reason_category_display_info",
            )
        }),
        ("Product & Location", {
            "fields": ("product", "location")
        }),
        ("Quantity Changes", {
            "fields": (
                "previous_quantity", 
                "quantity_change", 
                "new_quantity"
            )
        }),
        ("Reason & Notes", {
            "fields": ("reason", "notes")
        }),
        ("Metadata", {
            "fields": (
                "user", 
                "reference_id", 
                "related_operations_link",
                "ip_address", 
                "user_agent"
            ),
            "classes": ("collapse",)
        }),
    )

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries"""
        return StockHistoryEntry.all_objects.select_related(
            "tenant", "product", "location", "user"
        )

    def product_link(self, obj):
        """Display product name as a link to the product admin page."""
        if obj.product:
            url = reverse("admin:products_product_change", args=[obj.product.pk])
            return format_html('<a href="{}">{}</a>', url, obj.product.name)
        return "-"
    product_link.short_description = "Product"

    def quantity_change_formatted(self, obj):
        """Display quantity change with color coding."""
        if obj.quantity_change >= 0:
            return format_html(
                '<span style="color: green; font-weight: bold;">+{}</span>', 
                obj.quantity_change
            )
        else:
            return format_html(
                '<span style="color: red; font-weight: bold;">{}</span>', 
                obj.quantity_change
            )
    quantity_change_formatted.short_description = "Change"

    def reason_category_badge(self, obj):
        """Display reason category as a colored badge."""
        category_info = obj.reason_category_display
        color_map = {
            'gray': '#6B7280',
            'blue': '#3B82F6', 
            'purple': '#8B5CF6',
            'orange': '#F97316',
            'green': '#10B981',
            'red': '#EF4444',
            'emerald': '#059669',
            'indigo': '#6366F1',
            'slate': '#64748B'
        }
        color = color_map.get(category_info['color'], '#64748B')
        
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">{}</span>',
            color,
            category_info['label']
        )
    reason_category_badge.short_description = "Category"

    def reference_id_link(self, obj):
        """Display reference ID as a link to filter by the same reference_id."""
        if obj.reference_id:
            url = reverse("admin:inventory_stockhistoryentry_changelist")
            return format_html(
                '<a href="{}?reference_id={}" title="View all operations with this reference ID">{}</a>',
                url,
                obj.reference_id,
                obj.reference_id
            )
        return "-"
    reference_id_link.short_description = "Reference ID"

    def reason_category_display_info(self, obj):
        """Display detailed reason category information."""
        category_info = obj.reason_category_display
        return format_html(
            '<strong>{}</strong><br/><em>{}</em>',
            category_info['label'],
            category_info['description']
        )
    reason_category_display_info.short_description = "Category Info"

    def related_operations_link(self, obj):
        """Display link to view all related operations by reference_id."""
        if obj.reference_id:
            # Count related operations
            related_count = StockHistoryEntry.objects.filter(
                reference_id=obj.reference_id
            ).count()
            
            if related_count > 1:
                url = reverse("admin:inventory_stockhistoryentry_changelist")
                return format_html(
                    '<a href="{}?reference_id={}" class="button">{} related operations</a>',
                    url,
                    obj.reference_id,
                    related_count
                )
            else:
                return "No related operations"
        return "No reference ID"
    related_operations_link.short_description = "Related Operations"

    def has_add_permission(self, request):
        """Disable adding stock history entries manually."""
        return False

    def has_change_permission(self, request, obj=None):
        """Disable editing stock history entries."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Disable deleting stock history entries."""
        return False
