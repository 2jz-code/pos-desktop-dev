from django.contrib import admin
from .models import GlobalSettings, POSDevice, TerminalLocation


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(admin.ModelAdmin):
    """
    Admin view for the GlobalSettings model.
    It prevents adding new instances if one already exists.
    """

    # Organize fields into logical sections
    fieldsets = (
        (
            "Store Information",
            {
                "fields": ("store_name", "store_address", "store_phone", "store_email"),
                "description": "Basic store information displayed on receipts and reports.",
            },
        ),
        (
            "Financial Settings",
            {
                "fields": ("tax_rate", "surcharge_percentage", "currency"),
                "description": "Tax rates and financial calculations applied to all transactions.",
            },
        ),
        (
            "Receipt Configuration",
            {
                "fields": ("receipt_header", "receipt_footer", "print_customer_copy"),
                "description": "Customize receipt appearance and printing behavior.",
            },
        ),
        (
            "Payment Processing",
            {
                "fields": ("active_terminal_provider",),
                "description": "Payment terminal and processing configuration.",
            },
        ),
        (
            "Business Hours",
            {
                "fields": ("opening_time", "closing_time", "timezone"),
                "description": "Business hours for reporting and analytics.",
                "classes": ("collapse",),  # Initially collapsed
            },
        ),
    )

    list_display = (
        "__str__",
        "store_name",
        "currency",
        "tax_rate",
        "active_terminal_provider",
        "timezone",
    )

    # Read-only fields that are calculated or system-managed
    readonly_fields = []

    def has_add_permission(self, request):
        """
        Disallow adding a new GlobalSettings object if one already exists.
        """
        # If there are already objects, don't allow adding more.
        if self.model.objects.count() > 0:
            return False
        return super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        """
        It's generally a good idea to prevent deletion of the singleton settings object.
        You can remove this method if you want to allow deletion.
        """
        return False

    def changelist_view(self, request, extra_context=None):
        """
        Override changelist view to redirect to the single settings object if it exists.
        """
        if self.model.objects.exists():
            obj = self.model.objects.first()
            return self.response_change(request, obj)
        return super().changelist_view(request, extra_context)


@admin.register(POSDevice)
class POSDeviceAdmin(admin.ModelAdmin):
    list_display = ("device_id", "reader_id", "nickname")
    search_fields = ("device_id", "reader_id", "nickname")


@admin.register(TerminalLocation)
class TerminalLocationAdmin(admin.ModelAdmin):
    list_display = ("name", "stripe_id", "is_default")
    list_filter = ("is_default",)
    search_fields = ("name", "stripe_id")
    actions = ["set_as_default"]

    def set_as_default(self, request, queryset):
        if queryset.count() == 1:
            location = queryset.first()
            location.is_default = True
            location.save()
            self.message_user(
                request, f"'{location.name}' has been set as the default."
            )
        else:
            self.message_user(
                request, "Please select only one location to set as default.", "warning"
            )

    set_as_default.short_description = "Set selected location as default"
