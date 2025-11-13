from django.contrib import admin
from .models import Payment, PaymentTransaction, GiftCard
from core_backend.admin.mixins import TenantAdminMixin


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

    def get_queryset(self, request):
        """Use all_objects to bypass TenantManager, Django will filter by parent FK"""
        return PaymentTransaction.all_objects.all()

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(TenantAdminMixin, admin.ModelAdmin):
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

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries"""
        return Payment.all_objects.select_related(
            'tenant',
            'order',
            'order__customer'
        ).prefetch_related('transactions')


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin view for the PaymentTransaction model.
    """

    list_display = ("id", "payment", "amount", "method", "status", "created_at")
    list_filter = ("status", "method")
    search_fields = ("id", "payment__id", "transaction_id")
    readonly_fields = ("id", "created_at")

    def get_queryset(self, request):
        """Show all tenants in Django admin with optimized queries"""
        return PaymentTransaction.all_objects.select_related(
            'tenant', 'payment', 'payment__order'
        )


@admin.register(GiftCard)
class GiftCardAdmin(TenantAdminMixin, admin.ModelAdmin):
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

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return GiftCard.all_objects.select_related('tenant')
    
    fieldsets = (
        (None, {"fields": ("code", "status", "tenant")}),
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
        # Start with base readonly fields
        readonly = [
            "id",
            "issued_date",
            "created_at",
            "updated_at",
            "last_used_date",
        ]

        if obj:  # Editing existing object
            # Add fields that can't be changed after creation
            readonly.extend(["original_balance", "tenant"])

        return tuple(readonly)
