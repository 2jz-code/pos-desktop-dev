from rest_framework import serializers
from django.utils import timezone
from datetime import datetime, timedelta
from core_backend.base import BaseModelSerializer
from .models import (
    ReportCache,
    SavedReport,
    ReportTemplate,
    ReportExecution,
    ReportType,
    ScheduleType,
    FormatType,
    ReportStatus,
)


class ReportParameterSerializer(serializers.Serializer):
    """Validate report parameters"""

    start_date = serializers.DateTimeField()
    end_date = serializers.DateTimeField()

    def validate(self, data):
        """Validate date range parameters"""
        start_date = data.get("start_date")
        end_date = data.get("end_date")

        if start_date >= end_date:
            raise serializers.ValidationError("Start date must be before end date")

        # Limit date range to prevent expensive queries
        max_days = 365
        if (end_date - start_date).days > max_days:
            raise serializers.ValidationError(
                f"Date range cannot exceed {max_days} days"
            )

        # Prevent future dates
        if start_date > timezone.now():
            raise serializers.ValidationError("Start date cannot be in the future")

        return data


class ProductReportParameterSerializer(ReportParameterSerializer):
    """Extended parameters for product reports"""

    category_id = serializers.IntegerField(required=False, allow_null=True)
    limit = serializers.IntegerField(default=10, min_value=1, max_value=100)
    sort_by = serializers.ChoiceField(
        choices=["revenue", "quantity", "margin"], default="revenue"
    )


class ReportCacheSerializer(BaseModelSerializer):
    """Serializer for report cache entries"""

    is_expired = serializers.ReadOnlyField()

    class Meta:
        model = ReportCache
        fields = [
            "id",
            "report_type",
            "parameters_hash",
            "parameters",
            "generated_at",
            "expires_at",
            "is_expired",
        ]
        read_only_fields = ["id", "generated_at", "is_expired"]
        # ReportCache model typically has no FK relationships to optimize
        select_related_fields = []
        prefetch_related_fields = []


class SavedReportSerializer(BaseModelSerializer):
    """Serializer for saved reports"""

    file_size_mb = serializers.ReadOnlyField()
    is_due = serializers.ReadOnlyField()

    class Meta:
        model = SavedReport
        fields = [
            "id",
            "name",
            "report_type",
            "parameters",
            "schedule",
            "format",
            "status",
            "last_run",
            "next_run",
            "file_size",
            "file_size_mb",
            "generation_time",
            "row_count",
            "is_due",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "last_run",
            "next_run",
            "file_size",
            "file_size_mb",
            "generation_time",
            "row_count",
            "is_due",
            "created_at",
            "updated_at",
        ]
        # Optimize user relationship for reports
        select_related_fields = ["user"]
        prefetch_related_fields = []

    def validate_parameters(self, value):
        """Validate report parameters JSON"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Parameters must be a valid JSON object")

        # Check required fields based on report type
        required_fields = ["start_date", "end_date"]
        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(
                    f"Missing required parameter: {field}"
                )

        # Validate date format
        try:
            datetime.fromisoformat(value["start_date"].replace("Z", "+00:00"))
            datetime.fromisoformat(value["end_date"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            raise serializers.ValidationError("Invalid date format in parameters")

        return value

    def validate_schedule(self, value):
        """Validate schedule type"""
        if value not in [choice[0] for choice in ScheduleType.choices]:
            raise serializers.ValidationError("Invalid schedule type")
        return value


class SavedReportCreateSerializer(SavedReportSerializer):
    """Serializer for creating saved reports"""

    class Meta(SavedReportSerializer.Meta):
        fields = ["name", "report_type", "parameters", "schedule", "format", "status"]


class ReportTemplateSerializer(BaseModelSerializer):
    """Serializer for report templates"""

    class Meta:
        model = ReportTemplate
        fields = [
            "id",
            "name",
            "description",
            "report_type",
            "default_parameters",
            "is_system_template",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]
        # Optimize created_by relationship
        select_related_fields = ["created_by"]
        prefetch_related_fields = []

    def validate_default_parameters(self, value):
        """Validate default parameters JSON"""
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "Default parameters must be a valid JSON object"
            )

        # Basic validation for required fields
        if "start_date" not in value or "end_date" not in value:
            raise serializers.ValidationError(
                "Default parameters must include start_date and end_date"
            )

        return value


class ReportExecutionSerializer(BaseModelSerializer):
    """Serializer for report executions"""

    saved_report_name = serializers.CharField(
        source="saved_report.name", read_only=True
    )
    execution_time_formatted = serializers.SerializerMethodField()
    file_size_mb = serializers.SerializerMethodField()

    class Meta:
        model = ReportExecution
        fields = [
            "id",
            "saved_report",
            "saved_report_name",
            "started_at",
            "completed_at",
            "status",
            "error_message",
            "execution_time",
            "execution_time_formatted",
            "row_count",
            "file_size",
            "file_size_mb",
        ]
        read_only_fields = [
            "id",
            "started_at",
            "completed_at",
            "execution_time",
            "row_count",
            "file_size",
        ]
        # Optimize saved_report relationship with its user
        select_related_fields = ["saved_report__user"]
        prefetch_related_fields = []

    def get_execution_time_formatted(self, obj):
        """Format execution time for display"""
        if obj.execution_time:
            return f"{obj.execution_time:.2f}s"
        return "N/A"

    def get_file_size_mb(self, obj):
        """Format file size in MB"""
        if obj.file_size:
            return round(obj.file_size / (1024 * 1024), 2)
        return 0


class ReportDataSerializer(serializers.Serializer):
    """Serializer for report data output"""

    report_type = serializers.CharField()
    parameters = serializers.JSONField()
    generated_at = serializers.DateTimeField()
    data = serializers.JSONField()

    def validate_data(self, value):
        """Validate report data structure"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Report data must be a valid JSON object")
        return value


