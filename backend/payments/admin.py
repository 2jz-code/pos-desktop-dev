from django.contrib import admin
from .models import Payment, PaymentTransaction, GiftCard


class PaymentTransactionInline(admin.TabularInline):
    """
    Makes PaymentTransaction records editable inline within the Payment admin page.
    """

    model = PaymentTransaction
    extra = 0  # Don't show extra blank forms
    readonly_fields = (
        "id",
        "amount",
        "tip",
        "surcharge",
        "method",
        "status",
        "created_at",
        "transaction_id",
    )
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """
    Admin view for the Payment model.
    """

    list_display = (
        "id",
        "order",
        "total_amount_due",
        "amount_paid",
        "total_tips",
        "total_surcharges",
        "total_collected",
        "status",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("id", "order__id")
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "total_tips",
        "total_surcharges",
        "total_collected",
    )
    inlines = [PaymentTransactionInline]
    fieldsets = (
        (None, {"fields": ("id", "order", "status")}),
        (
            "Financials",
            {
                "fields": (
                    "total_amount_due",
                    "amount_paid",
                    "total_tips",
                    "total_surcharges",
                    "total_collected",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    """
    Admin view for the PaymentTransaction model.
    """

    list_display = ("id", "payment", "amount", "method", "status", "created_at")
    list_filter = ("status", "method")
    search_fields = ("id", "payment__id", "transaction_id")
    readonly_fields = ("id", "created_at")


@admin.register(GiftCard)
class GiftCardAdmin(admin.ModelAdmin):
    """
    Admin view for the GiftCard model.
    """

    list_display = (
        "code",
        "current_balance",
        "original_balance",
        "status",
        "issued_date",
        "last_used_date",
    )
    list_filter = ("status", "issued_date")
    search_fields = ("code", "notes")
    readonly_fields = (
        "id",
        "issued_date",
        "created_at",
        "updated_at",
        "last_used_date",
    )
    
    fieldsets = (
        (None, {"fields": ("code", "status")}),
        (
            "Balance Information",
            {
                "fields": (
                    "original_balance",
                    "current_balance",
                )
            },
        ),
        (
            "Dates",
            {
                "fields": (
                    "issued_date",
                    "expiry_date",
                    "last_used_date",
                )
            },
        ),
        ("Additional Info", {"fields": ("notes",)}),
        ("System", {"fields": ("id", "created_at", "updated_at")}),
    )

    def get_readonly_fields(self, request, obj=None):
        """Make certain fields readonly after creation"""
        readonly = self.readonly_fields
        if obj:  # Editing existing object
            readonly = readonly + ("original_balance",)  # Can't change original balance after creation
        return readonly
