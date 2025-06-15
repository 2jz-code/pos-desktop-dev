from django.contrib import admin
from .models import GlobalSettings, POSDevice, TerminalLocation


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(admin.ModelAdmin):
    """
    Admin view for the GlobalSettings model.
    It prevents adding new instances if one already exists.
    """

    list_display = (
        "__str__",
        "tax_rate",
        "surcharge_percentage",
        "active_terminal_provider",
    )

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
