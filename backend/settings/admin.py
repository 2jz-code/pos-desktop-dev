from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.contrib import messages
from django import forms
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    PrinterConfiguration,
    WebOrderSettings,
    StockActionReasonConfig,
)
from core_backend.admin.mixins import ArchivingAdminMixin, TenantAdminMixin


# === CUSTOM FORMS ===


class TerminalLocationInlineForm(forms.ModelForm):
    """
    Custom form for TerminalLocation inline that makes stripe_id optional
    when the entire inline is empty (allows saving StoreLocation without Stripe config).
    """

    class Meta:
        model = TerminalLocation
        fields = ('stripe_id',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Make stripe_id not required in the form
        self.fields['stripe_id'].required = False

    def clean(self):
        cleaned_data = super().clean()
        stripe_id = cleaned_data.get('stripe_id')

        # If DELETE is checked or no stripe_id is provided, allow it
        # Only validate if user is actually providing data
        if self.cleaned_data.get('DELETE') or not stripe_id:
            # If no stripe_id and not marked for deletion, skip saving this inline
            if not stripe_id and not self.instance.pk:
                # This is a new unsaved inline with no data - don't create it
                return cleaned_data

        return cleaned_data


# === ADMIN CLASSES ===


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin view for the singleton GlobalSettings model.
    Redirects from the list view to the single change form.
    """

    fieldsets = (
        (
            "Brand Identity",
            {
                "fields": ("brand_name", "brand_logo", "brand_primary_color", "brand_secondary_color"),
                "description": "Your brand identity used across all locations."
            },
        ),
        (
            "Financial Rules",
            {
                "fields": ("currency", "surcharge_percentage", "allow_discount_stacking"),
                "description": "Tenant-wide financial rules that apply to all locations."
            },
        ),
        (
            "Receipt Templates",
            {
                "fields": ("brand_receipt_header", "brand_receipt_footer"),
                "description": "Default receipt templates. Locations can override these."
            }
        ),
        ("Payment Processing", {"fields": ("active_terminal_provider",)}),
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

    Phase 5 Fix: Uses custom form to make stripe_id optional, preventing validation errors
    when saving StoreLocation without Stripe configuration.
    """

    model = TerminalLocation
    form = TerminalLocationInlineForm  # Use custom form with optional stripe_id
    can_delete = True  # Allow deletion of Stripe config if not needed
    verbose_name_plural = "Stripe Location Link (Optional)"
    extra = 0  # Don't show empty form by default - add only when needed
    max_num = 1
    fields = ('stripe_id',)  # Only show stripe_id field, tenant and store_location are auto-set

    # Helpful text for users
    help_text = "Link this store location to a Stripe Terminal location (optional). Leave empty if not using Stripe Terminal."

    def get_queryset(self, request):
        """Use all_objects to show items across all tenants in admin"""
        return TerminalLocation.all_objects.select_related("store_location")

    def has_add_permission(self, request, obj=None):
        """Only allow adding if no TerminalLocation exists for this StoreLocation yet"""
        if obj and hasattr(obj, 'terminallocation'):
            return False  # Already has a TerminalLocation
        return super().has_add_permission(request, obj)


@admin.register(StoreLocation)
class StoreLocationAdmin(TenantAdminMixin, ArchivingAdminMixin, admin.ModelAdmin):
    """
    Admin view for the primary StoreLocation model.
    Includes an inline for the Stripe configuration.

    Phase 5 Enhancement: Now includes location-specific settings.
    """

    list_display = ("name", "city", "state", "accepts_web_orders", "timezone", "phone")
    list_filter = ("accepts_web_orders", "timezone", "country")
    search_fields = ("name", "city", "state", "slug", "address_line1")
    inlines = [TerminalLocationInline]

    readonly_fields = ('slug',)  # Auto-generated from name

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": ("name", "slug", "phone", "email")
            }
        ),
        (
            "Structured Address",
            {
                "fields": (
                    "address_line1",
                    "address_line2",
                    "city",
                    "state",
                    "postal_code",
                    "country"
                ),
                "description": "Use structured address fields for better data quality. Legacy 'address' field below is deprecated."
            }
        ),
        (
            "Legacy Address (Deprecated)",
            {
                "fields": ("address",),
                "classes": ("collapse",),
                "description": "Deprecated: Use structured address fields above instead."
            }
        ),
        (
            "Location Settings",
            {
                "fields": ("timezone", "tax_rate"),
                "description": "Location-specific operational settings."
            }
        ),
        (
            "Web Order Configuration",
            {
                "fields": ("accepts_web_orders", "web_order_lead_time_minutes"),
            }
        ),
        (
            "Web Order Notification Overrides (Optional)",
            {
                "fields": (
                    "enable_web_notifications",
                    "play_web_notification_sound",
                    "auto_print_web_receipt",
                    "auto_print_web_kitchen",
                    "web_notification_terminals",
                ),
                "classes": ("collapse",),
                "description": "Override tenant-wide web order notification defaults for this location. Leave blank to use tenant defaults. Select terminals at this location for notifications."
            }
        ),
        (
            "Receipt Customization",
            {
                "fields": ("receipt_header", "receipt_footer"),
                "classes": ("collapse",),
                "description": "Custom receipt text for this location. If empty, brand templates will be used."
            }
        ),
        (
            "Integrations",
            {
                "fields": ("google_place_id", "latitude", "longitude"),
                "classes": ("collapse",),
            }
        ),
    )

    filter_horizontal = ("web_notification_terminals",)

    def get_queryset(self, request):
        """Show all tenants in Django admin"""
        return StoreLocation.all_objects.select_related('tenant')


@admin.register(WebOrderSettings)
class WebOrderSettingsAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin view for the singleton WebOrderSettings model.
    Manages tenant-wide web order notification defaults.
    Terminal selection is managed per-location on StoreLocation model.
    """

    list_display = (
        "id",
        "enable_notifications",
        "play_notification_sound",
        "auto_print_receipt",
        "auto_print_kitchen",
    )

    fieldsets = (
        (
            "Tenant-Wide Notification Defaults",
            {
                "fields": (
                    "enable_notifications",
                    "play_notification_sound",
                    "auto_print_receipt",
                    "auto_print_kitchen",
                ),
                "description": "These settings apply to all locations unless overridden at the location level. Terminal selection is configured per-location."
            }
        ),
    )

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
