from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import reverse
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    TerminalRegistration,
    PrinterConfiguration,
    WebOrderSettings,
)


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(admin.ModelAdmin):
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
            "Business Hours",
            {
                "fields": ("opening_time", "closing_time", "timezone"),
                "classes": ("collapse",),
            },
        ),
    )

    def has_add_permission(self, request):
        return self.model.objects.count() == 0

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        if self.model.objects.exists():
            obj = self.model.objects.first()
            return HttpResponseRedirect(
                reverse("admin:settings_globalsettings_change", args=[obj.pk])
            )
        return super().changelist_view(request, extra_context)


@admin.register(PrinterConfiguration)
class PrinterConfigurationAdmin(admin.ModelAdmin):
    """
    Admin view for the singleton PrinterConfiguration model.
    """

    def has_add_permission(self, request):
        return self.model.objects.count() == 0

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Ensure the singleton object exists, then redirect to it.
        obj, created = self.model.objects.get_or_create(pk=1)
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
class StoreLocationAdmin(admin.ModelAdmin):
    """
    Admin view for the primary StoreLocation model.
    Includes an inline for the Stripe configuration.
    """

    list_display = ("name", "address", "is_default")
    list_filter = ("is_default",)
    search_fields = ("name",)
    inlines = [TerminalLocationInline]


@admin.register(TerminalRegistration)
class TerminalRegistrationAdmin(admin.ModelAdmin):
    """
    Admin view for managing TerminalRegistration, the new standard for POS devices.
    """

    list_display = ("device_id", "nickname", "store_location", "is_active", "last_seen")
    list_filter = ("store_location", "is_active")
    search_fields = ("device_id", "nickname", "reader_id")
    readonly_fields = ("last_seen",)
    autocomplete_fields = ["store_location"]


@admin.register(WebOrderSettings)
class WebOrderSettingsAdmin(admin.ModelAdmin):
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

    def has_add_permission(self, request):
        # Prevent adding new instances from the admin
        return not WebOrderSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Ensure the singleton object exists, then redirect to it.
        obj, created = self.model.objects.get_or_create(pk=1)
        return HttpResponseRedirect(
            reverse("admin:settings_webordersettings_change", args=[obj.pk])
        )
