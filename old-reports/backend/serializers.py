# reports/serializers.py
from rest_framework import serializers
from .models import SavedReport, ReportType

class SavedReportSerializer(serializers.ModelSerializer):
    report_type_display = serializers.CharField(source='get_report_type_display', read_only=True)
    
    class Meta:
        model = SavedReport
        fields = '__all__'

class SalesReportSerializer(serializers.Serializer):
    """Serializer for sales report parameters"""
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)
    group_by = serializers.ChoiceField(choices=['day', 'week', 'month'], default='day')
    include_tax = serializers.BooleanField(default=True)
    include_refunds = serializers.BooleanField(default=True)
    save_report = serializers.BooleanField(default=False)
    report_name = serializers.CharField(required=False, allow_blank=True)

class ProductReportSerializer(serializers.Serializer):
    """Serializer for product performance report parameters"""
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)
    category = serializers.CharField(required=False, allow_blank=True)
    limit = serializers.IntegerField(required=False, default=10)
    sort_by = serializers.ChoiceField(choices=['quantity', 'revenue'], default='revenue')
    save_report = serializers.BooleanField(default=False)
    report_name = serializers.CharField(required=False, allow_blank=True)

class PaymentReportSerializer(serializers.Serializer):
    """Serializer for payment analytics report parameters"""
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)
    group_by = serializers.ChoiceField(choices=['payment_method', 'day', 'week', 'month'], default='payment_method')
    save_report = serializers.BooleanField(default=False)
    report_name = serializers.CharField(required=False, allow_blank=True)