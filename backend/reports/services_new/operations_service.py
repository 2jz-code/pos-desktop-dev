import time
import logging
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from django.db.models import (
    Sum,
    Count,
    Avg,
    F,
    Max,
    Min,
)
from django.db.models.functions import (
    TruncDate,
    Extract,
)
from django.utils import timezone
from django.conf import settings
import pytz

from orders.models import Order, OrderItem
from .base import BaseReportService

logger = logging.getLogger(__name__)


class OperationsReportService(BaseReportService):
    """Operations report service for operational metrics and staff performance"""

    CACHE_TTL_HOURS = 1  # Operations data changes frequently

    @staticmethod
    def generate_operations_report(
        tenant,
        start_date: datetime,
        end_date: datetime,
        location_id: Optional[int] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Generate comprehensive operations report"""

        cache_key = OperationsReportService._generate_cache_key(
            "operations", {"start_date": start_date, "end_date": end_date, "location_id": location_id}
        )

        if use_cache:
            cached_data = OperationsReportService._get_cached_report(cache_key, tenant)
            if cached_data:
                logger.info(f"Operations report served from cache: {cache_key[:8]}...")
                return cached_data

        logger.info(f"Generating operations report for {start_date} to {end_date}" + (f" at location {location_id}" if location_id else ""))
        start_time = time.time()

        try:
            # Generate the operations data
            operations_data = OperationsReportService._generate_operations_data(
                tenant, start_date, end_date, location_id
            )

            # Cache the result
            generation_time = time.time() - start_time
            OperationsReportService._cache_report(
                cache_key, operations_data, tenant, report_type="operations", ttl_hours=OperationsReportService.CACHE_TTL_HOURS
            )

            logger.info(f"Operations report generated in {generation_time:.2f}s")
            return operations_data

        except Exception as e:
            logger.error(f"Failed to generate operations report: {e}")
            raise

    @staticmethod
    def _generate_operations_data(tenant, start_date: datetime, end_date: datetime, location_id: Optional[int] = None) -> Dict[str, Any]:
        """Generate the core operations report data"""

        # Base queryset
        filters = {
            "tenant": tenant,
            "status": Order.OrderStatus.COMPLETED,
            "created_at__range": (start_date, end_date),
            "subtotal__gt": 0,  # Exclude orders with $0.00 subtotals
        }

        if location_id is not None:
            filters["store_location_id"] = location_id

        orders = Order.objects.filter(**filters).select_related("cashier", "store_location")

        # Hourly patterns
        hourly_patterns = (
            orders.annotate(hour=Extract("created_at", "hour"))
            .values("hour")
            .annotate(
                orders=Count("id"),
                revenue=Sum("grand_total"),
                avg_order_value=Avg("grand_total"),
            )
            .order_by("hour")
        )

        operations_data = {
            "hourly_patterns": [
                {
                    "hour": f"{item['hour']:02d}:00",
                    "orders": item["orders"],
                    "revenue": float(item["revenue"] or 0),
                    "avg_order_value": float(item["avg_order_value"] or 0),
                }
                for item in hourly_patterns
            ]
        }

        # Peak hours (top 5 by order volume)
        peak_hours = list(hourly_patterns.order_by("-orders")[:5])
        operations_data["peak_hours"] = [
            {
                "hour": f"{item['hour']:02d}:00",
                "orders": item["orders"],
                "revenue": float(item["revenue"] or 0),
            }
            for item in peak_hours
        ]

        # Daily order volume
        daily_volume = (
            orders.annotate(date=OperationsReportService._trunc_date_local("created_at"))
            .values("date")
            .annotate(orders=Count("id"), revenue=Sum("grand_total"))
            .order_by("date")
        )

        operations_data["daily_volume"] = [
            {
                "date": item["date"].strftime("%Y-%m-%d"),
                "orders": item["orders"],
                "revenue": float(item["revenue"] or 0),
            }
            for item in daily_volume
        ]

        # Staff performance (if cashier data available)
        staff_performance = (
            orders.filter(cashier__isnull=False)
            .values("cashier__username", "cashier__first_name", "cashier__last_name")
            .annotate(
                orders_processed=Count("id"),
                total_revenue=Sum("grand_total"),
                avg_order_value=Avg("grand_total"),
            )
            .order_by("-orders_processed")
        )

        operations_data["staff_performance"] = [
            {
                "cashier": f"{item['cashier__first_name'] or ''} {item['cashier__last_name'] or ''}".strip()
                or item["cashier__username"],
                "orders_processed": item["orders_processed"],
                "revenue": float(item["total_revenue"] or 0),
                "avg_order_value": float(item["avg_order_value"] or 0),
            }
            for item in staff_performance
        ]

        # Order volume summary
        total_orders = orders.count()
        total_days = (end_date - start_date).days + 1

        operations_data["summary"] = {
            "total_orders": total_orders,
            "avg_orders_per_day": (
                round(total_orders / total_days, 2) if total_days > 0 else 0
            ),
            "peak_day": None,
            "slowest_day": None,
        }

        # Find peak and slowest days
        if daily_volume:
            peak_day = max(daily_volume, key=lambda x: x["orders"])
            slowest_day = min(daily_volume, key=lambda x: x["orders"])

            operations_data["summary"]["peak_day"] = {
                "date": peak_day["date"],
                "orders": peak_day["orders"],
            }
            operations_data["summary"]["slowest_day"] = {
                "date": slowest_day["date"],
                "orders": slowest_day["orders"],
            }

        # Add metadata
        operations_data["generated_at"] = timezone.now().isoformat()
        operations_data["date_range"] = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }

        return operations_data

    @staticmethod
    def _get_local_timezone():
        """Get the configured local timezone"""
        return pytz.timezone(settings.TIME_ZONE)

    @staticmethod
    def _trunc_date_local(field_name):
        """Truncate date field to local timezone instead of UTC"""
        from django.db.models import DateTimeField
        from django.db.models.functions import Cast

        # Convert to local timezone, then truncate to date
        local_tz = OperationsReportService._get_local_timezone()
        return TruncDate(Cast(field_name, DateTimeField()), tzinfo=local_tz)

    # Export Methods
    @staticmethod
    def export_operations_to_csv(report_data: Dict[str, Any]) -> bytes:
        """Export operations report to CSV format"""
        import io
        import csv
        from datetime import datetime

        output = io.StringIO()
        writer = csv.writer(output)
        
        OperationsReportService._export_operations_to_csv(writer, report_data)
        
        csv_content = output.getvalue()
        output.close()
        
        return csv_content.encode('utf-8')

    @staticmethod
    def _export_operations_to_csv(writer, report_data: Dict[str, Any]):
        """Export comprehensive operations report to CSV"""
        # Header
        writer.writerow(["Operations Report"])
        writer.writerow(["Generated:", report_data.get("generated_at", "N/A")])
        
        # Extract and format date range
        date_range = report_data.get("date_range", {})
        start_str = date_range.get("start", "N/A")
        end_str = date_range.get("end", "N/A")
        
        # Clean up date strings (remove timezone info for cleaner display)
        if start_str != "N/A" and end_str != "N/A":
            try:
                start_date = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                end_date = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                start_str = start_date.strftime("%B %d, %Y")
                end_str = end_date.strftime("%B %d, %Y")
            except:
                pass
        
        writer.writerow(["Date Range:", f"{start_str} to {end_str}"])
        writer.writerow([])  # Empty row

        # --- EXECUTIVE SUMMARY ---
        summary = report_data.get("summary", {})
        writer.writerow(["--- EXECUTIVE SUMMARY ---"])
        writer.writerow(["Total Orders Processed:", summary.get("total_orders", 0)])
        writer.writerow(["Average Orders per Day:", summary.get("avg_orders_per_day", 0)])
        
        # Peak day information
        peak_day = summary.get("peak_day")
        if peak_day:
            peak_date = peak_day.get("date", "N/A")
            if peak_date != "N/A":
                try:
                    peak_date_obj = datetime.fromisoformat(peak_date.replace("Z", "+00:00"))
                    peak_date = peak_date_obj.strftime("%A, %B %d, %Y")
                except:
                    pass
            writer.writerow(["Peak Day:", f"{peak_date} ({peak_day.get('orders', 0)} orders)"])
        
        # Slowest day information
        slowest_day = summary.get("slowest_day")
        if slowest_day:
            slowest_date = slowest_day.get("date", "N/A")
            if slowest_date != "N/A":
                try:
                    slowest_date_obj = datetime.fromisoformat(slowest_date.replace("Z", "+00:00"))
                    slowest_date = slowest_date_obj.strftime("%A, %B %d, %Y")
                except:
                    pass
            writer.writerow(["Slowest Day:", f"{slowest_date} ({slowest_day.get('orders', 0)} orders)"])
        
        # Staff count
        staff_performance = report_data.get("staff_performance", [])
        writer.writerow(["Total Active Staff:", len(staff_performance)])
        
        writer.writerow([])  # Empty row

        # --- DAILY OPERATIONS ANALYSIS ---
        daily_volume = report_data.get("daily_volume", [])
        writer.writerow(["--- DAILY OPERATIONS ANALYSIS ---"])
        writer.writerow([
            "Date", "Day of Week", "Orders Processed", "Revenue Generated", "Average Order Value"
        ])
        
        for daily in daily_volume:
            date_str = daily.get("date", "N/A")
            day_of_week = "N/A"
            
            # Calculate day of week and format date
            try:
                date_obj = datetime.fromisoformat(date_str)
                day_of_week = date_obj.strftime("%A")
                date_str = date_obj.strftime("%B %d, %Y")
            except:
                pass
            
            orders = daily.get("orders", 0)
            revenue = daily.get("revenue", 0)
            avg_order_value = revenue / orders if orders > 0 else 0
            
            writer.writerow([
                date_str,
                day_of_week,
                orders,
                f"${revenue:,.2f}",
                f"${avg_order_value:.2f}"
            ])
        
        writer.writerow([])  # Empty row

        # --- HOURLY PERFORMANCE PATTERNS ---
        hourly_patterns = report_data.get("hourly_patterns", [])
        writer.writerow(["--- HOURLY PERFORMANCE PATTERNS ---"])
        writer.writerow([
            "Hour", "Orders Processed", "Revenue Generated", "Average Order Value", "% of Daily Volume"
        ])
        
        total_daily_orders = summary.get("total_orders", 1)  # Avoid division by zero
        
        for hourly in hourly_patterns:
            hour = hourly.get("hour", "N/A")
            orders = hourly.get("orders", 0)
            revenue = hourly.get("revenue", 0)
            avg_order_value = hourly.get("avg_order_value", 0)
            percentage = (orders / total_daily_orders * 100) if total_daily_orders > 0 else 0
            
            writer.writerow([
                hour,
                orders,
                f"${revenue:,.2f}",
                f"${avg_order_value:.2f}",
                f"{percentage:.1f}%"
            ])
        
        writer.writerow([])  # Empty row

        # --- PEAK PERFORMANCE ANALYSIS ---
        peak_hours = report_data.get("peak_hours", [])
        writer.writerow(["--- PEAK PERFORMANCE ANALYSIS ---"])
        writer.writerow([
            "Rank", "Hour", "Orders Processed", "Revenue Generated", "% of Daily Orders"
        ])
        
        for i, peak in enumerate(peak_hours, 1):
            hour = peak.get("hour", "N/A")
            orders = peak.get("orders", 0)
            revenue = peak.get("revenue", 0)
            percentage = (orders / total_daily_orders * 100) if total_daily_orders > 0 else 0
            
            writer.writerow([
                i,
                hour,
                orders,
                f"${revenue:,.2f}",
                f"{percentage:.1f}%"
            ])
        
        writer.writerow([])  # Empty row

        # --- STAFF PERFORMANCE METRICS ---
        writer.writerow(["--- STAFF PERFORMANCE METRICS ---"])
        writer.writerow([
            "Rank", "Cashier Name", "Orders Processed", "Total Revenue", 
            "Average Order Value", "% Share of Total Orders"
        ])
        
        for i, staff in enumerate(staff_performance, 1):
            cashier = staff.get("cashier", "N/A")
            orders_processed = staff.get("orders_processed", 0)
            revenue = staff.get("revenue", 0)
            avg_order_value = staff.get("avg_order_value", 0)
            percentage_share = (orders_processed / total_daily_orders * 100) if total_daily_orders > 0 else 0
            
            writer.writerow([
                i,
                cashier,
                orders_processed,
                f"${revenue:,.2f}",
                f"${avg_order_value:.2f}",
                f"{percentage_share:.1f}%"
            ])
        
        writer.writerow([])  # Empty row

        # --- OPERATIONAL INSIGHTS ---
        writer.writerow(["--- OPERATIONAL INSIGHTS ---"])
        
        # Peak vs Off-Peak analysis
        if peak_hours and len(peak_hours) >= 3:
            top_3_peak_orders = sum(peak.get("orders", 0) for peak in peak_hours[:3])
            peak_percentage = (top_3_peak_orders / total_daily_orders * 100) if total_daily_orders > 0 else 0
            writer.writerow(["Top 3 Peak Hours Handle:", f"{peak_percentage:.1f}% of all orders"])
        
        # Staff productivity insights
        if staff_performance:
            top_performer = staff_performance[0]
            top_performer_percentage = (top_performer.get("orders_processed", 0) / total_daily_orders * 100) if total_daily_orders > 0 else 0
            writer.writerow(["Top Performer Handles:", f"{top_performer_percentage:.1f}% of all orders"])
            
            # Average orders per staff member
            avg_orders_per_staff = total_daily_orders / len(staff_performance) if len(staff_performance) > 0 else 0
            writer.writerow(["Average Orders per Staff Member:", f"{avg_orders_per_staff:.1f}"])
        
        # Daily volume insights
        if daily_volume and len(daily_volume) > 1:
            daily_orders = [day.get("orders", 0) for day in daily_volume]
            max_daily = max(daily_orders)
            min_daily = min(daily_orders)
            avg_daily = sum(daily_orders) / len(daily_orders)
            
            writer.writerow(["Daily Volume Range:", f"{min_daily} - {max_daily} orders"])
            writer.writerow(["Daily Volume Variance:", f"{((max_daily - min_daily) / avg_daily * 100):.1f}%" if avg_daily > 0 else "N/A"])
        
        writer.writerow([])  # Empty row
        writer.writerow(["--- END OF REPORT ---"])

    @staticmethod
    def export_operations_to_xlsx(report_data: Dict[str, Any], ws, header_font, header_fill, header_alignment):
        """Export operations report to Excel format"""
        OperationsReportService._export_operations_to_xlsx(ws, report_data, header_font, header_fill, header_alignment)

    @staticmethod
    def _export_operations_to_xlsx(ws, report_data: Dict[str, Any], header_font, header_fill, header_alignment):
        """Export comprehensive operations report to Excel matching CSV format (Excel-safe headers)"""
        from django.utils import timezone
        from datetime import datetime
        
        # Define number formats (using working patterns)
        currency_format = '"$"#,##0.00'
        number_format = '#,##0'
        percentage_format = '0.0%'
        
        row = 1
        
        # --- HEADER INFORMATION ---
        ws.cell(row=row, column=1, value="--- OPERATIONS REPORT ---")
        row += 1
        
        # Date range
        date_range = report_data.get("date_range", {})
        start_str = date_range.get("start", "N/A")
        end_str = date_range.get("end", "N/A")
        
        if start_str != "N/A" and end_str != "N/A":
            try:
                start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
                start_str = start_date.strftime("%B %d, %Y")
                end_str = end_date.strftime("%B %d, %Y")
            except:
                pass
        
        ws.cell(row=row, column=1, value="Date Range:")
        ws.cell(row=row, column=2, value=f"{start_str} to {end_str}")
        row += 1
        
        ws.cell(row=row, column=1, value="Generated:")
        ws.cell(row=row, column=2, value=report_data.get("generated_at", "N/A"))
        row += 1
        
        row += 1  # Empty row
        
        # --- EXECUTIVE SUMMARY ---
        ws.cell(row=row, column=1, value="--- EXECUTIVE SUMMARY ---")
        row += 1
        
        summary = report_data.get("summary", {})
        
        ws.cell(row=row, column=1, value="Total Orders Processed:")
        ws.cell(row=row, column=2, value=int(summary.get('total_orders', 0)))
        row += 1
        
        ws.cell(row=row, column=1, value="Average Orders per Day:")
        ws.cell(row=row, column=2, value=float(summary.get('avg_orders_per_day', 0)))
        row += 1
        
        # Peak day information
        peak_day = summary.get("peak_day")
        if peak_day:
            peak_date = peak_day.get("date", "N/A")
            if peak_date != "N/A":
                try:
                    peak_date_obj = datetime.fromisoformat(peak_date.replace("Z", "+00:00"))
                    peak_date = peak_date_obj.strftime("%A, %B %d, %Y")
                except:
                    pass
            ws.cell(row=row, column=1, value="Peak Day:")
            ws.cell(row=row, column=2, value=f"{peak_date} ({peak_day.get('orders', 0)} orders)")
            row += 1
        
        # Slowest day information
        slowest_day = summary.get("slowest_day")
        if slowest_day:
            slowest_date = slowest_day.get("date", "N/A")
            if slowest_date != "N/A":
                try:
                    slowest_date_obj = datetime.fromisoformat(slowest_date.replace("Z", "+00:00"))
                    slowest_date = slowest_date_obj.strftime("%A, %B %d, %Y")
                except:
                    pass
            ws.cell(row=row, column=1, value="Slowest Day:")
            ws.cell(row=row, column=2, value=f"{slowest_date} ({slowest_day.get('orders', 0)} orders)")
            row += 1
        
        # Staff count
        staff_performance = report_data.get("staff_performance", [])
        ws.cell(row=row, column=1, value="Total Active Staff:")
        ws.cell(row=row, column=2, value=int(len(staff_performance)))
        row += 1
        
        row += 1  # Empty row
        
        # --- DAILY OPERATIONS ANALYSIS ---
        daily_volume = report_data.get("daily_volume", [])
        ws.cell(row=row, column=1, value="--- DAILY OPERATIONS ANALYSIS ---")
        row += 1
        
        # Headers
        headers = ["Date", "Day of Week", "Orders Processed", "Revenue Generated", "Average Order Value"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=row, column=col, value=header)
        row += 1
        
        # Data rows
        for daily in daily_volume:
            date_str = daily.get("date", "N/A")
            day_of_week = "N/A"
            
            # Calculate day of week and format date
            try:
                date_obj = datetime.fromisoformat(date_str)
                day_of_week = date_obj.strftime("%A")
                date_str = date_obj.strftime("%B %d, %Y")
            except:
                pass
            
            orders = daily.get("orders", 0)
            revenue = daily.get("revenue", 0)
            avg_order_value = revenue / orders if orders > 0 else 0
            
            ws.cell(row=row, column=1, value=date_str)
            ws.cell(row=row, column=2, value=day_of_week)
            ws.cell(row=row, column=3, value=int(orders))
            
            revenue_cell = ws.cell(row=row, column=4, value=float(revenue))
            revenue_cell.number_format = currency_format
            
            avg_cell = ws.cell(row=row, column=5, value=float(avg_order_value))
            avg_cell.number_format = currency_format
            
            row += 1
        
        row += 1  # Empty row
        
        # --- HOURLY PERFORMANCE PATTERNS ---
        hourly_patterns = report_data.get("hourly_patterns", [])
        ws.cell(row=row, column=1, value="--- HOURLY PERFORMANCE PATTERNS ---")
        row += 1
        
        # Headers
        headers = ["Hour", "Orders Processed", "Revenue Generated", "Average Order Value", "% of Daily Volume"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=row, column=col, value=header)
        row += 1
        
        total_daily_orders = summary.get("total_orders", 1)  # Avoid division by zero
        
        # Data rows
        for hourly in hourly_patterns:
            hour = hourly.get("hour", "N/A")
            orders = hourly.get("orders", 0)
            revenue = hourly.get("revenue", 0)
            avg_order_value = hourly.get("avg_order_value", 0)
            percentage = (orders / total_daily_orders) if total_daily_orders > 0 else 0
            
            ws.cell(row=row, column=1, value=str(hour))
            ws.cell(row=row, column=2, value=int(orders))
            
            revenue_cell = ws.cell(row=row, column=3, value=float(revenue))
            revenue_cell.number_format = currency_format
            
            avg_cell = ws.cell(row=row, column=4, value=float(avg_order_value))
            avg_cell.number_format = currency_format
            
            pct_cell = ws.cell(row=row, column=5, value=float(percentage))
            pct_cell.number_format = percentage_format
            
            row += 1
        
        row += 1  # Empty row
        
        # --- PEAK PERFORMANCE ANALYSIS ---
        peak_hours = report_data.get("peak_hours", [])
        ws.cell(row=row, column=1, value="--- PEAK PERFORMANCE ANALYSIS ---")
        row += 1
        
        # Headers
        headers = ["Rank", "Hour", "Orders Processed", "Revenue Generated", "% of Daily Orders"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=row, column=col, value=header)
        row += 1
        
        # Data rows
        for i, peak in enumerate(peak_hours, 1):
            hour = peak.get("hour", "N/A")
            orders = peak.get("orders", 0)
            revenue = peak.get("revenue", 0)
            percentage = (orders / total_daily_orders) if total_daily_orders > 0 else 0
            
            ws.cell(row=row, column=1, value=int(i))
            ws.cell(row=row, column=2, value=str(hour))
            ws.cell(row=row, column=3, value=int(orders))
            
            revenue_cell = ws.cell(row=row, column=4, value=float(revenue))
            revenue_cell.number_format = currency_format
            
            pct_cell = ws.cell(row=row, column=5, value=float(percentage))
            pct_cell.number_format = percentage_format
            
            row += 1
        
        row += 1  # Empty row
        
        # --- STAFF PERFORMANCE METRICS ---
        ws.cell(row=row, column=1, value="--- STAFF PERFORMANCE METRICS ---")
        row += 1
        
        # Headers
        headers = ["Rank", "Cashier Name", "Orders Processed", "Total Revenue", "Average Order Value", "% Share of Total Orders"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=row, column=col, value=header)
        row += 1
        
        # Data rows
        for i, staff in enumerate(staff_performance, 1):
            cashier = staff.get("cashier", "N/A")
            orders_processed = staff.get("orders_processed", 0)
            revenue = staff.get("revenue", 0)
            avg_order_value = staff.get("avg_order_value", 0)
            percentage_share = (orders_processed / total_daily_orders) if total_daily_orders > 0 else 0
            
            ws.cell(row=row, column=1, value=int(i))
            ws.cell(row=row, column=2, value=str(cashier))
            ws.cell(row=row, column=3, value=int(orders_processed))
            
            revenue_cell = ws.cell(row=row, column=4, value=float(revenue))
            revenue_cell.number_format = currency_format
            
            avg_cell = ws.cell(row=row, column=5, value=float(avg_order_value))
            avg_cell.number_format = currency_format
            
            pct_cell = ws.cell(row=row, column=6, value=float(percentage_share))
            pct_cell.number_format = percentage_format
            
            row += 1
        
        row += 1  # Empty row
        
        # --- OPERATIONAL INSIGHTS ---
        ws.cell(row=row, column=1, value="--- OPERATIONAL INSIGHTS ---")
        row += 1
        
        # Peak vs Off-Peak analysis
        if peak_hours and len(peak_hours) >= 3:
            top_3_peak_orders = sum(peak.get("orders", 0) for peak in peak_hours[:3])
            peak_percentage = (top_3_peak_orders / total_daily_orders) if total_daily_orders > 0 else 0
            ws.cell(row=row, column=1, value="Top 3 Peak Hours Handle:")
            
            pct_cell = ws.cell(row=row, column=2, value=float(peak_percentage))
            pct_cell.number_format = percentage_format
            row += 1
        
        # Staff productivity insights
        if staff_performance:
            top_performer = staff_performance[0]
            top_performer_percentage = (top_performer.get("orders_processed", 0) / total_daily_orders) if total_daily_orders > 0 else 0
            ws.cell(row=row, column=1, value="Top Performer Handles:")
            
            pct_cell = ws.cell(row=row, column=2, value=float(top_performer_percentage))
            pct_cell.number_format = percentage_format
            row += 1
            
            # Average orders per staff member
            avg_orders_per_staff = total_daily_orders / len(staff_performance) if len(staff_performance) > 0 else 0
            ws.cell(row=row, column=1, value="Average Orders per Staff Member:")
            ws.cell(row=row, column=2, value=float(avg_orders_per_staff))
            row += 1
        
        # Daily volume insights
        if daily_volume and len(daily_volume) > 1:
            daily_orders = [day.get("orders", 0) for day in daily_volume]
            max_daily = max(daily_orders)
            min_daily = min(daily_orders)
            avg_daily = sum(daily_orders) / len(daily_orders)
            
            ws.cell(row=row, column=1, value="Daily Volume Range:")
            ws.cell(row=row, column=2, value=f"{min_daily} - {max_daily} orders")
            row += 1
            
            daily_variance = ((max_daily - min_daily) / avg_daily) if avg_daily > 0 else 0
            ws.cell(row=row, column=1, value="Daily Volume Variance:")
            
            var_cell = ws.cell(row=row, column=2, value=float(daily_variance))
            var_cell.number_format = percentage_format
            row += 1

    @staticmethod
    def export_operations_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export operations report to PDF format (concise version)"""
        OperationsReportService._export_operations_to_pdf(story, report_data, styles)

    @staticmethod
    def _export_operations_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export concise operations report to PDF format"""
        from reportlab.lib.units import inch
        from reportlab.platypus import Table, TableStyle, Paragraph, Spacer
        from reportlab.lib import colors
        from datetime import datetime
        
        # === HEADER INFORMATION ===
        story.append(Paragraph("OPERATIONS REPORT", styles['Title']))
        story.append(Spacer(1, 12))
        
        # Date range
        date_range = report_data.get("date_range", {})
        start_str = date_range.get("start", "N/A")
        end_str = date_range.get("end", "N/A")
        
        if start_str != "N/A" and end_str != "N/A":
            try:
                start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
                start_str = start_date.strftime("%B %d, %Y")
                end_str = end_date.strftime("%B %d, %Y")
            except:
                pass
        
        story.append(Paragraph(f"<b>Date Range:</b> {start_str} to {end_str}", styles['Normal']))
        story.append(Spacer(1, 12))
        
        # === EXECUTIVE SUMMARY ===
        story.append(Paragraph("EXECUTIVE SUMMARY", styles['Heading1']))
        story.append(Spacer(1, 6))
        
        summary = report_data.get("summary", {})
        
        # Summary metrics in a clean table
        summary_data = [
            ["Metric", "Value"],
            ["Total Orders Processed", f"{summary.get('total_orders', 0):,}"],
            ["Average Orders per Day", f"{summary.get('avg_orders_per_day', 0):.1f}"],
        ]
        
        # Add peak/slowest days if available
        peak_day = summary.get("peak_day")
        if peak_day:
            peak_date = peak_day.get("date", "N/A")
            try:
                peak_date_obj = datetime.fromisoformat(peak_date.replace("Z", "+00:00"))
                peak_date = peak_date_obj.strftime("%B %d")
            except:
                pass
            summary_data.append(["Peak Day", f"{peak_date} ({peak_day.get('orders', 0)} orders)"])
        
        slowest_day = summary.get("slowest_day")
        if slowest_day:
            slowest_date = slowest_day.get("date", "N/A")
            try:
                slowest_date_obj = datetime.fromisoformat(slowest_date.replace("Z", "+00:00"))
                slowest_date = slowest_date_obj.strftime("%B %d")
            except:
                pass
            summary_data.append(["Slowest Day", f"{slowest_date} ({slowest_day.get('orders', 0)} orders)"])
        
        staff_performance = report_data.get("staff_performance", [])
        summary_data.append(["Active Staff", f"{len(staff_performance)}"])
        
        summary_table = Table(summary_data, colWidths=[2.5*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        
        story.append(summary_table)
        story.append(Spacer(1, 12))
        
        # === PEAK HOURS ANALYSIS ===
        peak_hours = report_data.get("peak_hours", [])
        if peak_hours:
            story.append(Paragraph("PEAK HOURS ANALYSIS", styles['Heading1']))
            story.append(Spacer(1, 6))
            
            peak_data = [["Rank", "Hour", "Orders", "Revenue"]]
            
            for i, peak in enumerate(peak_hours[:5], 1):  # Top 5 only for PDF
                peak_data.append([
                    str(i),
                    peak.get("hour", "N/A"),
                    f"{peak.get('orders', 0):,}",
                    f"${peak.get('revenue', 0):,.2f}"
                ])
            
            peak_table = Table(peak_data, colWidths=[0.5*inch, 1*inch, 1*inch, 1.2*inch])
            peak_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.lightblue),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),  # Right align numbers
            ]))
            
            story.append(peak_table)
            story.append(Spacer(1, 12))
        
        # === STAFF PERFORMANCE ===
        if staff_performance:
            story.append(Paragraph("STAFF PERFORMANCE", styles['Heading1']))
            story.append(Spacer(1, 6))
            
            staff_data = [["Rank", "Cashier", "Orders", "Revenue"]]
            
            # Top 10 staff for PDF (not overwhelming)
            for i, staff in enumerate(staff_performance[:10], 1):
                cashier = staff.get("cashier", "N/A")
                if len(cashier) > 20:  # Truncate long names
                    cashier = cashier[:17] + "..."
                    
                staff_data.append([
                    str(i),
                    cashier,
                    f"{staff.get('orders_processed', 0):,}",
                    f"${staff.get('revenue', 0):,.2f}"
                ])
            
            staff_table = Table(staff_data, colWidths=[0.5*inch, 1.8*inch, 1*inch, 1.2*inch])
            staff_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkgreen),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.lightgreen),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # Center rank
                ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),  # Right align numbers
            ]))
            
            story.append(staff_table)
            story.append(Spacer(1, 12))
        
        # === KEY INSIGHTS ===
        story.append(Paragraph("KEY OPERATIONAL INSIGHTS", styles['Heading1']))
        story.append(Spacer(1, 6))
        
        insights = []
        total_daily_orders = summary.get("total_orders", 1)
        
        # Peak hours analysis
        if peak_hours and len(peak_hours) >= 3:
            top_3_peak_orders = sum(peak.get("orders", 0) for peak in peak_hours[:3])
            peak_percentage = (top_3_peak_orders / total_daily_orders * 100) if total_daily_orders > 0 else 0
            insights.append(f"<b>Peak Concentration:</b> Top 3 busiest hours handle {peak_percentage:.1f}% of all orders")
        
        # Staff productivity
        if staff_performance:
            top_performer = staff_performance[0]
            top_performer_percentage = (top_performer.get("orders_processed", 0) / total_daily_orders * 100) if total_daily_orders > 0 else 0
            insights.append(f"<b>Top Performer:</b> {top_performer.get('cashier', 'N/A')} handles {top_performer_percentage:.1f}% of all orders")
            
            avg_orders_per_staff = total_daily_orders / len(staff_performance) if len(staff_performance) > 0 else 0
            insights.append(f"<b>Staff Efficiency:</b> Average of {avg_orders_per_staff:.1f} orders per staff member")
        
        # Daily volume insights
        daily_volume = report_data.get("daily_volume", [])
        if daily_volume and len(daily_volume) > 1:
            daily_orders = [day.get("orders", 0) for day in daily_volume]
            max_daily = max(daily_orders)
            min_daily = min(daily_orders)
            insights.append(f"<b>Volume Range:</b> Daily orders vary from {min_daily} to {max_daily}")
        
        for insight in insights:
            story.append(Paragraph(insight, styles['Normal']))
            story.append(Spacer(1, 4))
        
        story.append(Spacer(1, 12))
        story.append(Paragraph("<i>For detailed hourly patterns and complete data, use CSV or Excel export.</i>", styles['Normal']))