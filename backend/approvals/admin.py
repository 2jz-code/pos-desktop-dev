from django.contrib import admin
from django.utils.html import format_html
from core_backend.admin.mixins import TenantAdminMixin
from .models import ManagerApprovalRequest, ApprovalPolicy


@admin.register(ManagerApprovalRequest)
class ManagerApprovalRequestAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin interface for viewing and managing approval requests.

    Provides read-only access to approval history with comprehensive filtering
    and search capabilities. Approval actions should be performed via API.
    """

    list_display = (
        "id",
        "action_type",
        "status_badge",
        "initiator_display",
        "approver_display",
        "store_location",
        "threshold_value",
        "created_at",
        "expires_at",
    )

    list_filter = (
        "status",
        "action_type",
        "store_location",
        "created_at",
        "expires_at",
    )

    search_fields = (
        "id",
        "initiator__email",
        "approver__email",
        "order__order_number",
        "reason",
    )

    readonly_fields = (
        "id",
        "tenant",
        "store_location",
        "initiator",
        "approver",
        "action_type",
        "status",
        "order",
        "order_item",
        "discount",
        "related_object_label",
        "payload",
        "reason",
        "threshold_value",
        "expires_at",
        "approved_at",
        "denied_at",
        "created_at",
        "updated_at",
        "is_expired",
        "is_pending",
        "can_be_approved",
    )

    fieldsets = (
        ("Basic Information", {
            "fields": ("id", "action_type", "status", "tenant", "store_location")
        }),
        ("Actors", {
            "fields": ("initiator", "approver")
        }),
        ("Related Objects", {
            "fields": ("order", "order_item", "discount", "related_object_label")
        }),
        ("Details", {
            "fields": ("payload", "reason", "threshold_value")
        }),
        ("Lifecycle", {
            "fields": (
                "expires_at",
                "approved_at",
                "denied_at",
                "created_at",
                "updated_at",
                "is_expired",
                "is_pending",
                "can_be_approved",
            )
        }),
    )

    ordering = ("-created_at",)
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        """Prevent creating approval requests via admin"""
        return False

    def has_change_permission(self, request, obj=None):
        """Prevent editing approval requests via admin"""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deleting approval requests via admin"""
        return False

    def status_badge(self, obj):
        """Display status as a colored badge"""
        colors = {
            "PENDING": "orange",
            "APPROVED": "green",
            "DENIED": "red",
            "EXPIRED": "gray",
        }
        color = colors.get(obj.status, "gray")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = "Status"

    def initiator_display(self, obj):
        """Display initiator with username or email"""
        if obj.initiator:
            return f"{obj.initiator.username or obj.initiator.email} ({obj.initiator.get_role_display()})"
        return "-"
    initiator_display.short_description = "Initiator"

    def approver_display(self, obj):
        """Display approver with username or email"""
        if obj.approver:
            return f"{obj.approver.username or obj.approver.email} ({obj.approver.get_role_display()})"
        return "-"
    approver_display.short_description = "Approver"


@admin.register(ApprovalPolicy)
class ApprovalPolicyAdmin(TenantAdminMixin, admin.ModelAdmin):
    """
    Admin interface for managing approval policies.

    Allows configuring thresholds and settings that determine when
    manager approval is required for various actions.
    """

    list_display = (
        "store_location",
        "max_discount_percent",
        "max_refund_amount",
        "max_void_order_amount",
        "approval_expiry_minutes",
        "allow_self_approval",
    )

    list_filter = (
        "allow_self_approval",
        "store_location",
    )

    search_fields = (
        "store_location__name",
    )

    fieldsets = (
        ("Store Location", {
            "fields": ("tenant", "store_location")
        }),
        ("Threshold Settings", {
            "description": "These thresholds determine when manager approval is required.",
            "fields": (
                "max_discount_percent",
                "max_refund_amount",
                "max_price_override_amount",
                "max_void_order_amount",
            )
        }),
        ("Security Settings", {
            "fields": ("allow_self_approval",),
            "description": "Self-approval allows a manager to approve their own requests (not recommended)."
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )

    readonly_fields = ("tenant", "store_location", "created_at", "updated_at")

    ordering = ("store_location__name",)

    def has_add_permission(self, request):
        """Prevent creating policies via admin - they're auto-created"""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deleting policies via admin"""
        return False
