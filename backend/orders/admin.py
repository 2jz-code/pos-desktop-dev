# desktop-combined/backend/orders/admin.py
from django.contrib import admin
from .models import (
    Order,
    OrderItem,
    OrderDiscount,
)  # Make sure OrderDiscount is imported if used


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

    # --- MODIFICATIONS START HERE ---

    # Display order_number instead of id in the list view
    list_display = (
        "order_number",  # Changed from "id"
        "customer",
        "cashier",
        "status",
        "payment_status",
        "order_type",
        "get_grand_total_formatted",
        "get_payment_in_progress_display",  # NEW: Use derived property
        "created_at",
    )

    # Make order_number the clickable link
    list_display_links = ("order_number",)

    # Add order_number to search fields and remove id
    search_fields = (
        "order_number",  # Changed from "id"
        "customer__username",
        "cashier__username",
    )

    # --- MODIFICATIONS END HERE ---

    # Removed deprecated payment_in_progress from filters
    list_filter = (
        "status",
        "payment_status",
        "order_type",
        "created_at",
        "cashier",
    )

    inlines = [OrderItemInline]

    fieldsets = (
        (
            "Order Overview",
            {
                # id remains here to be visible on the detail page
                "fields": (
                    "id",
                    "order_number",  # Add order_number here for detail view
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
        (
            "Payment Status",
            {
                "fields": ("get_payment_in_progress_display",),
                "description": "Payment status is now automatically derived from the Payment object status.",
            },
        ),
    )

    def get_readonly_fields(self, request, obj=None):
        """Make fields readonly after an order is created."""
        # Start with fields that should always be readonly
        readonly = [
            "id",
            "order_number",  # Make order_number read-only as it's auto-generated
            "created_at",
            "updated_at",
            "get_subtotal_formatted",
            "get_total_discounts_formatted",
            "get_tax_total_formatted",
            "get_surcharges_total_formatted",
            "get_grand_total_formatted",
            "get_payment_in_progress_display",  # NEW: Always readonly as it's derived
        ]
        if obj:  # If the object already exists (i.e., we are editing)
            # Add other fields that should not be changed after creation
            readonly.extend(["customer", "cashier", "order_type"])
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

    def get_payment_in_progress_display(self, obj):
        """Display payment status derived from Payment model instead of deprecated field."""
        return obj.payment_in_progress_derived

    get_payment_in_progress_display.short_description = "Payment In Progress"
    get_payment_in_progress_display.boolean = True


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    """
    Admin configuration for the OrderItem model.
    """

    list_display = ("id", "order", "product", "quantity", "price_at_sale")
    search_fields = (
        "order__order_number",
        "product__name",
    )  # Changed search field for order
    autocomplete_fields = ("order", "product")
    readonly_fields = ("price_at_sale",)


@admin.register(OrderDiscount)
class OrderDiscountAdmin(admin.ModelAdmin):
    list_display = ("order", "discount", "amount", "created_at")
    search_fields = (
        "order__order_number",
        "discount__name",
    )  # Changed search field for order
    raw_id_fields = ("order", "discount")
