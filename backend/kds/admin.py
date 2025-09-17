from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import KDSSession, KDSOrderItem, KitchenMetrics, KDSAlert, QCOrderView


@admin.register(KDSSession)
class KDSSessionAdmin(admin.ModelAdmin):
    list_display = [
        'zone_printer_id',
        'terminal_id',
        'is_active',
        'started_at',
        'last_activity',
        'activity_status'
    ]
    list_filter = ['is_active', 'zone_printer_id', 'started_at']
    search_fields = ['zone_printer_id', 'terminal_id']
    readonly_fields = ['id', 'started_at', 'last_activity']

    fieldsets = [
        ('Basic Information', {
            'fields': ['id', 'zone_printer_id', 'terminal_id']
        }),
        ('Session Status', {
            'fields': ['is_active', 'started_at', 'last_activity']
        }),
        ('Display Preferences', {
            'fields': [
                'max_orders_per_column',
                'show_customer_names',
                'show_order_type'
            ]
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


@admin.register(KDSOrderItem)
class KDSOrderItemAdmin(admin.ModelAdmin):
    list_display = [
        'order_number',
        'product_name_display',
        'zone_printer_id',
        'kds_status',
        'is_priority',
        'received_at',
        'prep_time_display',
        'status_indicator'
    ]
    list_filter = [
        'kds_status',
        'zone_printer_id',
        'is_priority',
        'is_addition',
        'received_at'
    ]
    search_fields = [
        'order_item__order__order_number',
        'order_item__product__name',
        'kitchen_notes'
    ]
    readonly_fields = [
        'id', 'received_at', 'created_at', 'updated_at',
        'prep_time_minutes', 'total_time_minutes', 'is_overdue'
    ]

    fieldsets = [
        ('Order Information', {
            'fields': ['id', 'order_item', 'zone_printer_id']
        }),
        ('Status & Workflow', {
            'fields': [
                'kds_status',
                'is_priority',
                'estimated_prep_time',
                'kitchen_notes'
            ]
        }),
        ('Timing', {
            'fields': [
                'received_at',
                'started_preparing_at',
                'ready_at',
                'completed_at',
                'held_at',
                'prep_time_minutes',
                'total_time_minutes',
                'is_overdue'
            ]
        }),
        ('Order Modifications', {
            'fields': [
                'is_addition',
                'is_reappeared_completed',
                'original_completion_time'
            ]
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def order_number(self, obj):
        return obj.order_item.order.order_number
    order_number.short_description = 'Order #'

    def product_name_display(self, obj):
        return getattr(obj.order_item, 'product_name', 'Custom Item')
    product_name_display.short_description = 'Product'

    def prep_time_display(self, obj):
        prep_time = obj.prep_time_minutes
        if prep_time is not None:
            return f"{prep_time} min"
        return "-"
    prep_time_display.short_description = 'Prep Time'

    def status_indicator(self, obj):
        status_colors = {
            'received': '#ffa500',  # orange
            'preparing': '#0066cc',  # blue
            'ready': '#00cc66',  # green
            'completed': '#666666',  # gray
            'held': '#cc0000',  # red
        }
        color = status_colors.get(obj.kds_status, '#000000')

        indicator = f'<span style="color: {color}; font-weight: bold;">●</span>'

        if obj.is_overdue:
            indicator += ' <span style="color: red; font-size: 12px;">⚠ OVERDUE</span>'

        return format_html(indicator)

    status_indicator.short_description = 'Status'


@admin.register(KitchenMetrics)
class KitchenMetricsAdmin(admin.ModelAdmin):
    list_display = [
        'zone_printer_id',
        'date',
        'shift',
        'total_items',
        'completed_items',
        'completion_rate_display',
        'average_prep_time',
        'on_time_rate_display'
    ]
    list_filter = ['zone_printer_id', 'date', 'shift']
    search_fields = ['zone_printer_id']
    readonly_fields = [
        'id', 'created_at', 'updated_at',
        'completion_rate', 'on_time_rate'
    ]

    fieldsets = [
        ('Basic Information', {
            'fields': ['id', 'zone_printer_id', 'date', 'shift']
        }),
        ('Performance Metrics', {
            'fields': [
                'total_items',
                'completed_items',
                'completion_rate',
                'average_prep_time',
                'items_on_time',
                'overdue_items',
                'on_time_rate'
            ]
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def completion_rate_display(self, obj):
        rate = obj.completion_rate
        if rate >= 90:
            color = 'green'
        elif rate >= 75:
            color = 'orange'
        else:
            color = 'red'

        rate_str = f"{float(rate):.1f}%"
        return format_html(
            '<span style="color: {};">{}</span>',
            color, rate_str
        )
    completion_rate_display.short_description = 'Completion Rate'

    def on_time_rate_display(self, obj):
        rate = obj.on_time_rate
        if rate >= 90:
            color = 'green'
        elif rate >= 75:
            color = 'orange'
        else:
            color = 'red'

        rate_str = f"{float(rate):.1f}%"
        return format_html(
            '<span style="color: {};">{}</span>',
            color, rate_str
        )
    on_time_rate_display.short_description = 'On-Time Rate'


@admin.register(KDSAlert)
class KDSAlertAdmin(admin.ModelAdmin):
    list_display = [
        'title',
        'zone_printer_id',
        'alert_type',
        'priority_display',
        'is_active',
        'created_at',
        'resolved_at'
    ]
    list_filter = [
        'alert_type',
        'priority',
        'is_active',
        'zone_printer_id',
        'created_at'
    ]
    search_fields = ['title', 'message', 'zone_printer_id']
    readonly_fields = ['id', 'created_at', 'resolved_at']

    fieldsets = [
        ('Alert Information', {
            'fields': [
                'id',
                'zone_printer_id',
                'alert_type',
                'priority',
                'title',
                'message'
            ]
        }),
        ('Related Objects', {
            'fields': ['order_item']
        }),
        ('Alert Status', {
            'fields': ['is_active', 'resolved_at']
        }),
        ('Timestamps', {
            'fields': ['created_at'],
            'classes': ['collapse']
        }),
    ]

    actions = ['resolve_alerts']

    def priority_display(self, obj):
        priority_colors = {
            'low': '#00cc66',
            'medium': '#ffa500',
            'high': '#ff6600',
            'critical': '#cc0000',
        }
        color = priority_colors.get(obj.priority, '#000000')

        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, obj.get_priority_display().upper()
        )
    priority_display.short_description = 'Priority'

    def resolve_alerts(self, request, queryset):
        count = 0
        for alert in queryset:
            if alert.is_active:
                alert.resolve()
                count += 1

        self.message_user(
            request,
            f'Successfully resolved {count} alert(s).'
        )
    resolve_alerts.short_description = 'Resolve selected alerts'


@admin.register(QCOrderView)
class QCOrderViewAdmin(admin.ModelAdmin):
    list_display = [
        'order_number',
        'qc_zone_printer_id',
        'qc_status',
        'kitchen_readiness',
        'ready_for_qc_at',
        'qc_completed_at',
        'requires_remake'
    ]
    list_filter = [
        'qc_status',
        'qc_zone_printer_id',
        'requires_remake',
        'ready_for_qc_at'
    ]
    search_fields = [
        'order__order_number',
        'qc_notes'
    ]
    readonly_fields = [
        'id', 'created_at', 'updated_at',
        'all_kitchen_items_ready', 'kitchen_item_statuses'
    ]

    fieldsets = [
        ('Order Information', {
            'fields': ['id', 'order', 'qc_zone_printer_id']
        }),
        ('QC Status', {
            'fields': [
                'qc_status',
                'all_kitchen_items_ready',
                'requires_remake',
                'qc_notes'
            ]
        }),
        ('QC Timing', {
            'fields': [
                'ready_for_qc_at',
                'qc_started_at',
                'qc_completed_at'
            ]
        }),
        ('Kitchen Items Status', {
            'fields': ['kitchen_item_statuses'],
            'classes': ['collapse']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def order_number(self, obj):
        return obj.order.order_number
    order_number.short_description = 'Order #'

    def kitchen_readiness(self, obj):
        if obj.all_kitchen_items_ready:
            return format_html('<span style="color: green;">✓ Ready</span>')
        else:
            return format_html('<span style="color: orange;">⏳ Waiting</span>')
    kitchen_readiness.short_description = 'Kitchen Status'
