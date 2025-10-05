from django.contrib import admin
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

    list_display = ("device_id", "nickname", "store_location", "is_active", "last_seen", "is_locked")
    list_filter = ("store_location", "is_active", "is_locked")
    search_fields = ("device_id", "nickname", "reader_id", "device_fingerprint")
    readonly_fields = ("last_seen", "last_authenticated_at", "device_fingerprint")
    autocomplete_fields = ["store_location", "pairing_code"]

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
        ('Security', {
            'fields': ('last_authenticated_at', 'authentication_failures')
        }),
        ('Timestamps', {
            'fields': ('last_seen',)
        }),
    )

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return TerminalRegistration.all_objects.select_related('tenant', 'store_location', 'pairing_code')
