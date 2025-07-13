# reports/models.py
from django.db import models
from django.utils import timezone
from .utils import DateTimeEncoder

class ReportType(models.TextChoices):
    DAILY_SALES = 'daily_sales', 'Daily Sales'
    WEEKLY_SALES = 'weekly_sales', 'Weekly Sales'
    MONTHLY_SALES = 'monthly_sales', 'Monthly Sales'
    PRODUCT_PERFORMANCE = 'product_performance', 'Product Performance'
    PAYMENT_ANALYTICS = 'payment_analytics', 'Payment Analytics'
    OPERATIONAL_INSIGHTS = 'operational_insights', 'Operational Insights'
    CUSTOM = 'custom', 'Custom Report'

class SavedReport(models.Model):
    """Model for saved/generated reports"""
    name = models.CharField(max_length=255)
    report_type = models.CharField(
        max_length=50,
        choices=ReportType.choices,
        default=ReportType.DAILY_SALES
    )
    date_created = models.DateTimeField(default=timezone.now)
    date_range_start = models.DateTimeField(null=True, blank=True)
    date_range_end = models.DateTimeField(null=True, blank=True)
    parameters = models.JSONField(default=dict, blank=True, encoder=DateTimeEncoder)  # Use custom encoder
    result_data = models.JSONField(default=dict, encoder=DateTimeEncoder)  # Use custom encoder
    
    class Meta:
        ordering = ['-date_created']
    
    def __str__(self):
        return f"{self.name} ({self.get_report_type_display()}) - {self.date_created.strftime('%Y-%m-%d')}"