class SummaryReportDataSerializer(ReportDataSerializer):
    """Specific serializer for summary report data"""

    def validate_data(self, value):
        """Validate summary report data structure"""
        value = super().validate_data(value)

        # Validate required fields for summary report
        required_fields = [
            "total_sales",
            "total_transactions",
            "average_ticket",
            "sales_trend",
            "payment_distribution",
            "hourly_performance",
        ]

        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"Missing required field: {field}")

        return value


class SalesReportDataSerializer(ReportDataSerializer):
    """Specific serializer for sales report data"""

    def validate_data(self, value):
        """Validate sales report data structure"""
        value = super().validate_data(value)

        # Validate required fields for sales report
        required_fields = [
            "total_revenue",
            "net_revenue", 
            "revenue_breakdown",
            "total_orders",
            "average_order_value",
            "sales_by_period",
            "growth_metrics",
        ]

        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"Missing required field: {field}")

        return value


class ProductsReportDataSerializer(ReportDataSerializer):
    """Specific serializer for products report data"""

    def validate_data(self, value):
        """Validate products report data structure"""
        value = super().validate_data(value)

        # Validate required fields for products report
        required_fields = ["top_products", "category_performance", "product_trends"]

        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"Missing required field: {field}")

        return value


class PaymentsReportDataSerializer(ReportDataSerializer):
    """Specific serializer for payments report data"""

    def validate_data(self, value):
        """Validate payments report data structure"""
        value = super().validate_data(value)

        # Validate required fields for payments report
        required_fields = ["payment_methods", "transaction_volume", "processing_fees"]

        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"Missing required field: {field}")

        return value


class OperationsReportDataSerializer(ReportDataSerializer):
    """Specific serializer for operations report data"""

    def validate_data(self, value):
        """Validate operations report data structure"""
        value = super().validate_data(value)

        # Validate required fields for operations report
        required_fields = [
            "hourly_patterns",
            "order_volume",
            "peak_hours",
            "staff_performance",
        ]

        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"Missing required field: {field}")

        return value


