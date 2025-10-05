from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.contrib import messages
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    PrinterConfiguration,
    WebOrderSettings,
    StockActionReasonConfig,
)
from core_backend.admin.mixins import ArchivingAdminMixin, TenantAdminMixin


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin view for the singleton GlobalSettings model.
    Redirects from the list view to the single change form.
    """

    fieldsets = (
        (
            "Store Information",
            {"fields": ("store_name", "store_address", "store_phone", "store_email")},
        ),
        (
            "Financial Settings",
            {"fields": ("tax_rate", "surcharge_percentage", "currency")},
        ),
        ("Receipt Configuration", {"fields": ("receipt_header", "receipt_footer")}),
        ("Payment Processing", {"fields": ("active_terminal_provider",)}),
        (
            "Defaults",
            {
                "fields": ("default_store_location", "default_inventory_location"),
                "description": "Set default locations for various operations.",
            },
        ),
        (
            "Inventory Defaults",
            {
                "fields": ("default_low_stock_threshold", "default_expiration_threshold"),
                "description": "Global default thresholds for inventory warnings. These can be overridden per product.",
            },
        ),
        (
            "Business Hours & Timezone",
            {
                "fields": ("timezone", "opening_time", "closing_time"),
                "description": "Configure your business timezone and operating hours. This affects report date ranges and business logic.",
            },
        ),
    )

    actions = ['clear_report_cache']

    def clear_report_cache(self, request, queryset):
        """Clear all report cache when timezone settings change"""
        from django.core.cache import cache
        from reports.models import ReportCache
        
        cache.clear()
        ReportCache.objects.all().delete()
        
        messages.success(request, "Report cache has been cleared. Reports will regenerate with the new timezone settings.")
    clear_report_cache.short_description = "Clear report cache (use after changing timezone)"

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return GlobalSettings.all_objects.select_related('tenant')

    def has_add_permission(self, request):
        return self.model.all_objects.count() == 0

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        if self.model.all_objects.exists():
            obj = self.model.all_objects.first()
            return HttpResponseRedirect(
                reverse("admin:settings_globalsettings_change", args=[obj.pk])
            )
        return super().changelist_view(request, extra_context)


@admin.register(PrinterConfiguration)
class PrinterConfigurationAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin view for the singleton PrinterConfiguration model.
    """

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return PrinterConfiguration.all_objects.select_related('tenant')

    def has_add_permission(self, request):
        return self.model.all_objects.count() == 0

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Ensure the singleton object exists, then redirect to it.
        obj, created = self.model.all_objects.get_or_create(pk=1)
        return HttpResponseRedirect(
            reverse("admin:settings_printerconfiguration_change", args=[obj.pk])
        )


class TerminalLocationInline(admin.StackedInline):
    """
    Inline admin for the Stripe-specific TerminalLocation model.
    This allows managing the Stripe location link directly from the StoreLocation page.
    """

    model = TerminalLocation
    can_delete = False
    verbose_name_plural = "Stripe Location Link"
    extra = 1
    max_num = 1
    # Here, you could add custom form logic to fetch locations from the Stripe API
    # and populate a dropdown for the `stripe_id` field.


@admin.register(StoreLocation)
class StoreLocationAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    """
    Admin view for the primary StoreLocation model.
    Includes an inline for the Stripe configuration.
    """

    list_display = ("name", "address", "is_default")
    list_filter = ("is_default",)
    search_fields = ("name",)
    inlines = [TerminalLocationInline]

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return StoreLocation.all_objects.select_related('tenant')


