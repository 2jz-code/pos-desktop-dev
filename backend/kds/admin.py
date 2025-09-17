from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import KDSOrder, KDSOrderItem, KDSSession


class KDSOrderItemInline(admin.TabularInline):
    """Inline for KDS order items"""
    model = KDSOrderItem
    extra = 0
    readonly_fields = ['order_item', 'prep_time_minutes', 'total_time_minutes', 'is_overdue']
    fields = [
        'order_item', 'assigned_zone', 'status', 'is_priority',
        'notes', 'started_at', 'completed_at', 'prep_time_minutes'
    ]


@admin.register(KDSOrder)
class KDSOrderAdmin(admin.ModelAdmin):
    list_display = [
        'order_number_display',
        'customer_name_display',
        'status',
        'is_priority',
        'assigned_kitchen_zones_display',
        'created_at',
        'total_time_minutes',
        'status_indicator'
    ]
    list_filter = [
        'status',
        'is_priority',
        'created_at',
        'assigned_kitchen_zones'
    ]
    search_fields = [
        'order__order_number',
        'order__customer_display_name'
    ]
    readonly_fields = [
        'id', 'order', 'created_at', 'prep_time_minutes',
        'total_time_minutes', 'is_overdue'
    ]
    inlines = [KDSOrderItemInline]

    fieldsets = [
        ('Order Information', {
            'fields': ['id', 'order', 'assigned_kitchen_zones']
        }),
        ('Status & Priority', {
            'fields': ['status', 'is_priority']
        }),
        ('Timing', {
            'fields': [
                'created_at', 'started_at', 'ready_at', 'completed_at',
                'prep_time_minutes', 'total_time_minutes', 'is_overdue'
            ]
        }),
        ('Legacy Support', {
            'fields': ['legacy_id'],
            'classes': ['collapse']
        }),
    ]

    def order_number_display(self, obj):
        return obj.order.order_number
    order_number_display.short_description = 'Order #'

    def customer_name_display(self, obj):
        return obj.order.customer_display_name or 'Guest'
    customer_name_display.short_description = 'Customer'

    def assigned_kitchen_zones_display(self, obj):
        if obj.assigned_kitchen_zones:
            return ', '.join(obj.assigned_kitchen_zones)
        return 'None'
    assigned_kitchen_zones_display.short_description = 'Kitchen Zones'

    def status_indicator(self, obj):
        status_colors = {
            'pending': '#ffa500',      # orange
            'in_progress': '#0066cc',  # blue
            'ready': '#00cc66',        # green
            'completed': '#666666',    # gray
        }
        color = status_colors.get(obj.status, '#000000')

        indicator = f'<span style="color: {color}; font-weight: bold;">●</span>'

        if obj.is_overdue and obj.status != 'completed':
            indicator += ' <span style="color: red; font-size: 12px;">⚠ OVERDUE</span>'

        if obj.is_priority:
            indicator += ' <span style="color: red; font-size: 12px;">🔥 PRIORITY</span>'

        return format_html(indicator)
    status_indicator.short_description = 'Status'


@admin.register(KDSOrderItem)
class KDSOrderItemAdmin(admin.ModelAdmin):
    list_display = [
        'order_number_display',
        'product_name_display',
        'assigned_zone',
        'status',
        'is_priority',
        'prep_time_display',
        'status_indicator'
    ]
    list_filter = [
        'status',
        'assigned_zone',
        'is_priority',
        'kds_order__created_at'
    ]
    search_fields = [
        'kds_order__order__order_number',
        'order_item__product__name',
        'notes'
    ]
    readonly_fields = [
        'id', 'kds_order', 'order_item', 'prep_time_minutes',
        'total_time_minutes', 'is_overdue'
    ]

    fieldsets = [
        ('Item Information', {
            'fields': ['id', 'kds_order', 'order_item', 'assigned_zone']
        }),
        ('Status & Priority', {
            'fields': ['status', 'is_priority', 'notes']
        }),
        ('Timing', {
            'fields': [
                'started_at', 'completed_at', 'prep_time_minutes',
                'total_time_minutes', 'is_overdue'
            ]
        }),
        ('Legacy Support', {
            'fields': ['legacy_id'],
            'classes': ['collapse']
        }),
    ]

    def order_number_display(self, obj):
        return obj.kds_order.order.order_number
    order_number_display.short_description = 'Order #'

    def product_name_display(self, obj):
        if obj.order_item.product:
            return obj.order_item.product.name
        return obj.order_item.custom_name or 'Custom Item'
    product_name_display.short_description = 'Product'

    def prep_time_display(self, obj):
        prep_time = obj.prep_time_minutes
        if prep_time is not None and prep_time > 0:
            return f"{prep_time} min"
        return "-"
    prep_time_display.short_description = 'Prep Time'

    def status_indicator(self, obj):
        status_colors = {
            'pending': '#ffa500',      # orange
            'in_progress': '#0066cc',  # blue
            'ready': '#00cc66',        # green
            'completed': '#666666',    # gray
        }
        color = status_colors.get(obj.status, '#000000')

        indicator = f'<span style="color: {color}; font-weight: bold;">●</span>'

        if obj.is_overdue and obj.status != 'completed':
            indicator += ' <span style="color: red; font-size: 12px;">⚠ OVERDUE</span>'

        if obj.is_priority:
            indicator += ' <span style="color: red; font-size: 12px;">🔥 PRIORITY</span>'

        return format_html(indicator)
    status_indicator.short_description = 'Status'


@admin.register(KDSSession)
class KDSSessionAdmin(admin.ModelAdmin):
    list_display = [
        'zone_id',
        'terminal_id',
        'is_active',
        'created_at',
        'last_activity',
        'activity_status'
    ]
    list_filter = ['is_active', 'zone_id', 'created_at']
    search_fields = ['zone_id', 'terminal_id']
    readonly_fields = ['id', 'created_at', 'last_activity']

    fieldsets = [
        ('Session Information', {
            'fields': ['id', 'zone_id', 'terminal_id', 'is_active']
        }),
        ('Activity Tracking', {
            'fields': ['created_at', 'last_activity']
        }),
    ]

    def activity_status(self, obj):
        if not obj.is_active:
            return format_html('<span style="color: red;">Inactive</span>')

        time_diff = timezone.now() - obj.last_activity
        if time_diff.total_seconds() > 300:  # 5 minutes
            return format_html('<span style="color: orange;">Idle</span>')

        return format_html('<span style="color: green;">Active</span>')
    activity_status.short_description = 'Activity Status'

    actions = ['cleanup_old_sessions']

    def cleanup_old_sessions(self, request, queryset):
        """Action to cleanup old inactive sessions"""
        deleted_count = KDSSession.cleanup_old_sessions(hours=24)
        self.message_user(
            request,
            f'Successfully cleaned up {deleted_count[0]} old session(s).'
        )
    cleanup_old_sessions.short_description = 'Clean up old sessions (24h+)'