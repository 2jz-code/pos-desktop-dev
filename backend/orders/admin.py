from django.contrib import admin
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    """
    Allows for the editing of OrderItems from within the Order admin page.
    """

    model = OrderItem
    extra = 0
    # Add a calculated total for each line item and make fields readonly
    readonly_fields = ("price_at_sale", "get_line_item_total")
    fields = ("product", "quantity", "price_at_sale", "get_line_item_total")
    autocomplete_fields = ("product",)

    def get_line_item_total(self, obj):
        """Calculates and formats the total for the order item."""
        return f"${(obj.price_at_sale * obj.quantity):,.2f}"

    get_line_item_total.short_description = "Line Item Total"

    # Prevent adding new items from a saved order to maintain integrity
    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """
    Admin configuration for the Order model.
    """

    # Expanded list_display for a more informative overview
    list_display = (
        "id",
        "customer",
        "cashier",
        "status",
        "payment_status",
        "order_type",
        "get_grand_total_formatted",
        "payment_in_progress",
        "created_at",
    )
    # Added payment_in_progress to filters
    list_filter = (
        "status",
        "payment_status",
        "order_type",
        "created_at",
        "cashier",
        "payment_in_progress",
    )
    # Added cashier to search fields
    search_fields = ("id", "customer__username", "cashier__username")

    inlines = [OrderItemInline]

    fieldsets = (
        (
            "Order Overview",
            {
                # Added cashier and payment_status
                "fields": (
                    "id",
                    "customer",
                    "cashier",
                    "status",
                    "payment_status",
                    "order_type",
                )
            },
        ),
        (
            "Financial Summary",
            {
                # A clear breakdown of the total calculation
                "fields": (
                    "get_subtotal_formatted",
                    "get_total_discounts_formatted",
                    "get_tax_total_formatted",
                    "get_surcharges_total_formatted",
                    "get_grand_total_formatted",
                ),
            },
        ),
        (
            "Timestamps",
            {
                "classes": ("collapse",),
                "fields": ("created_at", "updated_at"),
            },
        ),
        # --- NEW FIELDSET FOR MANUAL OVERRIDE ---
        (
            "!! Manual Override !!",
            {
                "fields": ("payment_in_progress",),
                "description": '<b style="color:red;">Warning:</b> Manually changing this field should only be done to resolve a payment that is permanently stuck. Incorrectly setting this could cause payment issues.',
            },
        ),
        # --- END OF NEW FIELDSET ---
    )

    def get_readonly_fields(self, request, obj=None):
        """Make fields readonly after an order is created."""
        # Start with fields that should always be readonly
        readonly = [
            "id",
            "created_at",
            "updated_at",
            "get_subtotal_formatted",
            "get_total_discounts_formatted",
            "get_tax_total_formatted",
            "get_surcharges_total_formatted",
            "get_grand_total_formatted",
        ]
        if obj:  # If the object already exists (i.e., we are editing)
            # Add other fields that should not be changed after creation
            readonly.extend(["customer", "cashier", "order_type"])
        # The 'payment_in_progress' field is NOT added to this list, so it remains editable.
        return tuple(readonly)

    def get_queryset(self, request):
        """Optimize query performance by pre-fetching related objects."""
        return super().get_queryset(request).select_related("customer", "cashier")

    # --- Formatting Methods ---
    def _format_currency(self, value):
        """Helper to format a decimal value into a currency string."""
        return f"${value:,.2f}" if value is not None else "$0.00"

    def get_subtotal_formatted(self, obj):
        return self._format_currency(obj.subtotal)

    get_subtotal_formatted.short_description = "Subtotal"

    def get_total_discounts_formatted(self, obj):
        return f"-{self._format_currency(obj.total_discounts_amount)}"

    get_total_discounts_formatted.short_description = "Total Discounts"

    def get_tax_total_formatted(self, obj):
        return self._format_currency(obj.tax_total)

    get_tax_total_formatted.short_description = "Tax"

    def get_surcharges_total_formatted(self, obj):
        return self._format_currency(obj.surcharges_total)

    get_surcharges_total_formatted.short_description = "Surcharges"

    def get_grand_total_formatted(self, obj):
        return self._format_currency(obj.grand_total)

    get_grand_total_formatted.short_description = "Grand Total"


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    """
    Admin configuration for the OrderItem model.
    """

    list_display = ("id", "order", "product", "quantity", "price_at_sale")
    search_fields = ("order__id", "product__name")
    autocomplete_fields = ("order", "product")
    readonly_fields = ("price_at_sale",)
