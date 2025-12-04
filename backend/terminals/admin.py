from django.contrib import admin
from django.utils import timezone
from .models import TerminalPairingCode, TerminalRegistration
from core_backend.admin.mixins import TenantAdminMixin


@admin.register(TerminalPairingCode)
class TerminalPairingCodeAdmin(admin.ModelAdmin):
    """Admin for terminal pairing codes"""

    list_display = ('user_code', 'device_fingerprint', 'status', 'tenant', 'location', 'expires_at', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('user_code', 'device_code', 'device_fingerprint')
    readonly_fields = ('device_code', 'user_code', 'device_fingerprint', 'created_at', 'approved_at', 'consumed_at', 'ip_address')

    fieldsets = (
        ('Code Information', {
            'fields': ('device_code', 'user_code', 'device_fingerprint', 'ip_address')
        }),
        ('Status', {
            'fields': ('status', 'expires_at', 'interval')
        }),
        ('Assignment', {
            'fields': ('tenant', 'location', 'nickname', 'created_by')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'approved_at', 'consumed_at')
        }),
    )

    def get_queryset(self, request):
        """Show all pairing codes (they don't have tenant until approved)"""
        return TerminalPairingCode.objects.select_related('tenant', 'location', 'created_by')


@admin.register(TerminalRegistration)
class TerminalRegistrationAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin view for managing TerminalRegistration, the new standard for POS devices.
    """

    list_display = (
        "device_id", "nickname", "store_location", "status_display",
        "pending_orders_count", "last_heartbeat_at",
        "is_active", "is_locked"
    )
    list_filter = ("store_location", "is_active", "is_locked", "sync_status")
    search_fields = ("device_id", "nickname", "reader_id", "device_fingerprint")
    readonly_fields = (
        "last_seen", "last_authenticated_at", "device_fingerprint",
        # Heartbeat status fields (read-only, updated by heartbeat endpoint)
        "last_heartbeat_at", "sync_status", "pending_orders_count",
        "pending_operations_count", "last_sync_success_at", "last_flush_success_at",
        "exposure_amount", "status_display", "offline_duration_display",
        # Parked/shutdown and alert tracking
        "parked_at", "offline_alert_sent_at",
    )
    autocomplete_fields = ["store_location", "pairing_code"]
    actions = ['unlock_terminals']

    fieldsets = (
        ('Device Information', {
            'fields': ('device_id', 'nickname', 'device_fingerprint', 'reader_id')
        }),
        ('Location & Pairing', {
            'fields': ('store_location', 'pairing_code')
        }),
        ('Status', {
            'fields': ('is_active', 'is_locked')
        }),
        ('Sync Status', {
            'fields': (
                'status_display', 'last_heartbeat_at',
                'pending_orders_count', 'pending_operations_count',
                'exposure_amount', 'offline_duration_display',
                'parked_at', 'offline_alert_sent_at',
            ),
            'description': 'Real-time status reported by terminal heartbeats'
        }),
        ('Sync Timestamps', {
            'fields': ('last_sync_success_at', 'last_flush_success_at'),
            'classes': ('collapse',)
        }),
        ('Security', {
            'fields': ('last_authenticated_at', 'authentication_failures')
        }),
        ('Timestamps', {
            'fields': ('last_seen',)
        }),
    )

    @admin.display(description='Status')
    def status_display(self, obj):
        """
        Display unified status with color coding.
        Uses display_status property which returns:
        - online: Terminal is operational
        - syncing: Terminal is flushing offline queue
        - offline: Terminal was active today but is now unreachable
        - shutdown: Terminal was intentionally parked/shutdown
        - inactive: Terminal hasn't been used today
        """
        status = obj.display_status
        icons = {
            'online': '🟢 Online',
            'syncing': '🔄 Syncing',
            'offline': '🔴 Offline',
            'shutdown': '⏸️ Shutdown',
            'inactive': '⚪ Inactive',
        }
        result = icons.get(status, f'❓ {status}')

        # Add warning if needs attention (was active today, now offline)
        if obj.needs_attention:
            result += ' ⚠️'

        # Show alert sent indicator
        if obj.offline_alert_sent_at:
            result += ' 📧'

        return result

    @admin.display(description='Offline Duration')
    def offline_duration_display(self, obj):
        """Display how long terminal has been offline, or N/A if online."""
        duration = obj.offline_duration
        if not duration:
            return '—'

        # Format duration nicely
        total_seconds = int(duration.total_seconds())
        if total_seconds < 60:
            return f'{total_seconds}s'
        elif total_seconds < 3600:
            minutes = total_seconds // 60
            return f'{minutes}m'
        else:
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            return f'{hours}h {minutes}m'

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return TerminalRegistration.all_objects.select_related('tenant', 'store_location', 'pairing_code')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Ensure the current store_location is included in the queryset"""
        if db_field.name == "store_location":
            from settings.models import StoreLocation
            # Use all_objects to show locations across all tenants in admin
            kwargs["queryset"] = StoreLocation.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    @admin.action(description='Unlock selected terminals')
    def unlock_terminals(self, request, queryset):
        """
        Unlock selected terminals and reset their authentication failure counters.

        This action is used to manually unlock terminals that have been locked
        due to repeated authentication failures.
        """
        updated = queryset.update(
            is_locked=False,
            authentication_failures=0,
            last_authenticated_at=timezone.now()
        )
        self.message_user(
            request,
            f'{updated} terminal(s) successfully unlocked and reset.'
        )
