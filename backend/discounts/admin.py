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
        "start_date",
        "end_date",
    )
    list_filter = ("type", "scope", "is_active")
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
    )

    filter_horizontal = ("applicable_products", "applicable_categories")

    class Media:
        js = ("admin/js/discount_admin.js",)

    def get_queryset(self, request):
        # Prefetch related fields to optimize performance in the admin list view
        return (
            super()
            .get_queryset(request)
            .prefetch_related("applicable_products", "applicable_categories")
        )


# This will add a simple view for the through model in the admin, mostly for debugging.
# from orders.models import OrderDiscount
# @admin.register(OrderDiscount)
# class OrderDiscountAdmin(admin.ModelAdmin):
#     list_display = ('order', 'discount', 'amount', 'created_at')
#     readonly_fields = ('order', 'discount', 'amount', 'created_at')
