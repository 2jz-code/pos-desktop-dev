from django.db import models
from django.utils import timezone
import uuid


class KDSSession(models.Model):
    """
    Tracks active KDS terminal sessions
    Links to existing printer/zone configuration from settings app
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    zone_printer_id = models.CharField(
        max_length=100, help_text="References existing printer ID from settings app"
    )
    terminal_id = models.CharField(
        max_length=100, help_text="Unique identifier for the terminal/device"
    )

    # Session tracking
    started_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    # Display preferences for this terminal
    max_orders_per_column = models.PositiveIntegerField(default=10)
    show_customer_names = models.BooleanField(default=True)
    show_order_type = models.BooleanField(default=True)

    class Meta:
        unique_together = ["zone_printer_id", "terminal_id"]

    def __str__(self):
        return f"Zone {self.zone_printer_id} - {self.terminal_id}"

    def update_activity(self):
        """Update last activity timestamp"""
        self.last_activity = timezone.now()
        self.save(update_fields=["last_activity"])


class KDSOrderItem(models.Model):
    """
    KDS-specific tracking for order items
    Extends OrderItem with kitchen workflow data
    """

    STATUS_CHOICES = [
        ("received", "Received"),
        ("preparing", "Preparing"),
        ("ready", "Ready"),
        ("completed", "Completed"),
        ("held", "Held"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_item = models.OneToOneField(
        "orders.OrderItem", on_delete=models.CASCADE, related_name="kds_item"
    )
    zone_printer_id = models.CharField(
        max_length=100, help_text="References existing printer ID from settings app"
    )

    # Kitchen workflow status
    kds_status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="received"
    )

    # Timing tracking
    received_at = models.DateTimeField(auto_now_add=True)
    started_preparing_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    held_at = models.DateTimeField(null=True, blank=True)

    # Notes and special handling
    kitchen_notes = models.TextField(blank=True)
    is_priority = models.BooleanField(default=False)
    estimated_prep_time = models.PositiveIntegerField(
        null=True, blank=True, help_text="Estimated prep time in minutes"
    )

    # Order addition tracking
    is_addition = models.BooleanField(
        default=False, help_text="Item added to existing order"
    )
    is_reappeared_completed = models.BooleanField(
        default=False, help_text="Previously completed item brought back for context"
    )
    original_completion_time = models.DateTimeField(
        null=True, blank=True, help_text="When item was originally completed"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["received_at"]

    def __str__(self):
        return f"{self.order_item.order.order_number} - {self.order_item.product_name if hasattr(self.order_item, 'product_name') else 'Custom Item'}"

    @property
    def prep_time_minutes(self):
        """Calculate actual prep time in minutes"""
        if self.started_preparing_at and self.ready_at:
            return int((self.ready_at - self.started_preparing_at).total_seconds() / 60)
        return None

    @property
    def total_time_minutes(self):
        """Calculate total time from received to ready in minutes"""
        if self.received_at and self.ready_at:
            return int((self.ready_at - self.received_at).total_seconds() / 60)
        return None

    @property
    def is_overdue(self):
        """Check if item is overdue based on estimated prep time"""
        if not self.estimated_prep_time or self.kds_status in ["ready", "completed"]:
            return False

        time_elapsed = timezone.now() - self.received_at
        return time_elapsed.total_seconds() / 60 > self.estimated_prep_time


class KitchenMetrics(models.Model):
    """
    Daily/shift metrics for kitchen performance by zone
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    zone_printer_id = models.CharField(
        max_length=100, help_text="References existing printer ID from settings app"
    )
    date = models.DateField()
    shift = models.CharField(
        max_length=20,
        choices=[
            ("morning", "Morning"),
            ("afternoon", "Afternoon"),
            ("evening", "Evening"),
            ("overnight", "Overnight"),
        ],
        default="morning",
    )

    # Performance metrics
    total_items = models.PositiveIntegerField(default=0)
    completed_items = models.PositiveIntegerField(default=0)
    average_prep_time = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    items_on_time = models.PositiveIntegerField(default=0)
    overdue_items = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["zone_printer_id", "date", "shift"]
        ordering = ["-date", "shift"]

    def __str__(self):
        return f"Zone {self.zone_printer_id} - {self.date} ({self.shift})"

    @property
    def completion_rate(self):
        """Calculate completion rate as percentage"""
        if self.total_items == 0:
            return 0
        return (self.completed_items / self.total_items) * 100

    @property
    def on_time_rate(self):
        """Calculate on-time completion rate as percentage"""
        if self.completed_items == 0:
            return 0
        return (self.items_on_time / self.completed_items) * 100


class KDSAlert(models.Model):
    """
    Simple system alerts for KDS (overdue orders, system issues, etc.)
    No user authentication required - alerts are automatically resolved
    """

    ALERT_TYPES = [
        ("overdue", "Overdue Order"),
        ("system", "System Alert"),
    ]

    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    zone_printer_id = models.CharField(
        max_length=100, help_text="References existing printer ID from settings app"
    )
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES)
    priority = models.CharField(
        max_length=10, choices=PRIORITY_CHOICES, default="medium"
    )

    title = models.CharField(max_length=200)
    message = models.TextField()

    # Reference to related objects
    order_item = models.ForeignKey(
        "orders.OrderItem", on_delete=models.CASCADE, null=True, blank=True
    )

    # Alert lifecycle
    is_active = models.BooleanField(default=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-priority"]

    def __str__(self):
        return f"{self.title} (Zone {self.zone_printer_id})"

    def resolve(self):
        """Mark alert as resolved"""
        self.is_active = False
        self.resolved_at = timezone.now()
        self.save(update_fields=["is_active", "resolved_at"])
