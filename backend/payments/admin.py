from django.contrib import admin
from .models import Payment, PaymentTransaction


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
