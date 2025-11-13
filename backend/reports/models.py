from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from core_backend.utils.archiving import SoftDeleteMixin
from tenant.managers import TenantManager, TenantSoftDeleteManager

User = get_user_model()


class ReportType(models.TextChoices):
    SUMMARY = "summary", "Summary Report"
    SALES = "sales", "Sales Report"
    PRODUCTS = "products", "Products Report"
    PAYMENTS = "payments", "Payments Report"
    OPERATIONS = "operations", "Operations Report"


class ScheduleType(models.TextChoices):
    MANUAL = "manual", "Manual"
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"


class FormatType(models.TextChoices):
    PDF = "PDF", "PDF"
    EXCEL = "Excel", "Excel"
    CSV = "CSV", "CSV"


class ReportStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    ERROR = "error", "Error"


class ReportCache(models.Model):
    """Intelligent caching for expensive report queries"""

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='report_caches'
    )
    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.CASCADE,
        related_name='report_caches',
        null=True,
        blank=True,
        help_text='Store location this cache entry is for (optional for multi-location filtering)'
    )
    report_type = models.CharField(max_length=50, choices=ReportType.choices)
    parameters_hash = models.CharField(max_length=64)
    parameters = models.JSONField()
    data = models.JSONField()
    generated_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "report_type", "parameters_hash"]),
            models.Index(fields=["tenant", "expires_at"]),
            models.Index(fields=['tenant', 'store_location', 'report_type'], name='reports_cache_ten_loc_type_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "parameters_hash"],
                name="unique_report_cache_per_tenant",
            ),
        ]
        verbose_name = "Report Cache"
        verbose_name_plural = "Report Caches"

    def __str__(self):
        return f"{self.report_type} - {self.parameters_hash[:8]}..."

    @property
    def is_expired(self):
        """Check if cache entry is expired"""
        return timezone.now() > self.expires_at

    @classmethod
    def cleanup_expired(cls):
        """Remove expired cache entries"""
        return cls.objects.filter(expires_at__lt=timezone.now()).delete()


class SavedReport(SoftDeleteMixin):
    """Extended saved reports with file management"""

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='saved_reports'
    )
    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.PROTECT,
        related_name='saved_reports',
        null=True,
        blank=True,
        help_text='Default store location for this saved report'
    )
    user = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="saved_reports"
    )
    name = models.CharField(max_length=200)
    report_type = models.CharField(max_length=50, choices=ReportType.choices)
    parameters = models.JSONField()
    schedule = models.CharField(
        max_length=20, choices=ScheduleType.choices, default=ScheduleType.MANUAL
    )
    format = models.CharField(
        max_length=10, choices=FormatType.choices, default=FormatType.PDF
    )

    # File management
    last_generated_file = models.FileField(upload_to="reports/", null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)

    # Execution tracking
    last_execution = models.ForeignKey(
        'ReportExecution',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+'  # No reverse relation needed
    )

    # Status tracking
    status = models.CharField(
        max_length=20, choices=ReportStatus.choices, default=ReportStatus.ACTIVE
    )
    last_run = models.DateTimeField(null=True, blank=True)
    next_run = models.DateTimeField(null=True, blank=True)

    # Performance tracking
    generation_time = models.FloatField(null=True, blank=True)  # seconds
    row_count = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Saved Report"
        verbose_name_plural = "Saved Reports"
        indexes = [
            models.Index(fields=["tenant", "user", "report_type"]),
            models.Index(fields=["tenant", "status", "next_run"]),
            models.Index(fields=['tenant', 'store_location', 'report_type'], name='reports_saved_ten_loc_type_idx'),
        ]

    def __str__(self):
        return f"{self.name} ({self.report_type})"

    def save(self, *args, **kwargs):
        """Override save to set next_run based on schedule"""
        if self.schedule != ScheduleType.MANUAL and not self.next_run:
            self.next_run = self._calculate_next_run()
        super().save(*args, **kwargs)

    def _calculate_next_run(self):
        """Calculate next run time based on schedule"""
        now = timezone.now()
        if self.schedule == ScheduleType.DAILY:
            return now + timedelta(days=1)
        elif self.schedule == ScheduleType.WEEKLY:
            return now + timedelta(weeks=1)
        elif self.schedule == ScheduleType.MONTHLY:
            return now + timedelta(days=30)
        return None

    @property
    def is_due(self):
        """Check if report is due for execution"""
        if self.schedule == ScheduleType.MANUAL:
            return False
        return self.next_run and timezone.now() >= self.next_run

    @property
    def file_size_mb(self):
        """Return file size in MB"""
        if self.file_size:
            return round(self.file_size / (1024 * 1024), 2)
        return 0

    def update_after_run(self, generation_time=None, row_count=None, file_path=None):
        """Update report after successful execution"""
        self.last_run = timezone.now()
        if generation_time:
            self.generation_time = generation_time
        if row_count:
            self.row_count = row_count
        if file_path:
            self.last_generated_file = file_path

        # Calculate next run
        if self.schedule != ScheduleType.MANUAL:
            self.next_run = self._calculate_next_run()

        self.save()


