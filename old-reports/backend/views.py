# reports/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import SavedReport, ReportType
from .serializers import (
    SavedReportSerializer,
    SalesReportSerializer,
    ProductReportSerializer,
    PaymentReportSerializer,
)
from .utils import (
    generate_sales_report,
    generate_product_report,
    generate_payment_report,
    generate_operational_insights,
    serialize_report_parameters,
)
from products.models import Category
import datetime
import pytz


class SavedReportListView(APIView):
    """List all saved reports or create a new one"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        reports = SavedReport.objects.all()
        serializer = SavedReportSerializer(reports, many=True)
        return Response(serializer.data)


class SavedReportDetailView(APIView):
    """Retrieve, update or delete a saved report"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            report = SavedReport.objects.get(pk=pk)
            serializer = SavedReportSerializer(report)
            return Response(serializer.data)
        except SavedReport.DoesNotExist:
            return Response(
                {"error": "Report not found"}, status=status.HTTP_404_NOT_FOUND
            )

    def delete(self, request, pk):
        try:
            report = SavedReport.objects.get(pk=pk)
            report.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except SavedReport.DoesNotExist:
            return Response(
                {"error": "Report not found"}, status=status.HTTP_404_NOT_FOUND
            )


class SalesReportView(APIView):
    """Generate sales reports"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SalesReportSerializer(data=request.data)
        if serializer.is_valid():
            # Extract parameters from the validated data
            start_date = serializer.validated_data["start_date"]
            end_date = serializer.validated_data["end_date"]
            group_by = serializer.validated_data["group_by"]
            include_tax = serializer.validated_data["include_tax"]
            include_refunds = serializer.validated_data["include_refunds"]
            save_report = serializer.validated_data["save_report"]

            # Generate the report
            report_data = generate_sales_report(
                start_date, end_date, group_by, include_tax, include_refunds
            )

            # Save the report if requested
            if save_report:
                report_name = serializer.validated_data.get(
                    "report_name", "Sales Report"
                )
                if not report_name:
                    report_name = f"Sales Report {start_date} to {end_date}"

                # Serialize parameters before saving
                serialized_params = serialize_report_parameters(
                    serializer.validated_data
                )

                SavedReport.objects.create(
                    name=report_name,
                    report_type=(
                        ReportType.DAILY_SALES
                        if group_by == "day"
                        else (
                            ReportType.WEEKLY_SALES
                            if group_by == "week"
                            else ReportType.MONTHLY_SALES
                        )
                    ),
                    date_range_start=start_date,
                    date_range_end=end_date,
                    parameters=serialized_params,  # Use serialized parameters
                    result_data=report_data,
                )

            return Response(report_data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductReportView(APIView):
    """Generate product performance reports"""

    permission_classes = [IsAuthenticated]

    def get_categories(self, request):
        """Helper method to return all product categories"""
        categories = Category.objects.all().values_list("name", flat=True)
        return Response(list(categories))

    def get(self, request):
        # If 'categories' query param is present, return list of categories
        if request.query_params.get("categories") == "true":
            return self.get_categories(request)

        return Response(
            {"error": "Use POST method to generate product reports"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def post(self, request):
        serializer = ProductReportSerializer(data=request.data)
        if serializer.is_valid():
            # Extract parameters from the validated data
            start_date = serializer.validated_data["start_date"]
            end_date = serializer.validated_data["end_date"]
            category = serializer.validated_data.get("category")
            limit = serializer.validated_data["limit"]
            sort_by = serializer.validated_data["sort_by"]
            save_report = serializer.validated_data["save_report"]

            # Generate the report - pass date_field parameter
            report_data = generate_product_report(
                start_date, end_date, category, limit, sort_by, date_field="updated_at"
            )

            # Save the report if requested
            if save_report:
                report_name = serializer.validated_data.get(
                    "report_name", "Product Report"
                )
                if not report_name:
                    report_name = f"Product Report {start_date} to {end_date}"

                # Serialize parameters before saving
                serialized_params = serialize_report_parameters(
                    serializer.validated_data
                )

                SavedReport.objects.create(
                    name=report_name,
                    report_type=ReportType.PRODUCT_PERFORMANCE,
                    date_range_start=start_date,
                    date_range_end=end_date,
                    parameters=serialized_params,  # Use serialized parameters
                    result_data=report_data,
                )

            return Response(report_data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PaymentReportView(APIView):
    """Generate payment analytics reports"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PaymentReportSerializer(data=request.data)
        if serializer.is_valid():
            # Extract parameters from the validated data
            start_date = serializer.validated_data["start_date"]
            end_date = serializer.validated_data["end_date"]
            group_by = serializer.validated_data["group_by"]
            save_report = serializer.validated_data["save_report"]

            # Generate the report - pass date_field parameter
            report_data = generate_payment_report(
                start_date, end_date, group_by, date_field="updated_at"
            )
            # Save the report if requested
            if save_report:
                report_name = serializer.validated_data.get(
                    "report_name", "Payment Report"
                )
                if not report_name:
                    report_name = f"Payment Report {start_date} to {end_date}"

                # Serialize parameters before saving
                serialized_params = serialize_report_parameters(
                    serializer.validated_data
                )

                SavedReport.objects.create(
                    name=report_name,
                    report_type=ReportType.PAYMENT_ANALYTICS,
                    date_range_start=start_date,
                    date_range_end=end_date,
                    parameters=serialized_params,  # Use serialized parameters
                    result_data=report_data,
                )

            return Response(report_data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OperationalInsightsView(APIView):
    """Generate operational insights reports"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            start_date_str = request.data.get("start_date")
            end_date_str = request.data.get("end_date")
            save_report = request.data.get("save_report", False)
            report_name = request.data.get("report_name", "")

            if not start_date_str or not end_date_str:
                return Response(
                    {"error": "start_date and end_date are required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # --- FIX: Convert date strings to date objects ---
            start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
            end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
            # ----------------------------------------------------

            report_data = generate_operational_insights(
                start_date, end_date, date_field="updated_at"
            )

            if save_report:
                if not report_name:
                    report_name = f"Operational Insights {start_date} to {end_date}"

                serialized_params = serialize_report_parameters(request.data)

                SavedReport.objects.create(
                    name=report_name,
                    report_type=ReportType.OPERATIONAL_INSIGHTS,
                    date_range_start=start_date,
                    date_range_end=end_date,
                    parameters=serialized_params,
                    result_data=report_data,
                )

            return Response(report_data)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DashboardSummaryView(APIView):
    """Generate a summary for the dashboard"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            # 1. Set the target timezone to 'America/Chicago'
            chicago_tz = pytz.timezone("America/Chicago")

            # 2. Get the current time in the specified timezone
            now_in_chicago = timezone.now().astimezone(chicago_tz)

            # 3. All date calculations are now relative to the Chicago timezone
            today = now_in_chicago.date()
            yesterday = today - datetime.timedelta(days=1)

            # Get first day of the current month and year
            first_day_of_month = today.replace(day=1)
            first_day_of_year = today.replace(month=1, day=1)

            # A more robust way to get the previous month's date boundaries
            last_day_of_previous_month = first_day_of_month - datetime.timedelta(days=1)
            first_day_of_previous_month = last_day_of_previous_month.replace(day=1)

            # 4. Helper to create timezone-aware datetime ranges
            def make_aware_range(start_date, end_date, tz):
                """Localizes naive datetimes to the target timezone."""
                start_datetime = tz.localize(
                    datetime.datetime.combine(start_date, datetime.time.min)
                )
                end_datetime = tz.localize(
                    datetime.datetime.combine(end_date, datetime.time.max)
                )
                return (start_datetime, end_datetime)

            # 5. Create timezone-aware date ranges for all periods
            today_range = make_aware_range(today, today, chicago_tz)
            yesterday_range = make_aware_range(yesterday, yesterday, chicago_tz)
            this_month_range = make_aware_range(first_day_of_month, today, chicago_tz)
            last_month_range = make_aware_range(
                first_day_of_previous_month, last_day_of_previous_month, chicago_tz
            )
            this_year_range = make_aware_range(first_day_of_year, today, chicago_tz)

            # Get sales data for different periods
            today_sales = generate_sales_report(
                today_range[0], today_range[1], date_field="updated_at"
            )
            yesterday_sales = generate_sales_report(
                yesterday_range[0], yesterday_range[1], date_field="updated_at"
            )
            this_month_sales = generate_sales_report(
                this_month_range[0], this_month_range[1], date_field="updated_at"
            )
            last_month_sales = generate_sales_report(
                last_month_range[0], last_month_range[1], date_field="updated_at"
            )
            this_year_sales = generate_sales_report(
                this_year_range[0], this_year_range[1], date_field="updated_at"
            )

            # Get product data for this month - specify date_field
            product_data = generate_product_report(
                this_month_range[0],
                this_month_range[1],
                limit=5,
                date_field="updated_at",
            )

            # Get payment data for this month - specify date_field
            payment_data = generate_payment_report(
                this_month_range[0], this_month_range[1], date_field="updated_at"
            )

            # Calculate growth rates - handle case where there's no data
            if yesterday_sales["summary"]["total_revenue"] > 0:
                daily_growth = (
                    (
                        today_sales["summary"]["total_revenue"]
                        - yesterday_sales["summary"]["total_revenue"]
                    )
                    / yesterday_sales["summary"]["total_revenue"]
                ) * 100
            else:
                daily_growth = 100 if today_sales["summary"]["total_revenue"] > 0 else 0

            if last_month_sales["summary"]["total_revenue"] > 0:
                monthly_growth = (
                    (
                        this_month_sales["summary"]["total_revenue"]
                        - last_month_sales["summary"]["total_revenue"]
                    )
                    / last_month_sales["summary"]["total_revenue"]
                ) * 100
            else:
                monthly_growth = (
                    100 if this_month_sales["summary"]["total_revenue"] > 0 else 0
                )

            # Ensure we have product data, or provide empty defaults
            products = product_data.get("products", [])

            # Ensure we have payment method data, or provide empty defaults
            payment_methods = payment_data.get("data", [])

            # Compile dashboard summary
            summary = {
                "today": {
                    "date": today.strftime("%Y-%m-%d"),
                    "sales": today_sales["summary"]["total_revenue"],
                    "orders": today_sales["summary"]["total_orders"],
                    "growth": round(daily_growth, 2),
                },
                "this_month": {
                    "month": today.strftime("%B %Y"),
                    "sales": this_month_sales["summary"]["total_revenue"],
                    "orders": this_month_sales["summary"]["total_orders"],
                    "growth": round(monthly_growth, 2),
                },
                "this_year": {
                    "year": today.strftime("%Y"),
                    "sales": this_year_sales["summary"]["total_revenue"],
                    "orders": this_year_sales["summary"]["total_orders"],
                },
                "top_products": products[:5],
                "payment_methods": payment_methods,
            }

            return Response(summary)

        except Exception as e:
            # It's good practice to log the exception for debugging
            # logger.error(f"Error in DashboardSummaryView: {e}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
