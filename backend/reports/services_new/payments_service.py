"""
Payments report service with generation and export functionality.
Refactored from monolithic reports service for better maintainability.
"""
import time
import logging
import csv
import io
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from django.db import transaction
from django.db.models import (
    Sum, Count, Q, Value
)
from django.db.models.functions import TruncDate, Coalesce
from django.utils import timezone

# Export functionality imports
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Table, TableStyle, Spacer, PageBreak
from reportlab.lib import colors

from orders.models import Order
from payments.models import Payment, PaymentTransaction
from .base import BaseReportService
from .timezone_utils import TimezoneUtils

logger = logging.getLogger(__name__)


class PaymentsReportService(BaseReportService):
    """Service for generating and exporting payments reports."""

    @staticmethod
    @transaction.atomic
    def generate_payments_report(
        start_date: datetime,
        end_date: datetime,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """Generate comprehensive payments report"""

        cache_key = PaymentsReportService._generate_cache_key(
            "payments",
            {"start_date": start_date, "end_date": end_date},
        )

        if use_cache:
            cached_data = PaymentsReportService._get_cached_report(cache_key)
            if cached_data:
                return cached_data

        logger.info(f"Generating payments report for {start_date} to {end_date}")
        start_time = time.time()

        # Get base transaction querysets
        transaction_querysets = PaymentsReportService._get_transaction_querysets(start_date, end_date)
        
        # Calculate payment method breakdown
        payment_methods = PaymentsReportService._calculate_payment_methods(transaction_querysets)
        
        # Get daily volume data
        daily_volume = PaymentsReportService._calculate_daily_volume(start_date, end_date)
        
        # Get daily breakdown by method
        daily_breakdown = PaymentsReportService._calculate_daily_breakdown(transaction_querysets['successful'])
        
        # Calculate comprehensive summary
        summary = PaymentsReportService._calculate_payments_summary(transaction_querysets)
        
        # Get processing statistics
        processing_stats = PaymentsReportService._calculate_processing_stats(start_date, end_date)
        
        # Get reconciliation data
        order_totals_comparison = PaymentsReportService._calculate_order_reconciliation(start_date, end_date, summary)

        # Build final report data
        payments_data = {
            "payment_methods": payment_methods,
            "daily_volume": daily_volume,
            "daily_breakdown": daily_breakdown,
            "summary": summary,
            "processing_stats": processing_stats,
            "order_totals_comparison": order_totals_comparison,
            "generated_at": timezone.now().isoformat(),
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }

        # Cache the result
        generation_time = time.time() - start_time
        PaymentsReportService._cache_report(
            cache_key, payments_data, ttl_hours=PaymentsReportService.CACHE_TTL["payments"]
        )

        logger.info(f"Payments report generated in {generation_time:.2f}s")
        return payments_data

    @staticmethod
    def _get_transaction_querysets(start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """Get base transaction querysets for different statuses."""
        base_filter = {
            "payment__order__created_at__range": (start_date, end_date),
            "payment__order__subtotal__gt": 0,
        }
        
        successful_transactions = PaymentTransaction.objects.select_related(
            "payment", "payment__order"
        ).filter(
            payment__order__status=Order.OrderStatus.COMPLETED,
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
            **base_filter
        )

        refunded_transactions = PaymentTransaction.objects.select_related(
            "payment", "payment__order"
        ).filter(
            payment__order__status__in=[Order.OrderStatus.COMPLETED, Order.OrderStatus.CANCELLED],
            status=PaymentTransaction.TransactionStatus.REFUNDED,
            **base_filter
        )

        failed_transactions = PaymentTransaction.objects.select_related(
            "payment", "payment__order"
        ).filter(
            payment__order__status=Order.OrderStatus.COMPLETED,
            status=PaymentTransaction.TransactionStatus.FAILED,
            **base_filter
        )

        canceled_transactions = PaymentTransaction.objects.select_related(
            "payment", "payment__order"
        ).filter(
            payment__order__status=Order.OrderStatus.COMPLETED,
            status=PaymentTransaction.TransactionStatus.CANCELED,
            **base_filter
        )

        return {
            "successful": successful_transactions,
            "refunded": refunded_transactions,
            "failed": failed_transactions,
            "canceled": canceled_transactions,
        }

    @staticmethod
    def _calculate_payment_methods(transaction_querysets: Dict[str, Any]) -> list:
        """Calculate payment method breakdown with trends."""
        successful_transactions = transaction_querysets['successful']
        refunded_transactions = transaction_querysets['refunded']
        
        # Get payment method aggregation from successful transactions
        payment_methods_agg = (
            successful_transactions.values("method")
            .annotate(
                amount=Sum("amount"),
                count=Count("id"),
                processing_fees=Sum("surcharge"),
            )
            .order_by("-amount")
        )

        # Get refunded amounts by method
        refunded_methods_agg = refunded_transactions.values("method").annotate(
            refunded_amount=Sum("amount"),
            refunded_count=Count("id"),
        )

        # Create lookup dict for refunded amounts
        refunded_by_method = {
            item["method"]: {
                "amount": float(item["refunded_amount"] or 0),
                "count": item["refunded_count"],
            }
            for item in refunded_methods_agg
        }

        # Calculate total for percentages
        total_processed = sum(float(item["amount"] or 0) for item in payment_methods_agg)

        # Calculate trends (simplified for now)
        payment_methods = []
        for item in payment_methods_agg:
            method_amount = float(item["amount"] or 0)
            method_fees = float(item["processing_fees"] or 0)
            method_name = item["method"]

            # Get refunded amounts for this method
            refunded_info = refunded_by_method.get(method_name, {"amount": 0, "count": 0})
            refunded_amount = refunded_info["amount"]
            refunded_count = refunded_info["count"]

            # Calculate percentage
            percentage = (method_amount / total_processed * 100) if total_processed > 0 else 0

            payment_methods.append({
                "method": method_name,
                "amount": method_amount,
                "count": item["count"],
                "avg_amount": method_amount / item["count"] if item["count"] > 0 else 0,
                "processing_fees": method_fees,
                "percentage": round(percentage, 2),
                "trend": 0,  # TODO: Calculate actual trend
                "refunded_amount": refunded_amount,
                "refunded_count": refunded_count,
                "total_processed": method_amount + refunded_amount,
                "net_amount": method_amount,
            })

        return payment_methods

    @staticmethod
    def _calculate_daily_volume(start_date: datetime, end_date: datetime) -> list:
        """Calculate daily payment volume using Payment model."""
        payments = Payment.objects.filter(
            order__status=Order.OrderStatus.COMPLETED,
            order__created_at__range=(start_date, end_date),
            order__subtotal__gt=0,
        )

        daily_payments = (
            payments.annotate(date=TruncDate("order__created_at"))
            .values("date")
            .annotate(amount=Sum("total_collected"), count=Count("id"))
            .order_by("date")
        )

        return [
            {
                "date": item["date"].strftime("%Y-%m-%d"),
                "amount": float(item["amount"] or 0),
                "count": item["count"],
            }
            for item in daily_payments
        ]

    @staticmethod
    def _calculate_daily_breakdown(successful_transactions) -> list:
        """Calculate daily breakdown by payment method."""
        daily_breakdown_data = (
            successful_transactions.annotate(date=TruncDate("created_at"))
            .values("date", "method")
            .annotate(total=Sum("amount"))
            .order_by("date", "method")
        )

        daily_breakdown = {}
        for item in daily_breakdown_data:
            date_str = item["date"].strftime("%Y-%m-%d")
            if date_str not in daily_breakdown:
                daily_breakdown[date_str] = {"date": date_str, "total": 0}
            method_key = item["method"].lower().replace("_", "")
            daily_breakdown[date_str][method_key] = float(item["total"] or 0)

        # Calculate totals for each day
        for date_str, breakdown in daily_breakdown.items():
            breakdown["total"] = sum(
                v for k, v in breakdown.items() if k not in ["date", "total"]
            )

        return sorted(list(daily_breakdown.values()), key=lambda x: x["date"])

    @staticmethod
    def _calculate_payments_summary(transaction_querysets: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate comprehensive payments summary."""
        successful = transaction_querysets['successful']
        refunded = transaction_querysets['refunded']
        failed = transaction_querysets['failed']
        canceled = transaction_querysets['canceled']

        # Calculate totals
        total_successful = float(successful.aggregate(total=Sum("amount"))["total"] or 0)
        total_refunds = float(refunded.aggregate(total=Sum("amount"))["total"] or 0)
        total_failed = float(failed.aggregate(total=Sum("amount"))["total"] or 0)
        total_canceled = float(canceled.aggregate(total=Sum("amount"))["total"] or 0)

        total_attempted = total_successful + total_refunds + total_failed + total_canceled
        total_processing_issues = total_refunds + total_failed + total_canceled

        # Calculate rates
        processing_success_rate = (
            round((total_successful / total_attempted * 100), 2)
            if total_attempted > 0 else 0
        )
        processing_issues_rate = (
            round((total_processing_issues / total_attempted * 100), 2)
            if total_attempted > 0 else 0
        )

        return {
            # Primary metrics
            "total_attempted": total_attempted,
            "successfully_processed": total_successful,
            "processing_issues": total_processing_issues,
            
            # Detailed breakdown
            "breakdown": {
                "successful": {
                    "amount": total_successful,
                    "count": successful.count(),
                },
                "refunded": {
                    "amount": total_refunds,
                    "count": refunded.count(),
                },
                "failed": {
                    "amount": total_failed,
                    "count": failed.count(),
                },
                "canceled": {
                    "amount": total_canceled,
                    "count": canceled.count(),
                },
            },
            
            # Calculated rates
            "processing_success_rate": processing_success_rate,
            "processing_issues_rate": processing_issues_rate,
            
            # Legacy fields for backward compatibility
            "total_processed": total_successful,
            "total_transactions": successful.count(),
            "total_refunds": total_refunds,
            "total_refunded_transactions": refunded.count(),
            "net_revenue": total_successful,
        }

    @staticmethod
    def _calculate_processing_stats(start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """Calculate processing statistics for all transactions."""
        all_transactions = PaymentTransaction.objects.select_related(
            "payment", "payment__order"
        ).filter(
            payment__order__status=Order.OrderStatus.COMPLETED,
            payment__order__created_at__range=(start_date, end_date),
            payment__order__subtotal__gt=0,
        )

        processing_stats = all_transactions.aggregate(
            total_attempts=Count("id"),
            successful=Count("id", filter=Q(status=PaymentTransaction.TransactionStatus.SUCCESSFUL)),
            failed=Count("id", filter=Q(status=PaymentTransaction.TransactionStatus.FAILED)),
            refunded=Count("id", filter=Q(status=PaymentTransaction.TransactionStatus.REFUNDED)),
        )

        success_rate = (
            (processing_stats["successful"] / processing_stats["total_attempts"]) * 100
            if processing_stats["total_attempts"] > 0 else 0
        )

        return {
            "total_attempts": processing_stats["total_attempts"],
            "successful": processing_stats["successful"],
            "failed": processing_stats["failed"],
            "refunded": processing_stats["refunded"],
            "success_rate": round(success_rate, 2),
        }

    @staticmethod
    def _calculate_order_reconciliation(start_date: datetime, end_date: datetime, summary: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate order totals comparison for reconciliation."""
        completed_orders = Order.objects.filter(
            status=Order.OrderStatus.COMPLETED,
            created_at__range=(start_date, end_date),
            subtotal__gt=0,
        ).aggregate(
            order_total=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            order_count=Count("id"),
        )

        order_total = float(completed_orders["order_total"] or 0)
        payment_total = summary["total_attempted"]

        return {
            "order_grand_total": order_total,
            "order_count": completed_orders["order_count"],
            "payment_transaction_total": payment_total,
            "difference": order_total - payment_total,
        }

    @staticmethod
    def _get_detailed_transaction_data(start_date: datetime, end_date: datetime) -> list:
        """Get detailed transaction data for CSV export."""
        transactions = PaymentTransaction.objects.select_related(
            'payment', 'payment__order'
        ).filter(
            payment__order__status=Order.OrderStatus.COMPLETED,
            payment__order__created_at__range=(start_date, end_date),
            payment__order__subtotal__gt=0,
            status__in=[
                PaymentTransaction.TransactionStatus.SUCCESSFUL,
                PaymentTransaction.TransactionStatus.REFUNDED
            ]
        ).order_by('payment__payment_number', 'created_at')

        transaction_data = []
        for txn in transactions:
            # Calculate total including tip and surcharge
            total_amount = float(txn.amount) + float(txn.tip) + float(txn.surcharge)
            
            transaction_data.append({
                "payment_number": txn.payment.payment_number or str(txn.payment.id)[:8],
                "date": txn.created_at.strftime("%Y-%m-%d %H:%M:%S") if txn.created_at else "",
                "order_id": txn.payment.order.order_number or str(txn.payment.order.id)[:8],
                "method": txn.get_method_display(),
                "status": txn.get_status_display(),
                "amount": float(txn.amount),
                "tip": float(txn.tip),
                "surcharge": float(txn.surcharge),
                "total": total_amount,
                "card_brand": txn.card_brand or "",
                "card_last4": txn.card_last4 or "",
                "transaction_id": txn.transaction_id or "",
                "refunded_amount": float(txn.refunded_amount),
                "refund_reason": txn.refund_reason or "",
            })
        
        return transaction_data

    # Export Methods

    @staticmethod
    def export_payments_to_csv(report_data: Dict[str, Any]) -> bytes:
        """Export payments report to CSV format."""
        output = io.StringIO()
        writer = csv.writer(output)
        
        PaymentsReportService._export_payments_to_csv(writer, report_data)
        
        csv_bytes = output.getvalue().encode('utf-8')
        output.close()
        return csv_bytes

    @staticmethod
    def _export_payments_to_csv(writer, report_data: Dict[str, Any]):
        """Export comprehensive payments report to CSV with transaction-level details."""
        from django.utils import timezone
        from datetime import datetime
        
        # Header
        writer.writerow(["Payments Report"])
        writer.writerow(["Generated:", report_data.get("generated_at", timezone.now().isoformat())])
        
        # Extract and format date range
        date_range = report_data.get("date_range", {})
        start_str = date_range.get("start", "")
        end_str = date_range.get("end", "")
        
        try:
            start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
            writer.writerow([f"Date Range: {start_date.date()} to {end_date.date()}"])
        except:
            writer.writerow([f"Date Range: {start_str} to {end_str}"])
        
        writer.writerow([])
        
        # === PAYMENT SUMMARY ===
        writer.writerow(["=== PAYMENT SUMMARY ==="])
        writer.writerow(["Metric", "Value"])
        
        summary = report_data.get("summary", {})
        writer.writerow(["Total Collected", f"${summary.get('successfully_processed', 0):,.2f}"])
        writer.writerow(["Total Refunds", f"${summary.get('total_refunds', 0):,.2f}"])
        writer.writerow(["Net Revenue", f"${summary.get('net_revenue', 0):,.2f}"])
        writer.writerow(["Success Rate", f"{summary.get('processing_success_rate', 0):.2f}%"])
        writer.writerow(["Total Transactions", summary.get('total_transactions', 0)])
        writer.writerow([])
        
        # === PAYMENT METHODS SUMMARY ===
        writer.writerow(["=== PAYMENT METHODS SUMMARY ==="])
        writer.writerow([
            "Method", "Amount", "Count", "Percentage", "Avg Amount", "Processing Fees"
        ])
        
        for method in report_data.get("payment_methods", []):
            writer.writerow([
                method.get("method", ""),
                f"${method.get('amount', 0):,.2f}",
                method.get("count", 0),
                f"{method.get('percentage', 0):.2f}%",
                f"${method.get('avg_amount', 0):,.2f}",
                f"${method.get('processing_fees', 0):,.2f}",
            ])
        
        writer.writerow([])
        
        # === DETAILED TRANSACTION DATA ===
        writer.writerow(["=== COMPLETED PAYMENT TRANSACTIONS ==="])
        
        # Get detailed transaction data
        try:
            transaction_data = PaymentsReportService._get_detailed_transaction_data(
                start_date, end_date
            )
        except:
            # Fallback if datetime parsing fails
            transaction_data = []
        
        # Transaction headers
        writer.writerow([
            "Payment Number", "Date", "Order ID", "Payment Method", "Transaction Status",
            "Amount", "Tip", "Surcharge", "Total", "Card Brand", "Card Last4",
            "Transaction ID", "Refunded Amount", "Refund Reason"
        ])
        
        for transaction in transaction_data:
            writer.writerow([
                transaction.get("payment_number", ""),
                transaction.get("date", ""),
                transaction.get("order_id", ""),
                transaction.get("method", ""),
                transaction.get("status", ""),
                f"${transaction.get('amount', 0):,.2f}",
                f"${transaction.get('tip', 0):,.2f}",
                f"${transaction.get('surcharge', 0):,.2f}",
                f"${transaction.get('total', 0):,.2f}",
                transaction.get("card_brand", ""),
                transaction.get("card_last4", ""),
                transaction.get("transaction_id", ""),
                f"${transaction.get('refunded_amount', 0):,.2f}",
                transaction.get("refund_reason", ""),
            ])
        
        writer.writerow([])
        writer.writerow([f"Total Transactions Exported: {len(transaction_data)}"])

    @staticmethod
    def export_payments_to_xlsx(report_data: Dict[str, Any], ws, header_font, header_fill, header_alignment):
        """Export payments report to Excel format."""
        PaymentsReportService._export_payments_to_xlsx(ws, report_data, header_font, header_fill, header_alignment)

    @staticmethod
    def _export_payments_to_xlsx(ws, report_data: Dict[str, Any], header_font, header_fill, header_alignment):
        """Export comprehensive payments report to Excel with transaction-level details."""
        from django.utils import timezone
        from datetime import datetime
        from openpyxl.styles import Border, Side, Font, PatternFill, Alignment
        
        # Define styles
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        section_header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        section_header_font = Font(bold=True, color="FFFFFF", size=12)
        
        subsection_fill = PatternFill(start_color="DCE6F1", end_color="DCE6F1", fill_type="solid")
        subsection_font = Font(bold=True, size=11)
        
        currency_format = '"$"#,##0.00'
        number_format = '#,##0'
        
        row = 1
        
        # Title
        ws.merge_cells(f"A{row}:N{row}")  # Extended for more columns
        ws[f"A{row}"] = "Payments Report"
        ws[f"A{row}"].font = Font(bold=True, size=16)
        ws[f"A{row}"].alignment = Alignment(horizontal="center", vertical="center")
        row += 1
        
        # Generated date and range
        generated_at = report_data.get('generated_at', timezone.now().isoformat())
        ws.merge_cells(f"A{row}:N{row}")
        ws[f"A{row}"] = f"Generated: {generated_at}"
        ws[f"A{row}"].alignment = Alignment(horizontal="center")
        row += 1
        
        date_range = report_data.get("date_range", {})
        start_str = date_range.get("start", "")
        end_str = date_range.get("end", "")
        
        try:
            start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
            ws.merge_cells(f"A{row}:N{row}")
            ws[f"A{row}"] = f"Date Range: {start_date.date()} to {end_date.date()}"
            ws[f"A{row}"].alignment = Alignment(horizontal="center")
        except:
            ws.merge_cells(f"A{row}:N{row}")
            ws[f"A{row}"] = f"Date Range: {start_str} to {end_str}"
            ws[f"A{row}"].alignment = Alignment(horizontal="center")
        row += 2
        
        # === PAYMENT SUMMARY ===
        ws.merge_cells(f"A{row}:B{row}")
        ws[f"A{row}"] = "PAYMENT SUMMARY"
        ws[f"A{row}"].font = section_header_font
        ws[f"A{row}"].fill = section_header_fill
        ws[f"A{row}"].alignment = Alignment(horizontal="center", vertical="center")
        row += 1
        
        # Summary headers
        ws[f"A{row}"] = "Metric"
        ws[f"B{row}"] = "Value"
        ws[f"A{row}"].font = subsection_font
        ws[f"B{row}"].font = subsection_font
        ws[f"A{row}"].fill = subsection_fill
        ws[f"B{row}"].fill = subsection_fill
        row += 1
        
        # Summary metrics
        summary = report_data.get("summary", {})
        summary_metrics = [
            ("Total Collected", summary.get('successfully_processed', 0), currency_format),
            ("Total Refunds", summary.get('total_refunds', 0), currency_format),
            ("Net Revenue", summary.get('net_revenue', 0), currency_format),
            ("Success Rate", summary.get('processing_success_rate', 0), '"0.00"%'),
            ("Total Transactions", summary.get('total_transactions', 0), number_format),
        ]
        
        for metric, value, fmt in summary_metrics:
            ws[f"A{row}"] = metric
            if fmt == '"0.00"%':
                ws[f"B{row}"] = value / 100  # Convert percentage for Excel
            else:
                ws[f"B{row}"] = value
            ws[f"B{row}"].number_format = fmt
            ws[f"A{row}"].border = thin_border
            ws[f"B{row}"].border = thin_border
            row += 1
        
        row += 1  # Empty row
        
        # === PAYMENT METHODS SUMMARY ===
        ws.merge_cells(f"A{row}:F{row}")
        ws[f"A{row}"] = "PAYMENT METHODS SUMMARY"
        ws[f"A{row}"].font = section_header_font
        ws[f"A{row}"].fill = section_header_fill
        ws[f"A{row}"].alignment = Alignment(horizontal="center", vertical="center")
        row += 1
        
        # Payment method headers
        method_headers = ["Method", "Amount", "Count", "Percentage", "Avg Amount", "Processing Fees"]
        
        for col, header in enumerate(method_headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            cell.font = subsection_font
            cell.fill = subsection_fill
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        row += 1
        
        # Payment method data
        for method in report_data.get("payment_methods", []):
            method_data = [
                method.get("method", ""),
                float(method.get('amount', 0)),
                method.get('count', 0),
                method.get('percentage', 0) / 100,  # Convert for Excel percentage format
                float(method.get('avg_amount', 0)),
                float(method.get('processing_fees', 0)),
            ]
            
            for col, value in enumerate(method_data, 1):
                cell = ws.cell(row=row, column=col, value=value)
                cell.border = thin_border
                
                # Apply number formats
                if col in [2, 5, 6]:  # Currency columns
                    cell.number_format = currency_format
                elif col == 4:  # Percentage column
                    cell.number_format = '0.00%'
                elif col == 3:  # Count column
                    cell.number_format = number_format
            row += 1
        
        row += 2  # Empty rows
        
        # === DETAILED TRANSACTION DATA ===
        ws.merge_cells(f"A{row}:N{row}")
        ws[f"A{row}"] = "COMPLETED PAYMENT TRANSACTIONS"
        ws[f"A{row}"].font = section_header_font
        ws[f"A{row}"].fill = section_header_fill
        ws[f"A{row}"].alignment = Alignment(horizontal="center", vertical="center")
        row += 1
        
        # Get detailed transaction data
        try:
            transaction_data = PaymentsReportService._get_detailed_transaction_data(
                start_date, end_date
            )
        except:
            transaction_data = []
        
        # Transaction headers
        transaction_headers = [
            "Payment Number", "Date", "Order ID", "Payment Method", "Transaction Status",
            "Amount", "Tip", "Surcharge", "Total", "Card Brand", "Card Last4",
            "Transaction ID", "Refunded Amount", "Refund Reason"
        ]
        
        for col, header in enumerate(transaction_headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            cell.font = subsection_font
            cell.fill = subsection_fill
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        row += 1
        
        # Transaction data
        for transaction in transaction_data:
            transaction_row_data = [
                transaction.get("payment_number", ""),
                transaction.get("date", ""),
                transaction.get("order_id", ""),
                transaction.get("method", ""),
                transaction.get("status", ""),
                float(transaction.get('amount', 0)),
                float(transaction.get('tip', 0)),
                float(transaction.get('surcharge', 0)),
                float(transaction.get('total', 0)),
                transaction.get("card_brand", ""),
                transaction.get("card_last4", ""),
                transaction.get("transaction_id", ""),
                float(transaction.get('refunded_amount', 0)),
                transaction.get("refund_reason", ""),
            ]
            
            for col, value in enumerate(transaction_row_data, 1):
                cell = ws.cell(row=row, column=col, value=value)
                cell.border = thin_border
                
                # Apply number formats for currency columns
                if col in [6, 7, 8, 9, 13]:  # Amount, tip, surcharge, total, refunded_amount
                    cell.number_format = currency_format
            row += 1
        
        # Add summary row
        row += 1
        ws[f"A{row}"] = f"Total Transactions Exported: {len(transaction_data)}"
        ws[f"A{row}"].font = Font(bold=True)
        
        # Auto-adjust column widths
        try:
            for column in ws.columns:
                max_length = 0
                column_letter = get_column_letter(column[0].column)
                
                for cell in column:
                    try:
                        if cell.value:
                            max_length = max(max_length, len(str(cell.value)))
                    except:
                        pass
                
                adjusted_width = min(max_length + 2, 50)  # Cap at 50 characters
                ws.column_dimensions[column_letter].width = adjusted_width
        except Exception as e:
            pass

    @staticmethod
    def export_payments_to_pdf(report_data: Dict[str, Any], story, styles):
        """Export payments report to PDF format."""
        PaymentsReportService._export_payments_to_pdf(story, report_data, styles)

    @staticmethod
    def _export_payments_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export comprehensive payments report to PDF with key transaction details."""
        from django.utils import timezone
        from datetime import datetime
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.lib import colors
        from reportlab.lib.units import inch
        from reportlab.platypus import Spacer, PageBreak
        
        # Report header
        story.append(Paragraph("Payments Report", styles["Title"]))
        story.append(Spacer(1, 12))
        
        # Generated date and range
        generated_at = report_data.get('generated_at', timezone.now().isoformat())
        story.append(Paragraph(f"Generated: {generated_at}", styles["Normal"]))
        
        date_range = report_data.get("date_range", {})
        start_str = date_range.get("start", "")
        end_str = date_range.get("end", "")
        
        try:
            start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
            story.append(Paragraph(f"Date Range: {start_date.date()} to {end_date.date()}", styles["Normal"]))
        except:
            story.append(Paragraph(f"Date Range: {start_str} to {end_str}", styles["Normal"]))
        
        story.append(Spacer(1, 20))
        
        # === PAYMENT SUMMARY ===
        story.append(Paragraph("Payment Summary", styles["Heading2"]))
        story.append(Spacer(1, 12))
        
        summary = report_data.get("summary", {})
        summary_data = [
            ["Metric", "Value"],
            ["Total Collected", f"${summary.get('successfully_processed', 0):,.2f}"],
            ["Total Refunds", f"${summary.get('total_refunds', 0):,.2f}"],
            ["Net Revenue", f"${summary.get('net_revenue', 0):,.2f}"],
            ["Success Rate", f"{summary.get('processing_success_rate', 0):.2f}%"],
            ["Total Transactions", f"{summary.get('total_transactions', 0):,}"],
        ]
        
        summary_table = Table(summary_data, colWidths=[3 * inch, 2.5 * inch])
        summary_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.darkblue),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 11),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ])
        )
        
        story.append(summary_table)
        story.append(Spacer(1, 20))
        
        # === PAYMENT METHODS ===
        story.append(Paragraph("Payment Methods Summary", styles["Heading2"]))
        story.append(Spacer(1, 12))
        
        payment_methods_data = [["Method", "Amount", "Count", "Percentage", "Processing Fees"]]
        for method in report_data.get("payment_methods", []):
            payment_methods_data.append([
                method.get("method", ""),
                f"${method.get('amount', 0):,.2f}",
                f"{method.get('count', 0):,}",
                f"{method.get('percentage', 0):.1f}%",
                f"${method.get('processing_fees', 0):,.2f}",
            ])
        
        payment_methods_table = Table(payment_methods_data, colWidths=[
            1.5*inch, 1.2*inch, 0.8*inch, 0.8*inch, 1.2*inch
        ])
        payment_methods_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.darkblue),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("BACKGROUND", (0, 1), (-1, -1), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ])
        )
        
        story.append(payment_methods_table)
        story.append(Spacer(1, 20))
        
        # === KEY TRANSACTIONS (Sample) ===
        story.append(Paragraph("Recent Transactions Sample", styles["Heading2"]))
        story.append(Spacer(1, 12))
        
        # Get sample of transactions for PDF (limit to avoid clutter)
        try:
            # Ensure we have datetime objects for the query
            if isinstance(start_date, datetime):
                query_start = start_date
                query_end = end_date
            else:
                # Parse from strings if needed
                query_start = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                query_end = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
            
            transaction_data = PaymentsReportService._get_detailed_transaction_data(
                query_start, query_end
            )
            # Show max 10 most recent transactions
            sample_transactions = transaction_data[:10] if transaction_data else []
        except Exception as e:
            logger.error(f"Error getting transaction data for PDF: {e}")
            sample_transactions = []
        
        if sample_transactions:
            # Simplified transaction table for PDF
            transaction_table_data = [["Payment #", "Date", "Method", "Amount", "Status"]]
            for txn in sample_transactions:
                transaction_table_data.append([
                    txn.get("payment_number", "")[:12],  # Truncate for space
                    txn.get("date", "")[:10] if txn.get("date") else "",  # Date only
                    txn.get("method", ""),
                    f"${txn.get('total', 0):,.2f}",
                    txn.get("status", ""),
                ])
            
            transaction_table = Table(transaction_table_data, colWidths=[
                1.2*inch, 1.0*inch, 1.2*inch, 1.0*inch, 1.0*inch
            ])
            transaction_table.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.darkblue),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.lightgrey),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("FONTSIZE", (0, 1), (-1, -1), 8),
                ])
            )
            
            story.append(transaction_table)
            story.append(Spacer(1, 12))
            
            # Add note about full transaction details
            story.append(Paragraph(
                f"<i>Showing {len(sample_transactions)} of {len(transaction_data)} total transactions. "
                f"For complete transaction details, export to CSV or Excel.</i>",
                styles["Normal"]
            ))
        else:
            story.append(Paragraph("No transaction data available for this period.", styles["Normal"]))
        
        story.append(Spacer(1, 20))