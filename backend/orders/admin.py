# desktop-combined/backend/orders/admin.py
from django.contrib import admin
from .models import (
    Order,
    OrderItem,
    OrderDiscount,
    OrderItemModifier
)

class OrderItemModifierInline(admin.TabularInline):
    model = OrderItemModifier
    extra = 0
    readonly_fields = ('modifier_set_name', 'option_name', 'price_at_sale', 'quantity')
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("price_at_sale", "get_line_item_total")
    fields = ("product", "quantity", "price_at_sale", "get_line_item_total")
    autocomplete_fields = ("product",)

    def get_line_item_total(self, obj):
        return f"${(obj.price_at_sale * obj.quantity):,.2f}"

    get_line_item_total.short_description = "Line Item Total"

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
        "customer_display_name",
        "cashier_name",
        "status",
        "payment_status",
        "order_type",
        "dining_preference",
        "get_total_collected_formatted",
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
        "dining_preference",
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
                    "customer_display_name",
                    "cashier",
                    "status",
                    "payment_status",
                    "order_type",
                    "dining_preference",
                )
            },
        ),
        (
            "Financial Summary",
            {
                "fields": (
                    "get_subtotal_formatted",
                    "get_total_discounts_formatted",
                    "get_tax_total_formatted",
                    "get_surcharges_total_formatted",
                    "get_tips_total_formatted",
                    "get_total_collected_formatted",
                ),
                "description": "Order totals and payment amounts collected.",
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
            "get_tips_total_formatted",
            "get_surcharges_total_formatted",
            "get_total_collected_formatted",
            "get_payment_in_progress_display",  # NEW: Always readonly as it's derived
        ]
        if obj:  # If the object already exists (i.e., we are editing)
            # Add other fields that should not be changed after creation
            readonly.extend(["customer_display_name", "cashier", "order_type"])
        return tuple(readonly)

    def get_queryset(self, request):
        """Optimize query performance by pre-fetching related objects."""
        return super().get_queryset(request).select_related(
            "customer", "cashier", "payment_details"
        )

    # --- ADD THIS METHOD ---
    @admin.display(description="Customer")
    def customer_display_name(self, obj):
        return obj.customer_display_name

    @admin.display(ordering="cashier__username", description="Cashier")
    def cashier_name(self, obj):
        if obj.cashier:
            # Manually construct the full name from the User model's fields
            full_name = f"{obj.cashier.first_name} {obj.cashier.last_name}".strip()
            # Fallback to username if the full name is blank
            return full_name or obj.cashier.username
        return None

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

    def get_grand_total_formatted(self, obj):
        return self._format_currency(obj.grand_total)

    get_grand_total_formatted.short_description = "Order Total (incl. Tips & Surcharges)"

    def get_amount_paid_formatted(self, obj):
        """Display amount paid from Payment model (excluding tips and surcharges)."""
        if hasattr(obj, 'payment_details') and obj.payment_details:
            return self._format_currency(obj.payment_details.amount_paid)
        return self._format_currency(0.00)

    get_amount_paid_formatted.short_description = "Amount Paid"

    def get_tips_total_formatted(self, obj):
        """Display total tips from Payment model."""
        if hasattr(obj, 'payment_details') and obj.payment_details:
            return self._format_currency(obj.payment_details.total_tips)
        return self._format_currency(0.00)

    get_tips_total_formatted.short_description = "Tips Collected"

    def get_surcharges_total_formatted(self, obj):
        """Display total surcharges from Payment model."""
        if hasattr(obj, 'payment_details') and obj.payment_details:
            return self._format_currency(obj.payment_details.total_surcharges)
        return self._format_currency(0.00)

    get_surcharges_total_formatted.short_description = "Surcharges Collected"

    def get_total_collected_formatted(self, obj):
        """Display total amount collected from Payment model (amount + tips + surcharges)."""
        if hasattr(obj, 'payment_details') and obj.payment_details:
            return self._format_currency(obj.payment_details.total_collected)
        return self._format_currency(0.00)

    get_total_collected_formatted.short_description = "Total Collected"

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

    list_display = ("id", "get_order_number", "get_order_created_at", "product", "quantity", "price_at_sale", "get_line_item_total", "status")
    list_filter = ("status", "order__status", "order__created_at", "order__order_type")
    search_fields = (
        "order__order_number",
        "product__name",
        "id",
    )
    autocomplete_fields = ("order", "product")
    readonly_fields = ("get_line_item_total",)
    inlines = [OrderItemModifierInline]
    ordering = ("-order__created_at", "-id")  # Most recent orders first, then most recent items
    list_per_page = 50
    date_hierarchy = "order__created_at"
    
    def get_order_number(self, obj):
        """Display the order number for easier identification."""
        return obj.order.order_number
    get_order_number.short_description = "Order Number"
    get_order_number.admin_order_field = "order__order_number"
    
    def get_order_created_at(self, obj):
        """Display when the order was created."""
        return obj.order.created_at.strftime("%Y-%m-%d %H:%M")
    get_order_created_at.short_description = "Order Date"
    get_order_created_at.admin_order_field = "order__created_at"
    
    def get_line_item_total(self, obj):
        """Display the line item total (quantity * price_at_sale)."""
        if obj.quantity is not None and obj.price_at_sale is not None:
            total = obj.quantity * obj.price_at_sale
            return f"${total:.2f}"
        return "$0.00"
    get_line_item_total.short_description = "Line Total"


@admin.register(OrderDiscount)
class OrderDiscountAdmin(admin.ModelAdmin):
    list_display = ("order", "discount", "amount", "created_at")
    search_fields = (
        "order__order_number",
        "discount__name",
    )  # Changed search field for order
    raw_id_fields = ("order", "discount")


@admin.register(OrderItemModifier)
class OrderItemModifierAdmin(admin.ModelAdmin):
    list_display = ("order_item", "modifier_set_name", "option_name", "price_at_sale", "quantity")
    search_fields = (
        "order_item__order__order_number",
        "modifier_set_name",
        "option_name",
    )
    readonly_fields = ("modifier_set_name", "option_name", "price_at_sale", "quantity")
    raw_id_fields = ("order_item",)
