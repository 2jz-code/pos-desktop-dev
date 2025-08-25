"""
Sales report service with generation and export functionality.
"""
import time
import logging
import csv
import io
from calendar import monthrange
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from django.db import transaction
from django.db.models import (
    Sum, Count, Avg, F, Q, Value, ExpressionWrapper,
    DecimalField
)
from django.db.models.functions import (
    TruncDate, TruncHour, TruncWeek, TruncMonth, Coalesce, Extract
)
from django.utils import timezone

# Export functionality imports
from openpyxl.styles import Font, PatternFill, Alignment
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib import colors

from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from .base import BaseReportService
from .timezone_utils import TimezoneUtils

logger = logging.getLogger(__name__)


class SalesReportService(BaseReportService):
    """Service for generating and exporting sales reports."""

    @staticmethod
    @transaction.atomic
    def generate_sales_report(
        start_date: datetime,
        end_date: datetime,
        group_by: str = "day",
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """Generate detailed sales report"""

        cache_key = SalesReportService._generate_cache_key(
            "sales",
            {"start_date": start_date, "end_date": end_date, "group_by": group_by},
        )

        if use_cache:
            cached_data = SalesReportService._get_cached_report(cache_key)
            if cached_data:
                return cached_data

        logger.info(f"Generating sales report for {start_date} to {end_date}")
        logger.info(f"Input start_date timezone: {start_date.tzinfo}")
        logger.info(f"Input end_date timezone: {end_date.tzinfo}")
        start_time = time.time()

        # Base queryset with optimization
        orders_queryset = (
            Order.objects.filter(
                status=Order.OrderStatus.COMPLETED,
                created_at__range=(start_date, end_date),
                subtotal__gt=0,  # Exclude orders with $0.00 subtotals
            )
            .select_related("cashier", "customer", "payment_details")
            .prefetch_related("items__product")
        )

        # Calculate total refunds separately
        total_refunds = (
            PaymentTransaction.objects.select_related("payment", "payment__order")
            .filter(
                payment__order__in=orders_queryset,
                status=PaymentTransaction.TransactionStatus.REFUNDED,
            )
            .aggregate(
                total_refunds=Coalesce(Sum("refunded_amount"), Value(Decimal("0.00")))
            )["total_refunds"]
        )

        # Core sales metrics (WITHOUT items to avoid JOIN duplication)
        sales_data = orders_queryset.aggregate(
            total_revenue=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            total_subtotal=Coalesce(Sum("subtotal"), Value(Decimal("0.00"))),
            total_orders=Count("id"),
            avg_order_value=Coalesce(Avg("grand_total"), Value(Decimal("0.00"))),
            total_tax=Coalesce(Sum("tax_total"), Value(Decimal("0.00"))),
            total_discounts=Coalesce(
                Sum("total_discounts_amount"), Value(Decimal("0.00"))
            ),
        )

        # Calculate payment totals separately to avoid JOIN duplication
        payment_totals = Payment.objects.filter(order__in=orders_queryset).aggregate(
            total_surcharges=Coalesce(Sum("total_surcharges"), Value(Decimal("0.00"))),
            total_tips=Coalesce(Sum("total_tips"), Value(Decimal("0.00"))),
        )

        # Add payment totals to sales_data
        sales_data.update(payment_totals)

        # Convert Decimal to float
        sales_data = {
            k: float(v) if isinstance(v, Decimal) else v for k, v in sales_data.items()
        }

        # Add refunds to the sales data
        sales_data["total_refunds"] = float(total_refunds)
        
        # Calculate net revenue using the centralized method
        sales_data["net_revenue"] = SalesReportService.calculate_net_revenue(
            sales_data["total_subtotal"],
            sales_data["total_tips"],
            sales_data["total_discounts"],
            sales_data["total_refunds"]
        )
        
        # Add detailed revenue breakdown for frontend
        sales_data["revenue_breakdown"] = SalesReportService.get_revenue_breakdown(
            sales_data["total_subtotal"],
            sales_data["total_tips"],
            sales_data["total_discounts"],
            sales_data["total_tax"],
            sales_data["total_surcharges"],
            sales_data["total_refunds"]
        )

        # Calculate total_items separately to avoid ORDER duplication from JOINs
        sales_data["total_items"] = orders_queryset.aggregate(
            total_items=Coalesce(Sum("items__quantity"), Value(0))
        )["total_items"]

        # Sales by period (daily, weekly, or monthly breakdown)
        if group_by == "week":
            trunc_period = TruncWeek("created_at")
        elif group_by == "month":
            trunc_period = TruncMonth("created_at")
        else:
            trunc_period = TruncDate("created_at")

        # Step 1: Aggregate revenue and orders. This is correct as it doesn't involve joins that cause duplication.
        sales_agg = (
            orders_queryset.annotate(period=trunc_period)
            .values("period")
            .annotate(
                revenue=Sum("grand_total"),
                orders=Count("id"),
            )
            .order_by("period")
        )

        # Step 2: Aggregate item quantities separately to avoid inflating the sales/order counts.
        # This query introduces a JOIN on OrderItem, so it's done independently.
        items_agg = (
            orders_queryset.annotate(period=trunc_period)
            .values("period")
            .annotate(items=Sum("items__quantity"))
            .order_by("period")
        )

        # Step 3: Merge the two aggregations in memory for the final result.
        items_dict = {item["period"]: item["items"] for item in items_agg}

        # Get detailed transaction data for each period
        transaction_details_by_period = {}

        for period_item in sales_agg:
            period_start = period_item["period"]

            # Create timezone-aware datetime objects for the period range
            local_tz = TimezoneUtils.get_local_timezone()
            start_dt = timezone.make_aware(
                datetime.combine(period_start, datetime.min.time()), local_tz
            )

            if group_by == "week":
                end_dt = start_dt + timedelta(days=7)
            elif group_by == "month":
                days_in_month = monthrange(start_dt.year, start_dt.month)[1]
                end_dt = start_dt + timedelta(days=days_in_month)
            else:  # day
                end_dt = start_dt + timedelta(days=1)

            # Get transactions for this period using the precise datetime range
            period_transactions = (
                PaymentTransaction.objects.select_related("payment", "payment__order")
                .filter(
                    payment__order__in=orders_queryset,
                    payment__created_at__gte=start_dt,
                    payment__created_at__lt=end_dt,
                    status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
                )
                .select_related("payment", "payment__order")
                .order_by("-payment__created_at")
            )

            # Get payment totals for this period
            period_payments = Payment.objects.filter(
                order__in=orders_queryset,
                created_at__gte=start_dt,
                created_at__lt=end_dt,
            ).aggregate(
                total_tips=Coalesce(Sum("total_tips"), Value(Decimal("0.00"))),
                total_surcharges=Coalesce(
                    Sum("total_surcharges"), Value(Decimal("0.00"))
                ),
                total_collected=Coalesce(
                    Sum("total_collected"), Value(Decimal("0.00"))
                ),
            )

            # Group transactions by payment method
            method_breakdown = {}
            for transaction in period_transactions:
                method = transaction.method
                if method not in method_breakdown:
                    method_breakdown[method] = {
                        "count": 0,
                        "total_amount": 0,
                        "total_tips": 0,
                        "total_surcharges": 0,
                    }
                method_breakdown[method]["count"] += 1
                method_breakdown[method]["total_amount"] += float(
                    transaction.amount or 0
                )
                method_breakdown[method]["total_tips"] += float(transaction.tip or 0)
                method_breakdown[method]["total_surcharges"] += float(
                    transaction.surcharge or 0
                )

            transaction_details_by_period[period_item["period"]] = {
                "transactions": [
                    {
                        "order_number": trans.payment.order.order_number,
                        "created_at": trans.payment.order.created_at.isoformat(),
                        "amount": float(trans.amount or 0),
                        "tip": float(trans.tip or 0),
                        "surcharge": float(trans.surcharge or 0),
                        "method": trans.method,
                        "transaction_id": trans.transaction_id,
                        "card_brand": trans.card_brand,
                        "card_last4": trans.card_last4,
                    }
                    for trans in period_transactions
                ],
                "payment_totals": {
                    "total_tips": float(period_payments["total_tips"]),
                    "total_surcharges": float(period_payments["total_surcharges"]),
                    "total_collected": float(period_payments["total_collected"]),
                },
                "method_breakdown": method_breakdown,
            }

        sales_data["sales_by_period"] = [
            {
                "date": item["period"].strftime("%Y-%m-%d"),
                "revenue": float(item["revenue"] or 0),
                "orders": item["orders"],
                "items": items_dict.get(item["period"], 0) or 0,
                "transaction_details": transaction_details_by_period.get(
                    item["period"],
                    {
                        "transactions": [],
                        "payment_totals": {
                            "total_tips": 0,
                            "total_surcharges": 0,
                            "total_collected": 0,
                        },
                        "method_breakdown": {},
                    },
                ),
            }
            for item in sales_agg
        ]

        # Sales by category
        category_sales = (
            OrderItem.objects.filter(order__in=orders_queryset)
            .values("product__category__name")
            .annotate(
                revenue=Sum(F("quantity") * F("price_at_sale")),
                quantity=Sum("quantity"),
            )
            .order_by("-revenue")
        )

        sales_data["sales_by_category"] = [
            {
                "category": item["product__category__name"] or "Uncategorized",
                "revenue": float(item["revenue"] or 0),
                "quantity": item["quantity"] or 0,
            }
            for item in category_sales
        ]

        # Top performing hours
        hourly_sales = (
            orders_queryset.annotate(hour=Extract("created_at", "hour"))
            .values("hour")
            .annotate(revenue=Sum("grand_total"), orders=Count("id"))
            .order_by("-revenue")[:10]
        )

        sales_data["top_hours"] = [
            {
                "hour": f"{item['hour']:02d}:00",
                "revenue": float(item["revenue"] or 0),
                "orders": item["orders"],
            }
            for item in hourly_sales
        ]

        # Add comprehensive order vs payment reconciliation
        # Calculate what customers actually paid (matching payment processing approach)
        
        # Get all payment transactions for completed, canceled, AND voided orders (matching payments report)
        all_order_transactions = PaymentTransaction.objects.filter(
            payment__order__created_at__range=(start_date, end_date),
            payment__order__status__in=[Order.OrderStatus.COMPLETED, Order.OrderStatus.CANCELLED, Order.OrderStatus.VOID],
            payment__order__subtotal__gt=0
        )
        
        # Debug: Log transaction counts for diagnosis
        total_transactions_debug = all_order_transactions.count()
        logger.debug("Sales report transaction query starting")
        logger.debug("Transaction query completed")
        logger.info(f"Date range: {start_date} to {end_date}")
        
        payment_reconciliation = all_order_transactions.aggregate(
            successful_payments=Coalesce(
                Sum("amount", filter=Q(status=PaymentTransaction.TransactionStatus.SUCCESSFUL)),
                Value(Decimal("0.00"))
            ),
            successful_count=Count("id", filter=Q(status=PaymentTransaction.TransactionStatus.SUCCESSFUL)),
            refunded_payments=Coalesce(
                Sum("amount", filter=Q(status=PaymentTransaction.TransactionStatus.REFUNDED)),
                Value(Decimal("0.00"))
            ),
            refunded_count=Count("id", filter=Q(status=PaymentTransaction.TransactionStatus.REFUNDED)),
            failed_payments=Coalesce(
                Sum("amount", filter=Q(status=PaymentTransaction.TransactionStatus.FAILED)),
                Value(Decimal("0.00"))
            ),
            failed_count=Count("id", filter=Q(status=PaymentTransaction.TransactionStatus.FAILED)),
            canceled_payments=Coalesce(
                Sum("amount", filter=Q(status=PaymentTransaction.TransactionStatus.CANCELED)),
                Value(Decimal("0.00"))
            ),
            canceled_count=Count("id", filter=Q(status=PaymentTransaction.TransactionStatus.CANCELED))
        )
        
        # Payment reconciliation calculated
        logger.debug("Payment reconciliation by status calculated")
        
        # Calculate voided orders total separately
        voided_orders_total = Order.objects.filter(
            status=Order.OrderStatus.VOID,
            created_at__range=(start_date, end_date),
            subtotal__gt=0
        ).aggregate(
            total=Coalesce(Sum("grand_total"), Value(Decimal("0.00")))
        )["total"]
        
        # Calculate comprehensive totals
        total_orders_value = float(sales_data["total_revenue"])  # What customers ordered
        voided_orders_value = float(voided_orders_total or 0)
        total_payment_attempts = float(
            payment_reconciliation["successful_payments"] + 
            payment_reconciliation["refunded_payments"] + 
            payment_reconciliation["failed_payments"] + 
            payment_reconciliation["canceled_payments"]
        )  # What was attempted to be processed
        
        sales_data["order_vs_payment_reconciliation"] = {
            "total_orders_value": total_orders_value,
            "total_payment_attempts": total_payment_attempts,
            "successfully_processed": float(payment_reconciliation["successful_payments"]),
            "voided_orders_value": voided_orders_value,
            "lost_revenue": total_orders_value - total_payment_attempts,
            "order_completion_rate": round((total_payment_attempts / total_orders_value * 100), 2) if total_orders_value > 0 else 0,
            "payment_breakdown": {
                "successful": {
                    "amount": float(payment_reconciliation["successful_payments"]),
                    "count": payment_reconciliation["successful_count"]
                },
                "refunded": {
                    "amount": float(payment_reconciliation["refunded_payments"]),
                    "count": payment_reconciliation["refunded_count"]
                },
                "failed": {
                    "amount": float(payment_reconciliation["failed_payments"]),
                    "count": payment_reconciliation["failed_count"]
                },
                "canceled": {
                    "amount": float(payment_reconciliation["canceled_payments"]),
                    "count": payment_reconciliation["canceled_count"]
                }
            }
        }

        sales_data["generated_at"] = timezone.now().isoformat()
        sales_data["date_range"] = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }

        # Cache the result
        generation_time = time.time() - start_time
        SalesReportService._cache_report(
            cache_key, sales_data, ttl_hours=SalesReportService.CACHE_TTL["sales"]
        )

        logger.info(f"Sales report generated in {generation_time:.2f}s")
        return sales_data

    @staticmethod
    def export_sales_to_csv(report_data: Dict[str, Any]) -> bytes:
        """Export sales report to CSV format."""
        output = io.StringIO()
        writer = csv.writer(output)
        
        SalesReportService._export_sales_to_csv(writer, report_data)
        
        csv_bytes = output.getvalue().encode('utf-8')
        output.close()
        return csv_bytes

    @staticmethod
    def _export_sales_to_csv(writer, report_data: Dict[str, Any]):
        """Export comprehensive sales report to CSV matching the old format"""
        from django.utils import timezone
        from datetime import datetime
        
        # Header
        writer.writerow(["Sales Report"])
        writer.writerow(["Generated:", report_data.get("generated_at", timezone.now().isoformat())])
        
        # Extract date range
        date_range = report_data.get("date_range", {})
        start_str = date_range.get("start", "")
        end_str = date_range.get("end", "")
        
        # Format dates for display (remove time and timezone for cleaner look)
        try:
            start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00')).date()
            end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00')).date()
            writer.writerow([f"Date Range: {start_date} to {end_date}"])
        except:
            writer.writerow([f"Date Range: {start_str} to {end_str}"])
        
        writer.writerow([])
        
        # === FINANCIAL SUMMARY ===
        writer.writerow(["=== FINANCIAL SUMMARY ==="])
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Total Revenue (Collected)", f"${report_data.get('total_revenue', 0):,.2f}"])
        writer.writerow(["Net Revenue", f"${report_data.get('net_revenue', 0):,.2f}"])
        writer.writerow(["Total Orders", f"{report_data.get('total_orders', 0):,}"])
        writer.writerow(["Average Order Value", f"${report_data.get('avg_order_value', 0):,.2f}"])
        writer.writerow(["Total Items Sold", f"{report_data.get('total_items', 0):,}"])
        writer.writerow([])
        
        # === REVENUE BREAKDOWN ===
        writer.writerow(["=== REVENUE BREAKDOWN ==="])
        writer.writerow(["Component", "Amount"])
        writer.writerow(["Subtotal", f"${report_data.get('total_subtotal', 0):,.2f}"])
        writer.writerow(["Tax Collected", f"${report_data.get('total_tax', 0):,.2f}"])
        writer.writerow(["Tips", f"${report_data.get('total_tips', 0):,.2f}"])
        writer.writerow(["Surcharges", f"${report_data.get('total_surcharges', 0):,.2f}"])
        writer.writerow(["Discounts Applied", f"-${report_data.get('total_discounts', 0):,.2f}"])
        writer.writerow([])
        
        # === ORDER DETAILS ===
        writer.writerow(["=== ORDER DETAILS ==="])
        headers = [
            "Order Number", "Date", "Time", "Order Type", "Status", "Payment Status",
            "Payment Method", "Customer Name", "Customer Email", "Customer Phone", 
            "Cashier", "Subtotal", "Tax", "Grand Total", "Tips", "Surcharges", 
            "Total Collected", "Discounts", "Items Count", "Total Quantity"
        ]
        writer.writerow(headers)
        
        # Get individual order details - need to query from the date range
        try:
            start_date_obj = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
            end_date_obj = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
            
            # Query orders for detailed export
            from orders.models import Order
            orders = Order.objects.filter(
                status=Order.OrderStatus.COMPLETED,
                created_at__range=(start_date_obj, end_date_obj),
                subtotal__gt=0
            ).select_related(
                'cashier', 'customer', 'payment_details'
            ).prefetch_related(
                'items__product'
            ).order_by('order_number')
            
            for order in orders:
                # Calculate order metrics
                items_count = order.items.count()
                total_quantity = sum(item.quantity for item in order.items.all())
                
                # Get payment method
                payment_method = "N/A"
                if hasattr(order, 'payment_details') and order.payment_details:
                    transactions = order.payment_details.transactions.filter(
                        status="SUCCESSFUL"
                    ).first()
                    if transactions:
                        method_map = {
                            "CARD_TERMINAL": "Card (Terminal)",
                            "CASH": "Cash",
                            "GIFT_CARD": "Gift Card"
                        }
                        payment_method = method_map.get(transactions.method, transactions.method)
                
                # Customer info using the Order model's built-in method
                customer_name = order.customer_display_name
                customer_email = order.customer_email or ""
                customer_phone = order.customer_phone or ""
                
                # Cashier
                cashier_name = ""
                if order.cashier:
                    cashier_name = f"{order.cashier.first_name} {order.cashier.last_name}".strip()
                
                # Payment details - use safe access
                total_tips = 0
                total_surcharges = 0
                total_collected = 0
                if hasattr(order, 'payment_details') and order.payment_details:
                    total_tips = order.payment_details.total_tips or 0
                    total_surcharges = order.payment_details.total_surcharges or 0
                    total_collected = order.payment_details.total_collected or 0
                
                # Format the order row
                order_row = [
                    order.order_number,
                    order.created_at.strftime("%Y-%m-%d"),
                    order.created_at.strftime("%H:%M:%S"), 
                    order.order_type,
                    order.status,
                    "PAID" if order.payment_status == "PAID" else order.payment_status,
                    payment_method,
                    customer_name,
                    customer_email,
                    customer_phone,
                    cashier_name,
                    f"${order.subtotal:.2f}",
                    f"${order.tax_total:.2f}",
                    f"${order.grand_total:.2f}",
                    f"${total_tips:.2f}",
                    f"${total_surcharges:.2f}",
                    f"${total_collected:.2f}",
                    f"${order.total_discounts_amount:.2f}",
                    items_count,
                    total_quantity
                ]
                writer.writerow(order_row)
                
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to export detailed order data: {e}")
            writer.writerow(["Error: Could not load detailed order data"])

    @staticmethod
    def export_sales_to_xlsx(report_data: Dict[str, Any], ws, header_font, header_fill, header_alignment):
        """Export sales report to Excel format."""
        SalesReportService._export_sales_to_xlsx(ws, report_data, header_font, header_fill, header_alignment)

    @staticmethod
    def _export_sales_to_xlsx(
        ws, report_data: Dict[str, Any], header_font, header_fill, header_alignment
    ):
        """Export sales report to Excel"""
        row = 5

        # Sales summary
        ws.merge_cells(f"A{row}:D{row}")
        ws[f"A{row}"] = "Sales Summary"
        ws[f"A{row}"].font = header_font
        ws[f"A{row}"].fill = header_fill
        ws[f"A{row}"].alignment = header_alignment
        row += 1

        metrics = [
            ("Total Revenue", f"${report_data.get('total_revenue', 0):,.2f}"),
            ("Total Orders", report_data.get("total_orders", 0)),
            (
                "Average Order Value",
                f"${report_data.get('avg_order_value', 0):,.2f}",
            ),
        ]

        for metric, value in metrics:
            ws[f"A{row}"] = metric
            ws[f"B{row}"] = value
            row += 1

    @staticmethod
    def export_sales_to_pdf(report_data: Dict[str, Any], story, styles):
        """Export sales report to PDF format."""
        SalesReportService._export_sales_to_pdf(story, report_data, styles)

    @staticmethod
    def _export_sales_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export sales report to PDF"""
        story.append(Paragraph("Sales Summary", styles["Heading2"]))

        sales_data = [
            ["Metric", "Value"],
            ["Total Revenue", f"${report_data.get('total_revenue', 0):,.2f}"],
            ["Total Orders", str(report_data.get("total_orders", 0))],
            [
                "Average Order Value",
                f"${report_data.get('avg_order_value', 0):,.2f}",
            ],
        ]

        sales_table = Table(sales_data, colWidths=[3 * inch, 2 * inch])
        sales_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ]
            )
        )

        story.append(sales_table)