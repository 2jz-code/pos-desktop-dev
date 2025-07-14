import time
import hashlib
import json
import logging
import csv
import io
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from django.db import transaction
from django.db.models import (
    Sum,
    Count,
    Avg,
    F,
    Q,
    Max,
    Min,
    ExpressionWrapper,
    DecimalField,
    Value,
)
from django.db.models.functions import TruncDate, TruncHour, Extract, Coalesce
from django.utils import timezone
from django.conf import settings
import pytz
from django.core.cache import cache

# Export functionality imports
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from products.models import Product, Category
from users.models import User
from .models import ReportCache, SavedReport, ReportExecution

logger = logging.getLogger(__name__)


class ReportService:
    """Central service for all report operations following existing patterns"""

    # Cache TTL in hours for different report types
    CACHE_TTL = {
        "summary": 1,
        "sales": 2,
        "products": 4,
        "payments": 2,
        "operations": 1,
    }

    @staticmethod
    def get_local_timezone():
        """Get the configured local timezone"""
        return pytz.timezone(settings.TIME_ZONE)

    @staticmethod
    def trunc_date_local(field_name):
        """Truncate date field to local timezone instead of UTC"""
        from django.db.models import DateTimeField
        from django.db.models.functions import Cast
        
        # Convert to local timezone, then truncate to date
        local_tz = ReportService.get_local_timezone()
        return TruncDate(
            Cast(field_name, DateTimeField()),
            tzinfo=local_tz
        )

    @staticmethod
    @transaction.atomic
    def generate_summary_report(
        start_date: datetime, end_date: datetime, use_cache: bool = True
    ) -> Dict[str, Any]:
        """Generate summary report with intelligent caching"""

        # Generate cache key
        cache_key = ReportService._generate_cache_key(
            "summary", {"start_date": start_date, "end_date": end_date}
        )

        # Check cache first
        if use_cache:
            cached_data = ReportService._get_cached_report(cache_key)
            if cached_data:
                logger.info(f"Summary report served from cache: {cache_key[:8]}...")
                return cached_data

        logger.info(f"Generating summary report for {start_date} to {end_date}")
        start_time = time.time()

        # Base queryset with optimization
        orders_queryset = (
            Order.objects.filter(
                status=Order.OrderStatus.COMPLETED,
                created_at__range=(start_date, end_date),
            )
            .select_related("cashier", "customer")
            .prefetch_related("items__product")
        )

        # Core metrics aggregation (WITHOUT items to avoid JOIN duplication)
        summary_data = orders_queryset.aggregate(
            total_sales=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            total_transactions=Count("id"),
            total_tax=Coalesce(Sum("tax_total"), Value(Decimal("0.00"))),
            total_discounts=Coalesce(
                Sum("total_discounts_amount"), Value(Decimal("0.00"))
            ),
        )

        # Convert Decimal to float for JSON serialization
        summary_data = {
            k: float(v) if isinstance(v, Decimal) else v
            for k, v in summary_data.items()
        }

        # Calculate total_items separately to avoid ORDER duplication from JOINs
        summary_data["total_items"] = orders_queryset.aggregate(
            total_items=Coalesce(Sum("items__quantity"), Value(0))
        )["total_items"]

        # Calculate average ticket
        summary_data["average_ticket"] = (
            summary_data["total_sales"] / summary_data["total_transactions"]
            if summary_data["total_transactions"] > 0
            else 0
        )

        # Growth metrics (compare with previous period)
        previous_period_days = (end_date - start_date).days
        previous_start = start_date - timedelta(days=previous_period_days)
        previous_end = start_date

        previous_data = Order.objects.filter(
            status=Order.OrderStatus.COMPLETED,
            created_at__range=(previous_start, previous_end),
        ).aggregate(
            prev_sales=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            prev_transactions=Count("id"),
        )

        # Calculate growth percentages
        if previous_data["prev_sales"] > 0:
            summary_data["sales_growth"] = round(
                (
                    (summary_data["total_sales"] - float(previous_data["prev_sales"]))
                    / float(previous_data["prev_sales"])
                )
                * 100,
                2,
            )
        else:
            summary_data["sales_growth"] = 0

        if previous_data["prev_transactions"] > 0:
            summary_data["transaction_growth"] = round(
                (
                    (
                        summary_data["total_transactions"]
                        - previous_data["prev_transactions"]
                    )
                    / previous_data["prev_transactions"]
                )
                * 100,
                2,
            )
        else:
            summary_data["transaction_growth"] = 0

        # Top product calculation (single product by quantity)
        top_product = (
            OrderItem.objects.filter(order__in=orders_queryset)
            .values("product__name")
            .annotate(total_sold=Sum("quantity"))
            .order_by("-total_sold")
            .first()
        )

        summary_data["top_product"] = (
            top_product["product__name"] if top_product else "N/A"
        )

        # Top products by revenue (for charts)
        top_products_by_revenue = (
            OrderItem.objects.filter(order__in=orders_queryset)
            .values("product__name", "product__id")
            .annotate(
                revenue=Sum(F("quantity") * F("price_at_sale")),
                quantity_sold=Sum("quantity")
            )
            .order_by("-revenue")[:5]
        )

        summary_data["top_products_by_revenue"] = [
            {
                "name": item["product__name"],
                "revenue": float(item["revenue"] or 0),
                "quantity": item["quantity_sold"] or 0,
            }
            for item in top_products_by_revenue
        ]

        # Sales trend data (daily breakdown)
        daily_sales = (
            orders_queryset.annotate(date=ReportService.trunc_date_local("created_at"))
            .values("date")
            .annotate(sales=Sum("grand_total"), transactions=Count("id"))
            .order_by("date")
        )

        summary_data["sales_trend"] = [
            {
                "date": item["date"].strftime("%Y-%m-%d"),
                "sales": float(item["sales"] or 0),
                "transactions": item["transactions"],
            }
            for item in daily_sales
        ]

        # Payment method distribution (include tips and surcharges for consistency)
        payment_methods = (
            PaymentTransaction.objects.filter(
                payment__order__in=orders_queryset,
                status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
            )
            .values("method")
            .annotate(amount=Sum(F("amount") + F("tip") + F("surcharge")), count=Count("id"))
            .order_by("-amount")
        )

        total_payment_amount = sum(float(pm["amount"] or 0) for pm in payment_methods)

        summary_data["payment_distribution"] = [
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

        # Hourly performance
        hourly_data = (
            orders_queryset.annotate(hour=Extract("created_at", "hour"))
            .values("hour")
            .annotate(sales=Sum("grand_total"), orders=Count("id"))
            .order_by("hour")
        )

        summary_data["hourly_performance"] = [
            {
                "hour": f"{item['hour']:02d}:00",
                "sales": float(item["sales"] or 0),
                "orders": item["orders"],
            }
            for item in hourly_data
        ]

        # Add metadata
        summary_data["generated_at"] = timezone.now().isoformat()
        summary_data["date_range"] = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }

        # Cache the result
        generation_time = time.time() - start_time
        ReportService._cache_report(
            cache_key, summary_data, ttl_hours=ReportService.CACHE_TTL["summary"]
        )

        logger.info(f"Summary report generated in {generation_time:.2f}s")
        return summary_data

    @staticmethod
    @transaction.atomic
    def generate_sales_report(
        start_date: datetime, end_date: datetime, use_cache: bool = True
    ) -> Dict[str, Any]:
        """Generate detailed sales report"""

        cache_key = ReportService._generate_cache_key(
            "sales", {"start_date": start_date, "end_date": end_date}
        )

        if use_cache:
            cached_data = ReportService._get_cached_report(cache_key)
            if cached_data:
                return cached_data

        logger.info(f"Generating sales report for {start_date} to {end_date}")
        start_time = time.time()

        # Base queryset with optimization
        orders_queryset = (
            Order.objects.filter(
                status=Order.OrderStatus.COMPLETED,
                created_at__range=(start_date, end_date),
            )
            .select_related("cashier", "customer")
            .prefetch_related("items__product")
        )

        # Core sales metrics (WITHOUT items to avoid JOIN duplication)
        sales_data = orders_queryset.aggregate(
            total_revenue=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            total_orders=Count("id"),
            avg_order_value=Coalesce(Avg("grand_total"), Value(Decimal("0.00"))),
            total_tax=Coalesce(Sum("tax_total"), Value(Decimal("0.00"))),
            total_discounts=Coalesce(
                Sum("total_discounts_amount"), Value(Decimal("0.00"))
            ),
        )

        # Convert Decimal to float
        sales_data = {
            k: float(v) if isinstance(v, Decimal) else v for k, v in sales_data.items()
        }

        # Calculate total_items separately to avoid ORDER duplication from JOINs
        sales_data["total_items"] = orders_queryset.aggregate(
            total_items=Coalesce(Sum("items__quantity"), Value(0))
        )["total_items"]

        # Sales by period (daily breakdown) - match summary report pattern exactly
        daily_sales = (
            orders_queryset.annotate(date=ReportService.trunc_date_local("created_at"))
            .values("date")
            .annotate(revenue=Sum("grand_total"), orders=Count("id"))
            .order_by("date")
        )

        sales_data["sales_by_period"] = [
            {
                "date": item["date"].strftime("%Y-%m-%d"),
                "revenue": float(item["revenue"] or 0),
                "orders": item["orders"],
                "items": 0,  # Remove items calculation to avoid JOIN issues
            }
            for item in daily_sales
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

        # Add metadata
        sales_data["generated_at"] = timezone.now().isoformat()
        sales_data["date_range"] = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }

        # Cache the result
        generation_time = time.time() - start_time
        ReportService._cache_report(
            cache_key, sales_data, ttl_hours=ReportService.CACHE_TTL["sales"]
        )

        logger.info(f"Sales report generated in {generation_time:.2f}s")
        return sales_data

    @staticmethod
    @transaction.atomic
    def generate_products_report(
        start_date: datetime,
        end_date: datetime,
        category_id: Optional[int] = None,
        limit: int = 10,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """Generate product performance report"""

        cache_key = ReportService._generate_cache_key(
            "products",
            {
                "start_date": start_date,
                "end_date": end_date,
                "category_id": category_id,
                "limit": limit,
            },
        )

        if use_cache:
            cached_data = ReportService._get_cached_report(cache_key)
            if cached_data:
                return cached_data

        logger.info(f"Generating products report for {start_date} to {end_date}")
        start_time = time.time()

        # Base queryset
        order_items = OrderItem.objects.filter(
            order__status=Order.OrderStatus.COMPLETED,
            order__created_at__range=(start_date, end_date),
        ).select_related("product", "product__category")

        # Filter by category if specified
        if category_id:
            order_items = order_items.filter(product__category_id=category_id)

        # Top products by revenue
        top_products = (
            order_items.annotate(revenue=F("quantity") * F("price_at_sale"))
            .values("product__name", "product__id")
            .annotate(
                total_revenue=Sum("revenue"),
                total_sold=Sum("quantity"),
                avg_price=Avg("price_at_sale"),
            )
            .order_by("-total_revenue")[:limit]
        )

        products_data = {
            "top_products": [
                {
                    "name": item["product__name"],
                    "id": item["product__id"],
                    "revenue": float(item["total_revenue"] or 0),
                    "sold": item["total_sold"],
                    "avg_price": float(item["avg_price"] or 0),
                }
                for item in top_products
            ]
        }

        # Best sellers by quantity
        best_sellers = (
            order_items.values("product__name", "product__id")
            .annotate(
                total_sold=Sum("quantity"),
                total_revenue=Sum(F("quantity") * F("price_at_sale")),
            )
            .order_by("-total_sold")[:limit]
        )

        products_data["best_sellers"] = [
            {
                "name": item["product__name"],
                "id": item["product__id"],
                "sold": item["total_sold"],
                "revenue": float(item["total_revenue"] or 0),
            }
            for item in best_sellers
        ]

        # Category performance
        category_performance = (
            order_items.values("product__category__name")
            .annotate(
                revenue=Sum(F("quantity") * F("price_at_sale")),
                units_sold=Sum("quantity"),
                unique_products=Count("product__id", distinct=True),
            )
            .order_by("-revenue")
        )

        products_data["category_performance"] = [
            {
                "category": item["product__category__name"] or "Uncategorized",
                "revenue": float(item["revenue"] or 0),
                "units_sold": item["units_sold"] or 0,
                "unique_products": item["unique_products"],
            }
            for item in category_performance
        ]

        # Product trends (weekly if date range > 7 days, otherwise daily)
        date_diff = (end_date - start_date).days
        if date_diff > 7:
            # Weekly trends for longer periods
            product_trends = (
                order_items.filter(
                    product__in=[p["product__id"] for p in top_products[:5]]
                )
                .annotate(week=ReportService.trunc_date_local("order__created_at"))
                .values("product__name", "week")
                .annotate(sold=Sum("quantity"))
                .order_by("week")
            )
        else:
            # Daily trends for shorter periods
            product_trends = (
                order_items.filter(
                    product__in=[p["product__id"] for p in top_products[:5]]
                )
                .annotate(date=ReportService.trunc_date_local("order__created_at"))
                .values("product__name", "date")
                .annotate(sold=Sum("quantity"))
                .order_by("date")
            )

        # Group trends by product
        trends_by_product = {}
        for trend in product_trends:
            product_name = trend["product__name"]
            if product_name not in trends_by_product:
                trends_by_product[product_name] = []

            date_key = "week" if date_diff > 7 else "date"
            trends_by_product[product_name].append(
                {"date": trend[date_key].strftime("%Y-%m-%d"), "sold": trend["sold"]}
            )

        products_data["product_trends"] = trends_by_product

        # Summary stats
        products_data["summary"] = {
            "total_products": order_items.values("product__id").distinct().count(),
            "total_revenue": float(
                order_items.aggregate(total=Sum(F("quantity") * F("price_at_sale")))[
                    "total"
                ]
                or 0
            ),
            "total_units_sold": order_items.aggregate(total=Sum("quantity"))["total"]
            or 0,
        }

        # Add metadata
        products_data["generated_at"] = timezone.now().isoformat()
        products_data["date_range"] = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }
        products_data["filters"] = {"category_id": category_id, "limit": limit}

        # Cache the result
        generation_time = time.time() - start_time
        ReportService._cache_report(
            cache_key, products_data, ttl_hours=ReportService.CACHE_TTL["products"]
        )

        logger.info(f"Products report generated in {generation_time:.2f}s")
        return products_data

    @staticmethod
    @transaction.atomic
    def generate_payments_report(
        start_date: datetime, end_date: datetime, use_cache: bool = True
    ) -> Dict[str, Any]:
        """Generate payment methods report"""

        cache_key = ReportService._generate_cache_key(
            "payments", {"start_date": start_date, "end_date": end_date}
        )

        if use_cache:
            cached_data = ReportService._get_cached_report(cache_key)
            if cached_data:
                return cached_data

        logger.info(f"Generating payments report for {start_date} to {end_date}")
        start_time = time.time()

        # Base queryset for successful transactions
        transactions = PaymentTransaction.objects.filter(
            payment__order__status=Order.OrderStatus.COMPLETED,
            payment__order__created_at__range=(start_date, end_date),
            status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
        ).select_related("payment", "payment__order")

        # Payment method breakdown (include tips and surcharges for accurate totals)
        payment_methods = (
            transactions.values("method")
            .annotate(
                total_amount=Sum(F("amount") + F("tip") + F("surcharge")),
                transaction_count=Count("id"),
                avg_amount=Avg(F("amount") + F("tip") + F("surcharge")),
                processing_fees=Sum(F("surcharge")),  # Surcharge represents processing fees
            )
            .order_by("-total_amount")
        )

        total_amount = sum(float(pm["total_amount"] or 0) for pm in payment_methods)

        # Calculate trends by comparing with previous period
        previous_period_days = (end_date - start_date).days
        previous_start = start_date - timedelta(days=previous_period_days)
        previous_end = start_date

        previous_payment_methods = (
            PaymentTransaction.objects.filter(
                payment__order__status=Order.OrderStatus.COMPLETED,
                payment__order__created_at__range=(previous_start, previous_end),
                status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
            )
            .values("method")
            .annotate(
                total_amount=Sum(F("amount") + F("tip") + F("surcharge")),
            )
        )

        # Create lookup dict for previous period data
        previous_amounts = {
            item["method"]: float(item["total_amount"] or 0)
            for item in previous_payment_methods
        }

        payments_data = {
            "payment_methods": [
                {
                    "method": item["method"],
                    "amount": float(item["total_amount"] or 0),
                    "count": item["transaction_count"],
                    "avg_amount": float(item["avg_amount"] or 0),
                    "processing_fees": float(item["processing_fees"] or 0),
                    "percentage": (
                        round(
                            (float(item["total_amount"] or 0) / total_amount * 100), 2
                        )
                        if total_amount > 0
                        else 0
                    ),
                    "trend": (
                        round(
                            (
                                (float(item["total_amount"] or 0) - previous_amounts.get(item["method"], 0))
                                / previous_amounts.get(item["method"], 1)
                            )
                            * 100,
                            2,
                        )
                        if previous_amounts.get(item["method"], 0) > 0
                        else 0
                    ),
                }
                for item in payment_methods
            ]
        }

        # Transaction volume by day (include tips and surcharges)
        daily_transactions = (
            transactions.annotate(date=ReportService.trunc_date_local("created_at"))
            .values("date")
            .annotate(amount=Sum(F("amount") + F("tip") + F("surcharge")), count=Count("id"))
            .order_by("date")
        )

        payments_data["daily_volume"] = [
            {
                "date": item["date"].strftime("%Y-%m-%d"),
                "amount": float(item["amount"] or 0),
                "count": item["count"],
            }
            for item in daily_transactions
        ]

        # Daily breakdown by payment method (include tips and surcharges)
        daily_by_method = (
            transactions.annotate(date=ReportService.trunc_date_local("created_at"))
            .values("date", "method")
            .annotate(amount=Sum(F("amount") + F("tip") + F("surcharge")), count=Count("id"))
            .order_by("date", "method")
        )

        # Group by date for easier frontend consumption
        daily_breakdown = {}
        for item in daily_by_method:
            date_str = item["date"].strftime("%Y-%m-%d")
            if date_str not in daily_breakdown:
                daily_breakdown[date_str] = {
                    "date": date_str,
                    "total": 0,
                }
            
            method_key = item["method"].lower().replace("_", "")
            daily_breakdown[date_str][method_key] = float(item["amount"] or 0)
            daily_breakdown[date_str]["total"] += float(item["amount"] or 0)

        payments_data["daily_breakdown"] = list(daily_breakdown.values())

        # Add total from order grand_totals for comparison with summary report
        completed_orders = Order.objects.filter(
            status=Order.OrderStatus.COMPLETED,
            created_at__range=(start_date, end_date),
        ).aggregate(
            order_total=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
            order_count=Count("id"),
        )

        payments_data["order_totals_comparison"] = {
            "order_grand_total": float(completed_orders["order_total"] or 0),
            "order_count": completed_orders["order_count"],
            "payment_transaction_total": total_amount,
            "difference": float(completed_orders["order_total"] or 0) - total_amount,
        }

        # Processing statistics
        all_transactions = PaymentTransaction.objects.filter(
            payment__order__created_at__range=(start_date, end_date)
        )

        processing_stats = all_transactions.aggregate(
            total_attempts=Count("id"),
            successful=Count(
                "id", filter=Q(status=PaymentTransaction.TransactionStatus.SUCCESSFUL)
            ),
            failed=Count(
                "id", filter=Q(status=PaymentTransaction.TransactionStatus.FAILED)
            ),
            refunded=Count(
                "id", filter=Q(status=PaymentTransaction.TransactionStatus.REFUNDED)
            ),
        )

        success_rate = (
            (processing_stats["successful"] / processing_stats["total_attempts"]) * 100
            if processing_stats["total_attempts"] > 0
            else 0
        )

        payments_data["processing_stats"] = {
            "total_attempts": processing_stats["total_attempts"],
            "successful": processing_stats["successful"],
            "failed": processing_stats["failed"],
            "refunded": processing_stats["refunded"],
            "success_rate": round(success_rate, 2),
        }

        # Add metadata
        payments_data["generated_at"] = timezone.now().isoformat()
        payments_data["date_range"] = {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }

        # Cache the result
        generation_time = time.time() - start_time
        ReportService._cache_report(
            cache_key, payments_data, ttl_hours=ReportService.CACHE_TTL["payments"]
        )

        logger.info(f"Payments report generated in {generation_time:.2f}s")
        return payments_data

    @staticmethod
    @transaction.atomic
    def generate_operations_report(
        start_date: datetime, end_date: datetime, use_cache: bool = True
    ) -> Dict[str, Any]:
        """Generate operations report"""

        cache_key = ReportService._generate_cache_key(
            "operations", {"start_date": start_date, "end_date": end_date}
        )

        if use_cache:
            cached_data = ReportService._get_cached_report(cache_key)
            if cached_data:
                return cached_data

        logger.info(f"Generating operations report for {start_date} to {end_date}")
        start_time = time.time()

        # Base queryset
        orders = Order.objects.filter(
            status=Order.OrderStatus.COMPLETED, created_at__range=(start_date, end_date)
        ).select_related("cashier")

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
            orders.annotate(date=ReportService.trunc_date_local("created_at"))
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

        # Cache the result
        generation_time = time.time() - start_time
        ReportService._cache_report(
            cache_key, operations_data, ttl_hours=ReportService.CACHE_TTL["operations"]
        )

        logger.info(f"Operations report generated in {generation_time:.2f}s")
        return operations_data

    @staticmethod
    def _generate_cache_key(report_type: str, parameters: Dict[str, Any]) -> str:
        """Generate consistent cache keys"""
        # Sort parameters for consistent hashing
        sorted_params = json.dumps(parameters, sort_keys=True, default=str)
        hash_input = f"{report_type}:{sorted_params}"
        return hashlib.sha256(hash_input.encode()).hexdigest()

    @staticmethod
    def _get_cached_report(cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached report if valid"""
        try:
            cached = ReportCache.objects.get(
                parameters_hash=cache_key, expires_at__gt=timezone.now()
            )
            return cached.data
        except ReportCache.DoesNotExist:
            return None

    @staticmethod
    def _cache_report(cache_key: str, data: Dict[str, Any], ttl_hours: int = 1) -> None:
        """Cache report data with TTL"""
        expires_at = timezone.now() + timedelta(hours=ttl_hours)

        # Extract report type from data or use default
        report_type = data.get("report_type", "unknown")

        # Get the parameters from cache key (simplified)
        parameters = {"cached_at": timezone.now().isoformat()}

        try:
            ReportCache.objects.update_or_create(
                parameters_hash=cache_key,
                defaults={
                    "report_type": report_type,
                    "parameters": parameters,
                    "data": data,
                    "expires_at": expires_at,
                    "generated_at": timezone.now(),
                },
            )
            logger.info(f"Report cached: {cache_key[:8]}... (expires in {ttl_hours}h)")
        except Exception as e:
            logger.error(f"Failed to cache report: {e}")

    @staticmethod
    def cleanup_expired_cache() -> int:
        """Remove expired cache entries"""
        deleted_count = ReportCache.objects.filter(
            expires_at__lt=timezone.now()
        ).delete()[0]

        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} expired cache entries")

        return deleted_count

    @staticmethod
    def invalidate_cache_for_report_type(report_type: str) -> int:
        """Invalidate all cache entries for a specific report type"""
        deleted_count = ReportCache.objects.filter(report_type=report_type).delete()[0]

        if deleted_count > 0:
            logger.info(f"Invalidated {deleted_count} cache entries for {report_type}")

        return deleted_count

    @staticmethod
    def get_cache_stats() -> Dict[str, Any]:
        """Get cache statistics"""
        total_entries = ReportCache.objects.count()
        expired_entries = ReportCache.objects.filter(
            expires_at__lt=timezone.now()
        ).count()

        cache_by_type = (
            ReportCache.objects.values("report_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        return {
            "total_entries": total_entries,
            "expired_entries": expired_entries,
            "valid_entries": total_entries - expired_entries,
            "cache_by_type": list(cache_by_type),
        }

    @staticmethod
    @transaction.atomic
    def get_quick_metrics() -> Dict[str, Any]:
        """Get today/MTD/YTD metrics for dashboard"""
        
        # Get local timezone for date calculations
        local_tz = ReportService.get_local_timezone()
        now = timezone.now().astimezone(local_tz)
        
        # Calculate date ranges
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now
        
        # Month to date
        mtd_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        mtd_end = now
        
        # Year to date  
        ytd_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        ytd_end = now
        
        # Base queryset for completed orders
        def get_metrics_for_period(start_time, end_time):
            # Get order-level metrics WITHOUT JOINs to avoid duplication
            orders = Order.objects.filter(
                status=Order.OrderStatus.COMPLETED,
                created_at__range=(start_time, end_time)
            ).aggregate(
                total_sales=Coalesce(Sum("grand_total"), Value(Decimal("0.00"))),
                total_orders=Count("id")
            )
            
            # Calculate total items separately to avoid JOIN duplication
            total_items = OrderItem.objects.filter(
                order__status=Order.OrderStatus.COMPLETED,
                order__created_at__range=(start_time, end_time)
            ).aggregate(
                total_items=Coalesce(Sum("quantity"), Value(0))
            )["total_items"]
            
            return {
                "sales": float(orders["total_sales"] or 0),
                "orders": orders["total_orders"] or 0,
                "items": total_items or 0,
                "avg_order_value": (
                    float(orders["total_sales"] or 0) / (orders["total_orders"] or 1)
                    if orders["total_orders"] > 0 else 0
                )
            }
        
        # Get metrics for each period
        today_metrics = get_metrics_for_period(today_start, today_end)
        mtd_metrics = get_metrics_for_period(mtd_start, mtd_end)
        ytd_metrics = get_metrics_for_period(ytd_start, ytd_end)
        
        return {
            "today": {
                **today_metrics,
                "date_range": {
                    "start": today_start.isoformat(),
                    "end": today_end.isoformat()
                }
            },
            "month_to_date": {
                **mtd_metrics,
                "date_range": {
                    "start": mtd_start.isoformat(),
                    "end": mtd_end.isoformat()
                }
            },
            "year_to_date": {
                **ytd_metrics,
                "date_range": {
                    "start": ytd_start.isoformat(),
                    "end": ytd_end.isoformat()
                }
            },
            "generated_at": timezone.now().isoformat()
        }

    # Export functionality methods
    @staticmethod
    def export_to_csv(report_data: Dict[str, Any], report_type: str) -> bytes:
        """Export report data to CSV format"""
        try:
            output = io.StringIO()
            writer = csv.writer(output)

            # Write header with report info
            writer.writerow([f"{report_type.title()} Report"])
            writer.writerow([f"Generated: {report_data.get('generated_at', 'N/A')}"])
            writer.writerow(
                [
                    f"Date Range: {report_data.get('date_range', {}).get('start', 'N/A')} to {report_data.get('date_range', {}).get('end', 'N/A')}"
                ]
            )
            writer.writerow([])  # Empty row

            # Export based on report type
            if report_type == "summary":
                ReportService._export_summary_to_csv(writer, report_data)
            elif report_type == "sales":
                ReportService._export_sales_to_csv(writer, report_data)
            elif report_type == "products":
                ReportService._export_products_to_csv(writer, report_data)
            elif report_type == "payments":
                ReportService._export_payments_to_csv(writer, report_data)
            elif report_type == "operations":
                ReportService._export_operations_to_csv(writer, report_data)

            return output.getvalue().encode("utf-8")

        except Exception as e:
            logger.error(f"Error exporting to CSV: {e}")
            raise

    @staticmethod
    def export_to_xlsx(report_data: Dict[str, Any], report_type: str) -> bytes:
        """Export report data to Excel format"""
        try:
            wb = Workbook()
            ws = wb.active
            ws.title = f"{report_type.title()} Report"

            # Styles
            header_font = Font(bold=True, color="FFFFFF")
            header_fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            header_alignment = Alignment(horizontal="center", vertical="center")

            # Report header
            ws.merge_cells("A1:D1")
            ws["A1"] = f"{report_type.title()} Report"
            ws["A1"].font = Font(bold=True, size=16)
            ws["A1"].alignment = header_alignment

            ws["A2"] = f"Generated: {report_data.get('generated_at', 'N/A')}"
            ws["A3"] = (
                f"Date Range: {report_data.get('date_range', {}).get('start', 'N/A')} to {report_data.get('date_range', {}).get('end', 'N/A')}"
            )

            # Export based on report type
            if report_type == "summary":
                ReportService._export_summary_to_xlsx(
                    ws, report_data, header_font, header_fill, header_alignment
                )
            elif report_type == "sales":
                ReportService._export_sales_to_xlsx(
                    ws, report_data, header_font, header_fill, header_alignment
                )
            elif report_type == "products":
                ReportService._export_products_to_xlsx(
                    ws, report_data, header_font, header_fill, header_alignment
                )
            elif report_type == "payments":
                ReportService._export_payments_to_xlsx(
                    ws, report_data, header_font, header_fill, header_alignment
                )
            elif report_type == "operations":
                ReportService._export_operations_to_xlsx(
                    ws, report_data, header_font, header_fill, header_alignment
                )

            # Auto-adjust column widths
            for column in ws.columns:
                max_length = 0
                column_letter = get_column_letter(column[0].column)
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                ws.column_dimensions[column_letter].width = adjusted_width

            # Save to bytes
            output = io.BytesIO()
            wb.save(output)
            output.seek(0)
            return output.read()

        except Exception as e:
            logger.error(f"Error exporting to Excel: {e}")
            raise

    @staticmethod
    def export_to_pdf(
        report_data: Dict[str, Any], report_type: str, report_title: str = None
    ) -> bytes:
        """Export report data to PDF format"""
        try:
            output = io.BytesIO()
            doc = SimpleDocTemplate(
                output,
                pagesize=A4,
                rightMargin=72,
                leftMargin=72,
                topMargin=72,
                bottomMargin=18,
            )

            # Styles
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                "CustomTitle",
                parent=styles["Heading1"],
                fontSize=18,
                spaceAfter=30,
                alignment=TA_CENTER,
            )

            # Build story
            story = []

            # Title
            title = report_title or f"{report_type.title()} Report"
            story.append(Paragraph(title, title_style))
            story.append(Spacer(1, 12))

            # Report info
            story.append(
                Paragraph(
                    f"Generated: {report_data.get('generated_at', 'N/A')}",
                    styles["Normal"],
                )
            )
            story.append(
                Paragraph(
                    f"Date Range: {report_data.get('date_range', {}).get('start', 'N/A')} to {report_data.get('date_range', {}).get('end', 'N/A')}",
                    styles["Normal"],
                )
            )
            story.append(Spacer(1, 20))

            # Export based on report type
            if report_type == "summary":
                ReportService._export_summary_to_pdf(story, report_data, styles)
            elif report_type == "sales":
                ReportService._export_sales_to_pdf(story, report_data, styles)
            elif report_type == "products":
                ReportService._export_products_to_pdf(story, report_data, styles)
            elif report_type == "payments":
                ReportService._export_payments_to_pdf(story, report_data, styles)
            elif report_type == "operations":
                ReportService._export_operations_to_pdf(story, report_data, styles)

            # Build PDF
            doc.build(story)
            output.seek(0)
            return output.read()

        except Exception as e:
            logger.error(f"Error exporting to PDF: {e}")
            raise

    # CSV export helpers
    @staticmethod
    def _export_summary_to_csv(writer, report_data: Dict[str, Any]):
        """Export summary report to CSV"""
        writer.writerow(["Summary Metrics"])
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Total Sales", f"${report_data.get('total_sales', 0):,.2f}"])
        writer.writerow(
            ["Total Transactions", report_data.get("total_transactions", 0)]
        )
        writer.writerow(
            ["Average Ticket", f"${report_data.get('average_ticket', 0):,.2f}"]
        )
        writer.writerow(["Total Tax", f"${report_data.get('total_tax', 0):,.2f}"])
        writer.writerow(
            ["Total Discounts", f"${report_data.get('total_discounts', 0):,.2f}"]
        )
        writer.writerow(["Sales Growth", f"{report_data.get('sales_growth', 0):+.2f}%"])
        writer.writerow(
            ["Transaction Growth", f"{report_data.get('transaction_growth', 0):+.2f}%"]
        )
        writer.writerow(["Top Product", report_data.get("top_product", "N/A")])
        writer.writerow([])

        # Sales trend
        writer.writerow(["Daily Sales Trend"])
        writer.writerow(["Date", "Sales", "Transactions"])
        for item in report_data.get("sales_trend", []):
            writer.writerow(
                [
                    item.get("date"),
                    f"${item.get('sales', 0):,.2f}",
                    item.get("transactions", 0),
                ]
            )
        writer.writerow([])

        # Payment distribution
        writer.writerow(["Payment Method Distribution"])
        writer.writerow(["Method", "Amount", "Count", "Percentage"])
        for item in report_data.get("payment_distribution", []):
            writer.writerow(
                [
                    item.get("method"),
                    f"${item.get('amount', 0):,.2f}",
                    item.get("count", 0),
                    f"{item.get('percentage', 0):.2f}%",
                ]
            )

    @staticmethod
    def _export_sales_to_csv(writer, report_data: Dict[str, Any]):
        """Export sales report to CSV"""
        writer.writerow(["Sales Summary"])
        writer.writerow(["Metric", "Value"])
        writer.writerow(
            ["Total Revenue", f"${report_data.get('total_revenue', 0):,.2f}"]
        )
        writer.writerow(["Total Orders", report_data.get("total_orders", 0)])
        writer.writerow(
            [
                "Average Order Value",
                f"${report_data.get('average_order_value', 0):,.2f}",
            ]
        )
        writer.writerow([])

        # Daily trends
        writer.writerow(["Daily Sales Trends"])
        writer.writerow(["Date", "Revenue", "Orders", "AOV"])
        for item in report_data.get("daily_trends", []):
            writer.writerow(
                [
                    item.get("date"),
                    f"${item.get('revenue', 0):,.2f}",
                    item.get("orders", 0),
                    f"${item.get('aov', 0):,.2f}",
                ]
            )

    @staticmethod
    def _export_products_to_csv(writer, report_data: Dict[str, Any]):
        """Export products report to CSV"""
        writer.writerow(["Product Performance"])
        writer.writerow(["Product", "Quantity Sold", "Revenue", "Average Price"])
        for item in report_data.get("top_products", []):
            writer.writerow(
                [
                    item.get("name"),
                    item.get("quantity_sold", 0),
                    f"${item.get('revenue', 0):,.2f}",
                    f"${item.get('avg_price', 0):,.2f}",
                ]
            )

    @staticmethod
    def _export_payments_to_csv(writer, report_data: Dict[str, Any]):
        """Export payments report to CSV"""
        writer.writerow(["Payment Method Performance"])
        writer.writerow(["Method", "Amount", "Count", "Percentage"])
        for item in report_data.get("payment_methods", []):
            writer.writerow(
                [
                    item.get("method"),
                    f"${item.get('amount', 0):,.2f}",
                    item.get("count", 0),
                    f"{item.get('percentage', 0):.2f}%",
                ]
            )

    @staticmethod
    def _export_operations_to_csv(writer, report_data: Dict[str, Any]):
        """Export operations report to CSV"""
        writer.writerow(["Hourly Performance"])
        writer.writerow(["Hour", "Orders", "Revenue", "Avg Order Value"])
        for item in report_data.get("hourly_patterns", []):
            writer.writerow(
                [
                    item.get("hour"),
                    item.get("orders", 0),
                    f"${item.get('revenue', 0):,.2f}",
                    f"${item.get('avg_order_value', 0):,.2f}",
                ]
            )

    # Excel export helpers
    @staticmethod
    def _export_summary_to_xlsx(
        ws, report_data: Dict[str, Any], header_font, header_fill, header_alignment
    ):
        """Export summary report to Excel"""
        row = 5

        # Summary metrics
        ws.merge_cells(f"A{row}:D{row}")
        ws[f"A{row}"] = "Summary Metrics"
        ws[f"A{row}"].font = header_font
        ws[f"A{row}"].fill = header_fill
        ws[f"A{row}"].alignment = header_alignment
        row += 1

        metrics = [
            ("Total Sales", f"${report_data.get('total_sales', 0):,.2f}"),
            ("Total Transactions", report_data.get("total_transactions", 0)),
            ("Average Ticket", f"${report_data.get('average_ticket', 0):,.2f}"),
            ("Total Tax", f"${report_data.get('total_tax', 0):,.2f}"),
            ("Total Discounts", f"${report_data.get('total_discounts', 0):,.2f}"),
            ("Sales Growth", f"{report_data.get('sales_growth', 0):+.2f}%"),
            ("Transaction Growth", f"{report_data.get('transaction_growth', 0):+.2f}%"),
            ("Top Product", report_data.get("top_product", "N/A")),
        ]

        for metric, value in metrics:
            ws[f"A{row}"] = metric
            ws[f"B{row}"] = value
            row += 1

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
                f"${report_data.get('average_order_value', 0):,.2f}",
            ),
        ]

        for metric, value in metrics:
            ws[f"A{row}"] = metric
            ws[f"B{row}"] = value
            row += 1

    @staticmethod
    def _export_products_to_xlsx(
        ws, report_data: Dict[str, Any], header_font, header_fill, header_alignment
    ):
        """Export products report to Excel"""
        row = 5

        # Product performance
        ws.merge_cells(f"A{row}:D{row}")
        ws[f"A{row}"] = "Product Performance"
        ws[f"A{row}"].font = header_font
        ws[f"A{row}"].fill = header_fill
        ws[f"A{row}"].alignment = header_alignment
        row += 1

        # Headers
        headers = ["Product", "Quantity Sold", "Revenue", "Average Price"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=row, column=col, value=header).font = header_font
            ws.cell(row=row, column=col).fill = header_fill
            ws.cell(row=row, column=col).alignment = header_alignment
        row += 1

        # Data
        for item in report_data.get("top_products", []):
            ws.cell(row=row, column=1, value=item.get("name"))
            ws.cell(row=row, column=2, value=item.get("quantity_sold", 0))
            ws.cell(row=row, column=3, value=f"${item.get('revenue', 0):,.2f}")
            ws.cell(row=row, column=4, value=f"${item.get('avg_price', 0):,.2f}")
            row += 1

    @staticmethod
    def _export_payments_to_xlsx(
        ws, report_data: Dict[str, Any], header_font, header_fill, header_alignment
    ):
        """Export payments report to Excel"""
        row = 5

        # Payment methods
        ws.merge_cells(f"A{row}:D{row}")
        ws[f"A{row}"] = "Payment Method Performance"
        ws[f"A{row}"].font = header_font
        ws[f"A{row}"].fill = header_fill
        ws[f"A{row}"].alignment = header_alignment
        row += 1

        # Headers
        headers = ["Method", "Amount", "Count", "Percentage"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=row, column=col, value=header).font = header_font
            ws.cell(row=row, column=col).fill = header_fill
            ws.cell(row=row, column=col).alignment = header_alignment
        row += 1

        # Data
        for item in report_data.get("payment_methods", []):
            ws.cell(row=row, column=1, value=item.get("method"))
            ws.cell(row=row, column=2, value=f"${item.get('amount', 0):,.2f}")
            ws.cell(row=row, column=3, value=item.get("count", 0))
            ws.cell(row=row, column=4, value=f"{item.get('percentage', 0):.2f}%")
            row += 1

    @staticmethod
    def _export_operations_to_xlsx(
        ws, report_data: Dict[str, Any], header_font, header_fill, header_alignment
    ):
        """Export operations report to Excel"""
        row = 5

        # Hourly performance
        ws.merge_cells(f"A{row}:D{row}")
        ws[f"A{row}"] = "Hourly Performance"
        ws[f"A{row}"].font = header_font
        ws[f"A{row}"].fill = header_fill
        ws[f"A{row}"].alignment = header_alignment
        row += 1

        # Headers
        headers = ["Hour", "Orders", "Revenue", "Avg Order Value"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=row, column=col, value=header).font = header_font
            ws.cell(row=row, column=col).fill = header_fill
            ws.cell(row=row, column=col).alignment = header_alignment
        row += 1

        # Data
        for item in report_data.get("hourly_patterns", []):
            ws.cell(row=row, column=1, value=item.get("hour"))
            ws.cell(row=row, column=2, value=item.get("orders", 0))
            ws.cell(row=row, column=3, value=f"${item.get('revenue', 0):,.2f}")
            ws.cell(row=row, column=4, value=f"${item.get('avg_order_value', 0):,.2f}")
            row += 1

    # PDF export helpers
    @staticmethod
    def _export_summary_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export summary report to PDF"""
        # Summary metrics table
        story.append(Paragraph("Summary Metrics", styles["Heading2"]))

        summary_data = [
            ["Metric", "Value"],
            ["Total Sales", f"${report_data.get('total_sales', 0):,.2f}"],
            ["Total Transactions", str(report_data.get("total_transactions", 0))],
            ["Average Ticket", f"${report_data.get('average_ticket', 0):,.2f}"],
            ["Total Tax", f"${report_data.get('total_tax', 0):,.2f}"],
            ["Total Discounts", f"${report_data.get('total_discounts', 0):,.2f}"],
            ["Sales Growth", f"{report_data.get('sales_growth', 0):+.2f}%"],
            ["Transaction Growth", f"{report_data.get('transaction_growth', 0):+.2f}%"],
            ["Top Product", report_data.get("top_product", "N/A")],
        ]

        summary_table = Table(summary_data, colWidths=[3 * inch, 2 * inch])
        summary_table.setStyle(
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

        story.append(summary_table)
        story.append(Spacer(1, 20))

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
                f"${report_data.get('average_order_value', 0):,.2f}",
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

    @staticmethod
    def _export_products_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export products report to PDF"""
        story.append(Paragraph("Product Performance", styles["Heading2"]))

        product_data = [["Product", "Quantity Sold", "Revenue", "Avg Price"]]
        for item in report_data.get("top_products", []):
            product_data.append(
                [
                    item.get("name"),
                    str(item.get("quantity_sold", 0)),
                    f"${item.get('revenue', 0):,.2f}",
                    f"${item.get('avg_price', 0):,.2f}",
                ]
            )

        product_table = Table(
            product_data, colWidths=[2 * inch, 1 * inch, 1 * inch, 1 * inch]
        )
        product_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ]
            )
        )

        story.append(product_table)

    @staticmethod
    def _export_payments_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export payments report to PDF"""
        story.append(Paragraph("Payment Method Performance", styles["Heading2"]))

        payment_data = [["Method", "Amount", "Count", "Percentage"]]
        for item in report_data.get("payment_methods", []):
            payment_data.append(
                [
                    item.get("method"),
                    f"${item.get('amount', 0):,.2f}",
                    str(item.get("count", 0)),
                    f"{item.get('percentage', 0):.2f}%",
                ]
            )

        payment_table = Table(
            payment_data, colWidths=[1.5 * inch, 1.5 * inch, 1 * inch, 1 * inch]
        )
        payment_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ]
            )
        )

        story.append(payment_table)

    @staticmethod
    def _export_operations_to_pdf(story, report_data: Dict[str, Any], styles):
        """Export operations report to PDF"""
        story.append(Paragraph("Hourly Performance", styles["Heading2"]))

        hourly_data = [["Hour", "Orders", "Revenue", "Avg Order Value"]]
        for item in report_data.get("hourly_patterns", []):
            hourly_data.append(
                [
                    item.get("hour"),
                    str(item.get("orders", 0)),
                    f"${item.get('revenue', 0):,.2f}",
                    f"${item.get('avg_order_value', 0):,.2f}",
                ]
            )

        hourly_table = Table(
            hourly_data, colWidths=[1 * inch, 1 * inch, 1.5 * inch, 1.5 * inch]
        )
        hourly_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ]
            )
        )

        story.append(hourly_table)