class ReportTemplate(SoftDeleteMixin):
    """Pre-configured report templates"""

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='report_templates'
    )
    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.PROTECT,
        related_name='report_templates',
        null=True,
        blank=True,
        help_text='Default store location for this report template'
    )
    name = models.CharField(max_length=200)
    description = models.TextField()
    report_type = models.CharField(max_length=50, choices=ReportType.choices)
    default_parameters = models.JSONField()
    is_system_template = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ["name"]
        verbose_name = "Report Template"
        verbose_name_plural = "Report Templates"
        indexes = [
            models.Index(fields=["tenant", "name"]),
            models.Index(fields=["tenant", "report_type"]),
            models.Index(fields=['tenant', 'store_location', 'report_type'], name='reports_tmpl_ten_loc_type_idx'),
        ]

    def __str__(self):
        return self.name


class ReportExecution(models.Model):
    """Track report execution history"""

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='report_executions'
    )
    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.PROTECT,
        related_name='report_executions',
        null=True,
        blank=True,
        help_text='Store location this execution is for'
    )
    saved_report = models.ForeignKey(
        SavedReport, on_delete=models.CASCADE, related_name="executions",
        null=True, blank=True  # Allow ad-hoc reports without saved_report
    )

    # Task tracking
    task_id = models.CharField(max_length=255, null=True, blank=True, help_text="Celery task ID")

    # Report details (for ad-hoc reports not linked to SavedReport)
    report_type = models.CharField(max_length=50, choices=ReportType.choices, null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    parameters = models.JSONField(null=True, blank=True)

    # Execution tracking
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ("running", "Running"),
            ("completed", "Completed"),
            ("failed", "Failed"),
            ("cancelled", "Cancelled"),
        ],
        default="running",
    )
    error_message = models.TextField(null=True, blank=True)
    execution_time = models.FloatField(null=True, blank=True)
    row_count = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)

    # Report data
    result_data = models.JSONField(null=True, blank=True, help_text="Generated report data")

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "Report Execution"
        verbose_name_plural = "Report Executions"
        indexes = [
            models.Index(fields=['tenant', 'status', 'started_at']),
            models.Index(fields=['tenant', 'saved_report', 'status']),
            models.Index(fields=['tenant', 'started_at']),
            models.Index(fields=['tenant', 'store_location', 'status'], name='reports_exec_ten_loc_stat_idx'),
        ]

    def __str__(self):
        if self.saved_report:
            return f"{self.saved_report.name} - {self.started_at.strftime('%Y-%m-%d %H:%M')}"
        else:
            return f"{self.report_type or 'Ad-hoc'} Report - {self.started_at.strftime('%Y-%m-%d %H:%M')}"

    def mark_completed(self, row_count=None, file_size=None):
        """Mark execution as completed"""
        self.completed_at = timezone.now()
        self.status = "completed"
        if self.started_at:
            self.execution_time = (self.completed_at - self.started_at).total_seconds()
        if row_count:
            self.row_count = row_count
        if file_size:
            self.file_size = file_size
        self.save()

    def mark_failed(self, error_message):
        """Mark execution as failed"""
        self.completed_at = timezone.now()
        self.status = "failed"
        self.error_message = error_message
        self.save()
