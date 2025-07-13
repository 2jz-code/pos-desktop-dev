from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils import timezone
from .models import ReportCache, SavedReport, ReportTemplate, ReportExecution


@admin.register(ReportCache)
class ReportCacheAdmin(admin.ModelAdmin):
    list_display = (
        "report_type",
        "parameters_hash_short",
        "generated_at",
        "expires_at",
        "is_expired",
    )
    list_filter = ("report_type", "generated_at", "expires_at")
    search_fields = ("parameters_hash", "report_type")
    readonly_fields = ("parameters_hash", "generated_at", "is_expired")
    ordering = ("-generated_at",)

    def parameters_hash_short(self, obj):
        return (
            obj.parameters_hash[:12] + "..."
            if len(obj.parameters_hash) > 12
            else obj.parameters_hash
        )

    parameters_hash_short.short_description = "Hash"

    def is_expired(self, obj):
        expired = obj.is_expired
        color = "red" if expired else "green"
        text = "Expired" if expired else "Valid"
        return format_html('<span style="color: {};">{}</span>', color, text)

    is_expired.short_description = "Status"

    actions = ["cleanup_expired"]

    def cleanup_expired(self, request, queryset):
        deleted_count = ReportCache.cleanup_expired()[0]
        self.message_user(request, f"Cleaned up {deleted_count} expired cache entries.")

    cleanup_expired.short_description = "Clean up expired cache entries"


@admin.register(SavedReport)
class SavedReportAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "user",
        "report_type",
        "schedule",
        "format",
        "status",
        "last_run",
        "next_run",
        "file_size_display",
    )
    list_filter = ("report_type", "schedule", "format", "status", "created_at")
    search_fields = ("name", "user__username", "user__email")
    readonly_fields = (
        "created_at",
        "updated_at",
        "last_run",
        "generation_time",
        "row_count",
        "file_size_mb",
    )
    ordering = ("-created_at",)

    fieldsets = (
        (
            "Basic Information",
            {"fields": ("name", "user", "report_type", "parameters")},
        ),
        ("Scheduling", {"fields": ("schedule", "format", "status", "next_run")}),
        ("File Management", {"fields": ("last_generated_file", "file_size_mb")}),
        (
            "Performance Metrics",
            {
                "fields": ("last_run", "generation_time", "row_count"),
                "classes": ("collapse",),
            },
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def file_size_display(self, obj):
        if obj.file_size:
            return f"{obj.file_size_mb} MB"
        return "No file"

    file_size_display.short_description = "File Size"

    actions = ["mark_active", "mark_paused", "reset_schedule"]

    def mark_active(self, request, queryset):
        count = queryset.update(status="active")
        self.message_user(request, f"Marked {count} reports as active.")

    mark_active.short_description = "Mark selected reports as active"

    def mark_paused(self, request, queryset):
        count = queryset.update(status="paused")
        self.message_user(request, f"Marked {count} reports as paused.")

    mark_paused.short_description = "Mark selected reports as paused"

    def reset_schedule(self, request, queryset):
        count = 0
        for report in queryset:
            if report.schedule != "manual":
                report.next_run = report._calculate_next_run()
                report.save()
                count += 1
        self.message_user(request, f"Reset schedule for {count} reports.")

    reset_schedule.short_description = "Reset schedule for selected reports"


@admin.register(ReportTemplate)
class ReportTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "report_type",
        "is_system_template",
        "created_by",
        "created_at",
    )
    list_filter = ("report_type", "is_system_template", "created_at")
    search_fields = ("name", "description", "created_by__username")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("name",)

    fieldsets = (
        ("Basic Information", {"fields": ("name", "description", "report_type")}),
        (
            "Configuration",
            {"fields": ("default_parameters", "is_system_template", "created_by")},
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def save_model(self, request, obj, form, change):
        if not change and not obj.created_by:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(ReportExecution)
class ReportExecutionAdmin(admin.ModelAdmin):
    list_display = (
        "saved_report",
        "status",
        "started_at",
        "completed_at",
        "execution_time_display",
        "row_count",
        "file_size_display",
    )
    list_filter = ("status", "started_at", "completed_at")
    search_fields = ("saved_report__name", "saved_report__user__username")
    readonly_fields = (
        "started_at",
        "completed_at",
        "execution_time",
        "row_count",
        "file_size",
    )
    ordering = ("-started_at",)

    fieldsets = (
        (
            "Execution Details",
            {"fields": ("saved_report", "status", "started_at", "completed_at")},
        ),
        ("Performance", {"fields": ("execution_time", "row_count", "file_size")}),
        ("Error Information", {"fields": ("error_message",), "classes": ("collapse",)}),
    )

    def execution_time_display(self, obj):
        if obj.execution_time:
            return f"{obj.execution_time:.2f}s"
        return "N/A"

    execution_time_display.short_description = "Execution Time"

    def file_size_display(self, obj):
        if obj.file_size:
            return f"{round(obj.file_size / (1024 * 1024), 2)} MB"
        return "N/A"

    file_size_display.short_description = "File Size"

    def has_add_permission(self, request):
        # Prevent manual creation of execution records
        return False

    def has_change_permission(self, request, obj=None):
        # Make execution records read-only
        return False


# Custom admin site configuration
admin.site.site_header = "POS Reports Administration"
admin.site.site_title = "POS Reports Admin"
admin.site.index_title = "Welcome to POS Reports Administration"
