"""
Summary report service with generation functionality.
Refactored from the original monolithic service into a focused, modular component.
"""
import time
import logging
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, Any

from django.db import transaction
from django.db.models import (
    Sum, Count, F, Q, Value,
    DecimalField, DateTimeField
)
from django.db.models.functions import Extract, Cast, Coalesce
from django.utils import timezone

from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from .base import BaseReportService
from .timezone_utils import TimezoneUtils

logger = logging.getLogger(__name__)


class SummaryReportService(BaseReportService):
    """Service for generating summary dashboard reports."""

    @staticmethod
    @transaction.atomic
    def generate_summary_report(
        tenant,
        start_date: datetime,
        end_date: datetime,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """Generate comprehensive summary report for dashboard"""

        cache_key = SummaryReportService._generate_cache_key(
            "summary",
            {"start_date": start_date, "end_date": end_date},
        )

        if use_cache:
            cached_data = SummaryReportService._get_cached_report(cache_key, tenant)
            if cached_data:
                return cached_data

        logger.info(f"Generating summary report for {start_date} to {end_date}")
        start_time = time.time()

        # Get base data
        orders_queryset = SummaryReportService._get_base_orders_queryset(tenant, start_date, end_date)

        # Calculate core metrics
        summary_data = SummaryReportService._calculate_core_summary_metrics(orders_queryset)

        # Add growth metrics
        summary_data.update(SummaryReportService._calculate_growth_metrics(tenant, start_date, end_date, summary_data))

        # Add detailed breakdowns
        summary_data.update(SummaryReportService._calculate_product_metrics(orders_queryset))
        summary_data.update(SummaryReportService._calculate_sales_trend(orders_queryset))
        summary_data.update(SummaryReportService._calculate_payment_distribution(orders_queryset))
        summary_data.update(SummaryReportService._calculate_hourly_performance(orders_queryset))

        # Add metadata
        summary_data["generated_at"] = timezone.now().isoformat()
        summary_data["date_range"] = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }

        # Cache the result
        generation_time = time.time() - start_time
        SummaryReportService._cache_report(
            cache_key, summary_data, tenant, report_type="summary", ttl_hours=SummaryReportService.CACHE_TTL["summary"]
        )

        logger.info(f"Summary report generated in {generation_time:.2f}s")
        return summary_data

    @staticmethod
    def _get_base_orders_queryset(tenant, start_date: datetime, end_date: datetime):
        """Get optimized base queryset for completed orders in date range."""
        return (
            Order.objects.filter(
                tenant=tenant,
                status=Order.OrderStatus.COMPLETED,
                created_at__range=(start_date, end_date),
                subtotal__gt=0,  # Exclude orders with $0.00 subtotals
            )
            .select_related("cashier", "customer")
            .prefetch_related("items__product")
        )

    @staticmethod
    def _calculate_core_summary_metrics(orders_queryset) -> Dict[str, Any]:
        """Calculate core summary metrics from orders queryset."""

        # Core order metrics (WITHOUT items to avoid JOIN duplication)
        order_data = orders_queryset.aggregate(
            total_transactions=Count("id"),
            total_tax=Coalesce(Sum("tax_total"), Value(Decimal("0.00"))),
            total_discounts=Coalesce(
                Sum("total_discounts_amount"), Value(Decimal("0.00"))
            ),
        )

        # Calculate payment totals for revenue - matches sales service approach
        payment_totals = Payment.objects.filter(order__in=orders_queryset).aggregate(
            total_sales=Coalesce(Sum("total_collected"), Value(Decimal("0.00"))),  # PRIMARY metric - matches sales service
        )

        # Merge order and payment data
        summary_data = {**order_data, **payment_totals}

        # Convert Decimal to float for JSON serialization
        summary_data = {
            k: float(v) if isinstance(v, Decimal) else v
            for k, v in summary_data.items()
        }

        # Calculate total_items separately to avoid ORDER duplication from JOINs
        summary_data["total_items"] = orders_queryset.aggregate(
            total_items=Coalesce(Sum("items__quantity"), Value(0))
        )["total_items"]

        # Calculate average ticket using the correct revenue metric
        summary_data["average_ticket"] = (
            summary_data["total_sales"] / summary_data["total_transactions"]
            if summary_data["total_transactions"] > 0
            else 0
        )

        return summary_data

    @staticmethod
    def _calculate_growth_metrics(tenant, start_date: datetime, end_date: datetime, current_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate growth metrics compared to previous period."""

        # Calculate previous period
        previous_period_days = (end_date - start_date).days
        previous_start = start_date - timedelta(days=previous_period_days)
        previous_end = start_date

        previous_data = Order.objects.filter(
            tenant=tenant,
            status=Order.OrderStatus.COMPLETED,
            created_at__range=(previous_start, previous_end),
            subtotal__gt=0,
        ).aggregate(
            prev_sales=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            prev_transactions=Count("id"),
        )

        growth_data = {}

        # Calculate growth percentages
        if previous_data["prev_sales"] > 0:
            growth_data["sales_growth"] = round(
                (
                    (current_data["total_sales"] - float(previous_data["prev_sales"]))
                    / float(previous_data["prev_sales"])
                )
                * 100,
                2,
            )
        else:
            growth_data["sales_growth"] = 0

        if previous_data["prev_transactions"] > 0:
            growth_data["transaction_growth"] = round(
                (
                    (current_data["total_transactions"] - previous_data["prev_transactions"])
                    / previous_data["prev_transactions"]
                )
                * 100,
                2,
            )
        else:
            growth_data["transaction_growth"] = 0

        return growth_data

    @staticmethod
    def _calculate_product_metrics(orders_queryset) -> Dict[str, Any]:
        """Calculate product-related metrics."""
        
        # Top product by quantity (single product)
        top_product = (
            OrderItem.objects.filter(order__in=orders_queryset)
            .values("product__name")
            .annotate(total_sold=Sum("quantity"))
            .order_by("-total_sold")
            .first()
        )

        # Top products by revenue (for charts)
        top_products_by_revenue = (
            OrderItem.objects.filter(order__in=orders_queryset)
            .values("product__name", "product__id")
            .annotate(
                revenue=Sum(F("quantity") * F("price_at_sale")),
                quantity_sold=Sum("quantity"),
            )
            .order_by("-revenue")[:5]
        )

        return {
            "top_product": top_product["product__name"] if top_product else "N/A",
            "top_products_by_revenue": [
                {
                    "name": item["product__name"],
                    "revenue": float(item["revenue"] or 0),
                    "quantity": item["quantity_sold"] or 0,
                }
                for item in top_products_by_revenue
            ]
        }

    @staticmethod
    def _calculate_sales_trend(orders_queryset) -> Dict[str, Any]:
        """Calculate daily sales trend data."""
        
        # Use timezone-aware date truncation
        local_tz = TimezoneUtils.get_local_timezone()
        
        daily_sales = (
            orders_queryset.annotate(
                date=SummaryReportService._trunc_date_local("created_at")
            )
            .values("date")
            .annotate(sales=Sum("grand_total"), transactions=Count("id"))
            .order_by("date")
        )

        return {
            "sales_trend": [
                {
                    "date": item["date"].strftime("%Y-%m-%d"),
                    "sales": float(item["sales"] or 0),
                    "transactions": item["transactions"],
                }
                for item in daily_sales
            ]
        }

    @staticmethod
    def _trunc_date_local(field_name):
        """Truncate datetime field to date in local timezone."""
        local_tz = TimezoneUtils.get_local_timezone()
        from django.db.models.functions import TruncDate
        return TruncDate(Cast(field_name, DateTimeField()), tzinfo=local_tz)

    @staticmethod
    def _calculate_payment_distribution(orders_queryset) -> Dict[str, Any]:
        """Calculate payment method distribution."""
        
        payment_methods = (
            PaymentTransaction.objects.filter(
                payment__order__in=orders_queryset,
            )
            .values("method")
            .annotate(
                amount=Sum("amount"),
                count=Count("id"),
            )
            .order_by("-amount")
        )

        total_payment_amount = sum(float(pm["amount"] or 0) for pm in payment_methods)

        return {
            "payment_distribution": [
                {
                    "method": item["method"],
                    "amount": float(item["amount"] or 0),
                    "count": item["count"],
                    "percentage": (
                        round((float(item["amount"] or 0) / total_payment_amount * 100), 2)
                        if total_payment_amount > 0
                        else 0
                    ),
                }
                for item in payment_methods
            ]
        }

    @staticmethod
    def _calculate_hourly_performance(orders_queryset) -> Dict[str, Any]:
        """Calculate hourly performance data."""
        
        hourly_data = (
            orders_queryset.annotate(hour=Extract("created_at", "hour"))
            .values("hour")
            .annotate(sales=Sum("grand_total"), orders=Count("id"))
            .order_by("hour")
        )

        return {
            "hourly_performance": [
                {
                    "hour": f"{item['hour']:02d}:00",
                    "sales": float(item["sales"] or 0),
                    "orders": item["orders"],
                }
                for item in hourly_data
            ]
        }

    @staticmethod
    def get_quick_metrics() -> Dict[str, Any]:
        """Get today/MTD/YTD metrics for dashboard."""
        
        # Use the same approach as sales service - get local timezone and make timezone-aware datetimes
        local_tz = TimezoneUtils.get_local_timezone()
        now_local = timezone.now().astimezone(local_tz)
        now = timezone.now()

        # Today: start of day in business timezone (same as sales service approach)
        today_start = timezone.make_aware(
            datetime.combine(now_local.date(), datetime.min.time()), local_tz
        )

        # Month to date: first day of month in business timezone
        mtd_start = timezone.make_aware(
            datetime.combine(now_local.replace(day=1).date(), datetime.min.time()), local_tz
        )

        # Year to date: first day of year in business timezone
        ytd_start = timezone.make_aware(
            datetime.combine(now_local.replace(month=1, day=1).date(), datetime.min.time()), local_tz
        )


        return {
            "today": SummaryReportService._get_metrics_for_period(today_start, now),
            "month_to_date": SummaryReportService._get_metrics_for_period(mtd_start, now),
            "year_to_date": SummaryReportService._get_metrics_for_period(ytd_start, now),
            "generated_at": timezone.now().isoformat(),
        }

    @staticmethod
    def _get_metrics_for_period(start_time: datetime, end_time: datetime) -> Dict[str, Any]:
        """Get comprehensive metrics for a specific time period."""
        
        # Get order-level metrics WITHOUT JOINs to avoid duplication
        orders_queryset = Order.objects.filter(
            status=Order.OrderStatus.COMPLETED,
            created_at__range=(start_time, end_time),
            subtotal__gt=0,  # Exclude orders with $0.00 subtotals
        )
        
        orders = orders_queryset.aggregate(
            total_sales=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            total_subtotal=Coalesce(Sum("subtotal"), Value(Decimal("0.00"))),
            total_discounts=Coalesce(Sum("total_discounts_amount"), Value(Decimal("0.00"))),
            total_orders=Count("id"),
        )
        
        # Calculate payment totals for tips and collected amounts - this matches sales service approach
        payment_totals = Payment.objects.filter(order__in=orders_queryset).aggregate(
            total_revenue=Coalesce(Sum("total_collected"), Value(Decimal("0.00"))),  # PRIMARY metric - matches sales service
            total_tips=Coalesce(Sum("total_tips"), Value(Decimal("0.00"))),
        )

        # Calculate total items separately to avoid JOIN duplication
        total_items = OrderItem.objects.filter(
            order__status=Order.OrderStatus.COMPLETED,
            order__created_at__range=(start_time, end_time),
            order__subtotal__gt=0,
        ).aggregate(total_items=Coalesce(Sum("quantity"), Value(0)))["total_items"]

        total_orders_value = float(orders["total_sales"] or 0)
        total_revenue = float(payment_totals["total_revenue"] or 0)
        
        # Calculate net revenue: subtotal + tips - discounts (excludes tax/surcharges)
        net_revenue = (
            float(orders["total_subtotal"] or 0) + 
            float(payment_totals["total_tips"] or 0) - 
            float(orders["total_discounts"] or 0)
        )

        return {
            "sales": total_revenue,  # Backward compatibility - now using total_collected like sales service
            "gross_revenue": total_revenue,  # PRIMARY metric - matches sales service approach
            "net_revenue": net_revenue,
            "orders": orders["total_orders"] or 0,
            "items": total_items or 0,
            "avg_order_value": (
                total_revenue / (orders["total_orders"] or 1)
                if orders["total_orders"] > 0
                else 0
            ),
            "subtotal": float(orders["total_subtotal"] or 0),
            "tips": float(payment_totals["total_tips"] or 0),
            "discounts": float(orders["total_discounts"] or 0),
            "date_range": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat(),
            },
        }