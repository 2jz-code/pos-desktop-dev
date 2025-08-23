from django.contrib import admin
from .models import Discount


@admin.register(Discount)
class DiscountAdmin(admin.ModelAdmin):
    """
    Admin interface for managing discounts.
    """

    list_display = (
        "name",
        "type",
        "scope",
        "value",
        "is_active",
        "archived_at",
        "start_date",
        "end_date",
    )
    list_filter = ("type", "scope", "is_active", "archived_at")
    search_fields = ("name",)
    ordering = ("name",)

    fieldsets = (
        (None, {"fields": ("name", "is_active")}),
        ("Rule", {"fields": ("type", "scope", "value")}),
        (
            "Applicability",
            {
                "classes": ("applicability-fieldset",),  # Custom class for JS targeting
                "fields": ("applicable_products", "applicable_categories"),
            },
        ),
        ("Timeframe", {"fields": ("start_date", "end_date")}),
        ("Archiving", {
            "fields": ("archived_at", "archived_by"),
            "classes": ("collapse",),
        }),
    )

    filter_horizontal = ("applicable_products", "applicable_categories")
    readonly_fields = ("archived_at", "archived_by")
    
    actions = ['archive_selected', 'unarchive_selected']
    
    def archive_selected(self, request, queryset):
        """Archive selected discounts"""
        count = queryset.filter(is_active=True).count()
        for discount in queryset.filter(is_active=True):
            discount.archive(archived_by=request.user)
        self.message_user(request, f"{count} discount(s) have been archived.")
    archive_selected.short_description = "Archive selected discounts"
    
    def unarchive_selected(self, request, queryset):
        """Unarchive selected discounts"""
        count = queryset.filter(is_active=False).count()
        for discount in queryset.filter(is_active=False):
            discount.unarchive()
        self.message_user(request, f"{count} discount(s) have been unarchived.")
    unarchive_selected.short_description = "Unarchive selected discounts"

    class Media:
        js = ("admin/js/discount_admin.js",)

    def get_queryset(self, request):
        # Prefetch related fields to optimize performance in the admin list view
        # Include archived records by default in admin
        queryset = self.model.objects.with_archived() if hasattr(self.model.objects, 'with_archived') else self.model.objects.all()
        return queryset.prefetch_related("applicable_products", "applicable_categories").select_related("archived_by")


# This will add a simple view for the through model in the admin, mostly for debugging.
# from orders.models import OrderDiscount
# @admin.register(OrderDiscount)
# class OrderDiscountAdmin(admin.ModelAdmin):
#     list_display = ('order', 'discount', 'amount', 'created_at')
#     readonly_fields = ('order', 'discount', 'amount', 'created_at')