@admin.register(WebOrderSettings)
class WebOrderSettingsAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin view for the singleton WebOrderSettings model.
    Manages terminal selection for web order notifications.
    """

    list_display = (
        "id",
        "enable_notifications",
        "play_notification_sound",
        "auto_print_receipt",
        "auto_print_kitchen",
    )
    filter_horizontal = ("web_receipt_terminals",)

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return WebOrderSettings.all_objects.select_related('tenant')

    def has_add_permission(self, request):
        # Prevent adding new instances from the admin
        return not WebOrderSettings.all_objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Ensure the singleton object exists, then redirect to it.
        obj, created = self.model.all_objects.get_or_create(pk=1)
        return HttpResponseRedirect(
            reverse("admin:settings_webordersettings_change", args=[obj.pk])
        )


@admin.register(StockActionReasonConfig)
class StockActionReasonConfigAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    """
    Admin view for managing stock action reasons.
    Only owners can create/edit/delete custom reasons.
    System reasons are protected from modification.
    """

    list_display = (
        "name",
        "category",
        "is_system_reason",
        "is_active",
        "usage_count_display",
        "created_at",
    )
    list_filter = (
        "category",
        "is_system_reason",
        "is_active",
    )
    search_fields = ("name", "description")
    readonly_fields = (
        "is_system_reason",
        "usage_count_display",
        "can_be_deleted_display",
        "created_at",
        "updated_at",
    )
    ordering = ["category", "name"]

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return StockActionReasonConfig.all_objects.select_related('tenant')

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "name",
                    "description",
                    "category",
                )
            },
        ),
        (
            "Status & Configuration",
            {
                "fields": (
                    "is_active",
                    "is_system_reason",
                )
            },
        ),
        (
            "Usage & Analytics",
            {
                "fields": (
                    "usage_count_display",
                    "can_be_deleted_display",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    def usage_count_display(self, obj):
        """Display usage count with link to history if applicable"""
        count = obj.usage_count
        if count > 0:
            return f"{count} times used"
        return "Not used yet"

    usage_count_display.short_description = "Usage Count"

    def can_be_deleted_display(self, obj):
        """Display whether this reason can be safely deleted"""
        if obj.is_system_reason:
            return "❌ System reason (cannot delete)"
        elif obj.can_be_deleted:
            return "✅ Safe to delete"
        else:
            return "⚠️ In use (delete will affect history)"

    can_be_deleted_display.short_description = "Deletion Safety"

    def get_readonly_fields(self, request, obj=None):
        """Make system reasons read-only for non-superusers"""
        readonly_fields = list(self.readonly_fields)
        
        if obj and obj.is_system_reason:
            # System reasons cannot be modified
            readonly_fields.extend(["name", "description", "category", "is_active"])
        
        return readonly_fields

    def has_add_permission(self, request):
        """Only owners can add new reasons"""
        return request.user.is_authenticated and (
            request.user.is_superuser or 
            (hasattr(request.user, 'role') and request.user.role == 'OWNER')
        )

    def has_change_permission(self, request, obj=None):
        """Owners can edit all reasons, but system reasons are read-only"""
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
            
        if hasattr(request.user, 'role') and request.user.role == 'OWNER':
            return True
            
        return False

    def has_delete_permission(self, request, obj=None):
        """Only owners can delete reasons, and only custom ones"""
        if not request.user.is_authenticated:
            return False
            
        if not (request.user.is_superuser or 
                (hasattr(request.user, 'role') and request.user.role == 'OWNER')):
            return False
            
        # Never allow deletion of system reasons
        if obj and obj.is_system_reason:
            return False
            
        return True

    def delete_model(self, request, obj):
        """Override delete to show warning if reason is in use"""
        if not obj.can_be_deleted:
            messages.warning(
                request,
                f"Warning: '{obj.name}' is currently in use by {obj.usage_count} stock history entries. "
                "Deleting it will not affect existing history, but the reason will show as 'Deleted Reason' in reports."
            )
        super().delete_model(request, obj)
        
    def save_model(self, request, obj, form, change):
        """Override save to prevent system reason modification"""
        if obj.is_system_reason and change:
            messages.error(
                request, 
                "System reasons cannot be modified. Changes were not saved."
            )
            return
        super().save_model(request, obj, form, change)