class ReportExportRequestSerializer(serializers.Serializer):
    """Serializer for report export requests"""

    report_type = serializers.ChoiceField(choices=ReportType.choices)
    parameters = serializers.JSONField()
    format = serializers.ChoiceField(choices=FormatType.choices)

    def validate_parameters(self, value):
        """Validate export parameters"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Parameters must be a valid JSON object")

        # Use the appropriate parameter serializer
        param_serializer = ReportParameterSerializer(data=value)
        if not param_serializer.is_valid():
            raise serializers.ValidationError(param_serializer.errors)

        return value


class BulkExportConfigSerializer(serializers.Serializer):
    """Serializer for individual report configuration in bulk export"""

    type = serializers.ChoiceField(choices=ReportType.choices)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    filters = serializers.JSONField(default=dict, required=False)

    def validate(self, data):
        """Validate the report configuration"""
        start_date = data.get("start_date")
        end_date = data.get("end_date")

        if start_date >= end_date:
            raise serializers.ValidationError("Start date must be before end date")

        # Limit date range to prevent expensive queries
        max_days = 365
        if (end_date - start_date).days > max_days:
            raise serializers.ValidationError(
                f"Date range cannot exceed {max_days} days"
            )

        return data


class BulkExportRequestSerializer(serializers.Serializer):
    """Serializer for bulk export requests"""

    report_configs = BulkExportConfigSerializer(many=True, min_length=1, max_length=10)
    export_format = serializers.ChoiceField(choices=FormatType.choices, default="xlsx")
    compress = serializers.BooleanField(default=True)
    priority = serializers.ChoiceField(
        choices=[(1, "Low"), (2, "Normal"), (3, "High"), (4, "Urgent")], default=2
    )

    def validate_report_configs(self, value):
        """Validate report configurations"""
        if len(value) > 10:
            raise serializers.ValidationError(
                "Cannot export more than 10 reports at once"
            )

        # Check for duplicate report types with same date ranges
        seen_configs = set()
        for config in value:
            config_key = (config["type"], config["start_date"], config["end_date"])
            if config_key in seen_configs:
                raise serializers.ValidationError(
                    "Duplicate report configurations detected"
                )
            seen_configs.add(config_key)

        return value


class BulkExportStatusSerializer(serializers.Serializer):
    """Serializer for bulk export status responses"""

    operation_id = serializers.CharField()
    status = serializers.ChoiceField(
        choices=[
            ("queued", "Queued"),
            ("processing", "Processing"),
            ("completed", "Completed"),
            ("failed", "Failed"),
            ("not_found", "Not Found"),
        ]
    )
    progress = serializers.FloatField(default=0.0)
    created_at = serializers.DateTimeField(required=False)
    estimated_completion = serializers.IntegerField(required=False)
    file_path = serializers.CharField(required=False)
    file_size = serializers.IntegerField(required=False)
    reports_generated = serializers.IntegerField(default=0)
    error = serializers.CharField(required=False)


class ExportQueueStatusSerializer(serializers.Serializer):
    """Serializer for export queue status"""

    total_operations = serializers.IntegerField()
    by_priority = serializers.JSONField()


class CustomTemplateSerializer(serializers.Serializer):
    """Serializer for custom export templates"""

    template_name = serializers.CharField(max_length=100)
    branding = serializers.JSONField(default=dict, required=False)
    formatting = serializers.JSONField(default=dict, required=False)
    layout = serializers.JSONField(default=dict, required=False)

    def validate_template_name(self, value):
        """Validate template name"""
        if len(value.strip()) < 3:
            raise serializers.ValidationError(
                "Template name must be at least 3 characters long"
            )
        return value.strip()

    def validate_branding(self, value):
        """Validate branding configuration"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Branding must be a JSON object")

        allowed_keys = ["logo_url", "company_name", "colors", "fonts"]
        for key in value.keys():
            if key not in allowed_keys:
                raise serializers.ValidationError(
                    f"Invalid branding key: {key}. Allowed keys: {allowed_keys}"
                )

        return value
