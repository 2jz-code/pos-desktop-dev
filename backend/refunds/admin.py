from django.contrib import admin
from .models import RefundItem, RefundAuditLog, ExchangeSession
from core_backend.admin.mixins import TenantAdminMixin


@admin.register(RefundItem)
class RefundItemAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = [
        'id',
        'tenant',
        'order_item',
        'quantity_refunded',
        'total_refund_amount',
        'tax_refunded',
        'tip_refunded',
        'surcharge_refunded',
        'created_at',
    ]
    list_filter = ['created_at', 'tenant']
    search_fields = [
        'order_item__product__name',
        'order_item__order__order_number',
        'payment_transaction__transaction_id',
    ]
    readonly_fields = [
        'id',
        'tenant',
        'payment_transaction',
        'order_item',
        'quantity_refunded',
        'amount_per_unit',
        'total_refund_amount',
        'tax_refunded',
        'modifier_refund_amount',
        'tip_refunded',
        'surcharge_refunded',
        'created_at',
    ]

    def get_queryset(self, request):
        """Override to show all tenants' refund items for system admins."""
        return RefundItem.all_objects.all()

    def has_add_permission(self, request):
        # RefundItems should only be created via the refund service
        return False

    def has_delete_permission(self, request, obj=None):
        # Don't allow deleting refund items (audit trail)
        return False


@admin.register(RefundAuditLog)
class RefundAuditLogAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = [
        'id',
        'tenant',
        'action',
        'source',
        'refund_amount',
        'status',
        'initiated_by',
        'created_at',
    ]
    list_filter = ['action', 'source', 'status', 'created_at', 'tenant']
    search_fields = [
        'payment__order__order_number',
        'initiated_by__email',
        'reason',
    ]
    readonly_fields = [
        'id',
        'tenant',
        'payment',
        'payment_transaction',
        'action',
        'source',
        'refund_amount',
        'reason',
        'initiated_by',
        'device_info',
        'provider_response',
        'status',
        'error_message',
        'created_at',
    ]

    def get_queryset(self, request):
        """Override to show all tenants' audit logs for system admins."""
        return RefundAuditLog.all_objects.all()

    def has_add_permission(self, request):
        # Audit logs should only be created via the system
        return False

    def has_delete_permission(self, request, obj=None):
        # Never allow deleting audit logs
        return False


@admin.register(ExchangeSession)
class ExchangeSessionAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = [
        'id',
        'tenant',
        'original_order',
        'new_order',
        'refund_amount',
        'new_order_amount',
        'balance_due',
        'session_status',
        'processed_by',
        'created_at',
    ]
    list_filter = ['session_status', 'created_at', 'tenant']
    search_fields = [
        'original_order__order_number',
        'new_order__order_number',
        'processed_by__email',
    ]
    readonly_fields = [
        'id',
        'tenant',
        'original_order',
        'original_payment',
        'refund_transaction',
        'new_order',
        'new_payment',
        'refund_amount',
        'new_order_amount',
        'balance_due',
        'created_at',
        'completed_at',
    ]
    fieldsets = (
        ('Exchange Session', {
            'fields': ('id', 'tenant', 'session_status', 'exchange_reason')
        }),
        ('Original Order', {
            'fields': ('original_order', 'original_payment', 'refund_transaction', 'refund_amount')
        }),
        ('New Order', {
            'fields': ('new_order', 'new_payment', 'new_order_amount')
        }),
        ('Financial Summary', {
            'fields': ('balance_due',)
        }),
        ('Metadata', {
            'fields': ('processed_by', 'created_at', 'completed_at')
        }),
    )

    def get_queryset(self, request):
        """Override to show all tenants' exchange sessions for system admins."""
        return ExchangeSession.all_objects.all()
