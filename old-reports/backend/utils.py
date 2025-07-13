# pos_and_backend/backend/reports/utils.py
from datetime import (
    datetime,
    timedelta,
    date,
    time,
)  # CHANGED: Add 'time' to the import
import json
from django.db.models import (
    Sum,
    Count,
    Avg,
    F,
    Q,
    ExpressionWrapper,
    DecimalField,
)
from django.db.models.functions import TruncDate, TruncDay, TruncWeek, TruncMonth
from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from decimal import Decimal
from django.utils import timezone
import pytz

# ADD these imports for detailed serialization
from payments.serializers import PaymentTransactionSerializer
from orders.serializers import NestedOrderItemSerializer


# Helper serializer for the new feature
class OrderDetailForReportSerializer:
    def __init__(self, order_instance):
        self.instance = order_instance

    def to_representation(self):
        transactions = PaymentTransaction.objects.filter(
            parent_payment__order=self.instance
        )
        transaction_serializer = PaymentTransactionSerializer(transactions, many=True)

        # CHANGED: Add more financial fields to the returned dictionary
        return {
            "id": self.instance.id,
            "total_price": self.instance.total_price,
            "status": self.instance.status,
            "created_at": self.instance.created_at,
            "transactions": transaction_serializer.data,
            # --- NEW FIELDS ---
            "subtotal": self.instance.subtotal_from_frontend or Decimal("0.00"),
            "tax": self.instance.tax_amount_from_frontend or Decimal("0.00"),
            "discount": self.instance.discount_amount or Decimal("0.00"),
            "surcharge": self.instance.surcharge_amount or Decimal("0.00"),
            "tip": self.instance.tip_amount or Decimal("0.00"),
        }


def serialize_report_parameters(params):
    """Convert date objects to ISO format strings in a dictionary."""
    serialized = {}
    for key, value in params.items():
        if isinstance(value, (date, datetime)):
            serialized[key] = value.isoformat()
        else:
            serialized[key] = value
    return serialized


class DateTimeEncoder(json.JSONEncoder):
    """JSON encoder that can handle datetime.date and datetime.datetime objects."""

    def default(self, obj):
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)


def generate_sales_report(
    start_date,
    end_date,
    group_by="day",
    include_tax=True,
    include_refunds=True,
    date_field="created_at",
):
    if isinstance(start_date, str):
        start_date = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    if isinstance(end_date, str):
        end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))

    # CHANGED: Use the directly imported 'time' object
    if isinstance(end_date, date) and not isinstance(end_date, datetime):
        end_date = datetime.combine(end_date, time.max)

    queryset = Order.objects.filter(
        **{
            f"{date_field}__gte": start_date,
            f"{date_field}__lte": end_date,
            "status__in": ["completed", "refunded", "partially_refunded"],
        }
    ).select_related("payment")

    # ... (The rest of the function is correct and remains the same) ...
    if not queryset.exists():
        return {
            "summary": {
                "total_revenue": 0,
                "total_orders": 0,
                "avg_order_value": 0,
                "total_subtotal": 0,
                "total_tax": 0,
                "total_discount": 0,
                "total_tip": 0,
                "total_surcharge": 0,
            },
            "data": [],
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
        }

    if group_by == "day":
        trunc_func = TruncDay(date_field)
    elif group_by == "week":
        trunc_func = TruncWeek(date_field)
    else:
        trunc_func = TruncMonth(date_field)

    report_data = (
        queryset.annotate(period=trunc_func)
        .values("period")
        .annotate(
            order_count=Count("id"),
            subtotal=Sum("subtotal_from_frontend"),
            tax=Sum("tax_amount_from_frontend"),
            discount=Sum("discount_amount"),
            tip=Sum("tip_amount"),
            surcharge=Sum("surcharge_amount"),
            total_revenue=Sum("total_price"),
        )
        .order_by("period")
    )

    detailed_report_data = []
    for period_data in report_data:
        period_start = period_data["period"]
        if group_by == "day":
            period_end = period_start + timedelta(days=1)
        elif group_by == "week":
            period_end = period_start + timedelta(weeks=1)
        else:
            next_month = period_start.replace(day=28) + timedelta(days=4)
            period_end = next_month - timedelta(days=next_month.day)
            period_end = period_end.replace(hour=23, minute=59, second=59)

        orders_in_period = queryset.filter(
            **{
                f"{date_field}__gte": period_start,
                f"{date_field}__lt": period_end,
            }
        ).order_by(f"-{date_field}")

        serialized_orders = [
            OrderDetailForReportSerializer(order).to_representation()
            for order in orders_in_period
        ]

        period_data["orders"] = serialized_orders
        detailed_report_data.append(period_data)

    total_revenue = sum(item.get("total_revenue", 0) or 0 for item in report_data)
    total_orders = sum(item.get("order_count", 0) for item in report_data)

    summary = {
        "total_revenue": total_revenue,
        "total_orders": total_orders,
        "avg_order_value": total_revenue / total_orders if total_orders > 0 else 0,
        "total_subtotal": sum(item.get("subtotal", 0) or 0 for item in report_data),
        "total_tax": sum(item.get("tax", 0) or 0 for item in report_data),
        "total_discount": sum(item.get("discount", 0) or 0 for item in report_data),
        "total_tip": sum(item.get("tip", 0) or 0 for item in report_data),
        "total_surcharge": sum(item.get("surcharge", 0) or 0 for item in report_data),
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
    }

    for item in detailed_report_data:
        item["date"] = item.pop("period").strftime("%Y-%m-%d")

    return {"summary": summary, "data": detailed_report_data}


def generate_product_report(
    start_date,
    end_date,
    category=None,
    limit=10,
    sort_by="revenue",
    date_field="updated_at",
):
    # --- TIMEZONE STANDARDIZATION ---
    chicago_tz = pytz.timezone("America/Chicago")
    start_datetime = chicago_tz.localize(
        datetime.combine(start_date, datetime.min.time())
    )
    end_datetime = chicago_tz.localize(datetime.combine(end_date, datetime.max.time()))

    # --- FILTER STANDARDIZATION ---
    order_filters = {
        f"order__{date_field}__gte": start_datetime,
        f"order__{date_field}__lte": end_datetime,
        "order__status": "completed",
        "order__payment__status__in": ["completed", "partially_refunded"],
    }

    query = OrderItem.objects.filter(**order_filters)

    if category:
        query = query.filter(product__category__name=category)

    annotated_query = query.annotate(
        item_revenue=ExpressionWrapper(
            F("unit_price") * F("quantity"),
            output_field=DecimalField(max_digits=10, decimal_places=2),
        )
    )

    product_data = annotated_query.values(
        "product__id", "product__name", "product__category__name"
    ).annotate(
        quantity_sold=Sum("quantity"),
        revenue=Sum("item_revenue"),
        avg_price_sold=Avg("unit_price"),
    )

    if sort_by == "quantity":
        product_data = product_data.order_by("-quantity_sold")
    else:
        product_data = product_data.order_by("-revenue")

    if limit:
        product_data = product_data[:limit]

    formatted_products = []
    for entry in product_data:
        formatted_products.append(
            {
                "product_id": entry["product__id"],
                "product_name": entry["product__name"],
                "category": entry["product__category__name"] or "Uncategorized",
                "quantity_sold": entry["quantity_sold"],
                "revenue": float(entry["revenue"] or 0),
                "avg_price_sold": float(entry["avg_price_sold"] or 0),
            }
        )

    category_data_query = (
        annotated_query.values("product__category__name")
        .annotate(
            total_quantity_sold=Sum("quantity"), total_revenue=Sum("item_revenue")
        )
        .order_by("-total_revenue")
    )

    category_breakdown = []
    for entry in category_data_query:
        category_name = entry["product__category__name"] or "Uncategorized"
        category_breakdown.append(
            {
                "category": category_name,
                "quantity_sold": entry["total_quantity_sold"],
                "revenue": float(entry["total_revenue"] or 0),
            }
        )

    overall_summary_agg = annotated_query.aggregate(
        grand_total_quantity=Sum("quantity"), grand_total_revenue=Sum("item_revenue")
    )
    grand_total_quantity = overall_summary_agg["grand_total_quantity"] or 0
    grand_total_revenue = float(overall_summary_agg["grand_total_revenue"] or 0)

    summary = {
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
        "total_items_sold": grand_total_quantity,
        "total_product_revenue": grand_total_revenue,
        "top_product_name": (
            formatted_products[0]["product_name"] if formatted_products else None
        ),
        "top_category_name": (
            category_breakdown[0]["category"] if category_breakdown else None
        ),
    }

    return {
        "summary": summary,
        "products": formatted_products,
        "categories": category_breakdown,
    }


def generate_payment_report(
    start_date, end_date, group_by="payment_method", date_field="created_at"
):
    # --- TIMEZONE STANDARDIZATION ---
    chicago_tz = pytz.timezone("America/Chicago")
    start_datetime = chicago_tz.localize(
        datetime.combine(start_date, datetime.min.time())
    )
    end_datetime = chicago_tz.localize(datetime.combine(end_date, datetime.max.time()))

    # The date field for PaymentTransaction is 'timestamp'
    actual_date_field = "timestamp"

    date_filter = {
        f"{actual_date_field}__gte": start_datetime,
        f"{actual_date_field}__lte": end_datetime,
    }

    # Base query for transaction counts and details
    transaction_query = PaymentTransaction.objects.filter(
        parent_payment__order__status="completed",
        **date_filter,
    ).select_related("parent_payment__order")

    if group_by == "payment_method":
        payment_data = transaction_query.values("payment_method").annotate(
            transaction_count=Count("id"),
            total_amount=Sum("amount"),
            refund_count=Count(
                "id", filter=Q(status__in=["refunded", "partially_refunded"])
            ),
            failed_count=Count("id", filter=Q(status="failed")),
            void_count=Count("id", filter=Q(parent_payment__order__status="voided")),
        )
        formatted_data = [
            {
                "payment_method": (entry["payment_method"] or "Unknown")
                .replace("_", " ")
                .title(),
                "transaction_count": entry["transaction_count"],
                "total_amount": float(entry["total_amount"] or 0),
                "refund_count": entry["refund_count"],
                "failed_count": entry["failed_count"],
                "void_count": entry["void_count"],
                "success_rate": round(
                    (
                        (
                            (
                                entry["transaction_count"]
                                - entry["failed_count"]
                                - entry["void_count"]
                            )
                            / entry["transaction_count"]
                        )
                        * 100
                        if entry["transaction_count"] > 0
                        else 0
                    ),
                    2,
                ),
            }
            for entry in payment_data
        ]
        formatted_data.sort(key=lambda x: x["total_amount"], reverse=True)

    else:  # Group by time period
        if group_by == "day":
            trunc_func = TruncDay(actual_date_field)
            date_format_str = "%Y-%m-%d"
        elif group_by == "week":
            trunc_func = TruncWeek(actual_date_field)
            date_format_str = "Week of %Y-%m-%d"
        else:  # month
            trunc_func = TruncMonth(actual_date_field)
            date_format_str = "%Y-%m"

        time_grouped_data = (
            transaction_query.annotate(date_group=trunc_func)
            .values("date_group")
            .annotate(
                transaction_count=Count("id"),
                total_amount=Sum("amount"),
                refund_count=Count(
                    "id", filter=Q(status__in=["refunded", "partially_refunded"])
                ),
                failed_count=Count("id", filter=Q(status="failed")),
                void_count=Count(
                    "id", filter=Q(parent_payment__order__status="voided")
                ),
            )
            .order_by("date_group")
        )
        formatted_data = [
            {
                "date": entry["date_group"].strftime(date_format_str),
                "transaction_count": entry["transaction_count"],
                "total_amount": float(entry["total_amount"] or 0),
                "refund_count": entry["refund_count"],
                "failed_count": entry["failed_count"],
                "void_count": entry["void_count"],
                "success_rate": round(
                    (
                        (
                            (
                                entry["transaction_count"]
                                - entry["failed_count"]
                                - entry["void_count"]
                            )
                            / entry["transaction_count"]
                        )
                        * 100
                        if entry["transaction_count"] > 0
                        else 0
                    ),
                    2,
                ),
            }
            for entry in time_grouped_data
        ]

    # --- NEW, ROBUST SUMMARY CALCULATIONS FROM ORDER MODEL ---

    # Base filter for all completed orders in the period
    order_date_filter = {
        f"updated_at__gte": start_datetime,
        f"updated_at__lte": end_datetime,
        "status": "completed",
    }

    # Total Processed: Sum of total_price for ALL completed orders (including refunded)
    processed_agg = Order.objects.filter(**order_date_filter).aggregate(
        total=Sum("total_price")
    )
    total_processed = processed_agg["total"] or Decimal("0.00")

    # Net Revenue: Sum of total_price for ONLY non-refunded or partially-refunded orders
    financial_filters = {
        **order_date_filter,
        "payment__status__in": ["completed", "partially_refunded"],
    }
    net_revenue_agg = Order.objects.filter(**financial_filters).aggregate(
        total=Sum("total_price")
    )
    net_revenue = net_revenue_agg["total"] or Decimal("0.00")

    # Total Refunded Amount: The difference between the two above. This is the most reliable way.
    total_refunded_amount = total_processed - net_revenue

    # Counts from the transaction query remain the same
    total_transactions = transaction_query.count()
    total_refunds = transaction_query.filter(
        status__in=["refunded", "partially_refunded"]
    ).count()
    total_failed = transaction_query.filter(status="failed").count()
    total_voided = transaction_query.filter(
        parent_payment__order__status="voided"
    ).count()

    refund_rate = (
        (total_refunds / total_transactions) * 100 if total_transactions > 0 else 0
    )

    overall_successful_tx = total_transactions - total_failed - total_voided
    success_rate_summary = (
        (overall_successful_tx / total_transactions) * 100
        if total_transactions > 0
        else 0
    )

    summary = {
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
        "total_transactions": total_transactions,
        "total_processed": float(total_processed),  # Now sourced from Order model
        "total_refunded_amount": float(
            total_refunded_amount
        ),  # Now a direct calculation
        "net_revenue": float(
            net_revenue
        ),  # Sourced from Order model, will match other reports
        "total_refunds": total_refunds,
        "total_failed": total_failed,
        "total_voided": total_voided,
        "refund_rate": round(refund_rate, 2),
        "success_rate": round(success_rate_summary, 2),
    }

    return {"summary": summary, "data": formatted_data}


def generate_operational_insights(start_date, end_date, date_field="updated_at"):
    """
    Generates an operational insights report with consistent order counts and accurate financials.
    - Order counts include fully refunded orders.
    - Financial values (revenue, etc.) exclude fully refunded orders.
    """
    chicago_tz = pytz.timezone("America/Chicago")
    start_datetime = chicago_tz.localize(
        datetime.combine(start_date, datetime.min.time())
    )
    end_datetime = chicago_tz.localize(datetime.combine(end_date, datetime.max.time()))

    # Query for financial values (excludes fully refunded)
    financial_query = Order.objects.filter(
        **{
            f"{date_field}__gte": start_datetime,
            f"{date_field}__lte": end_datetime,
            "status": "completed",
            "payment__status__in": ["completed", "partially_refunded"],
        }
    )

    # Query for all orders to be counted (includes fully refunded)
    order_count_query = Order.objects.filter(
        **{
            f"{date_field}__gte": start_datetime,
            f"{date_field}__lte": end_datetime,
            "status": "completed",
            "payment__status__in": ["completed", "partially_refunded", "refunded"],
        }
    )

    # --- HOURLY BREAKDOWN ---
    hourly_data = []
    for hour in range(24):
        hour_filter = {f"{date_field}__hour": hour}
        order_count = order_count_query.filter(**hour_filter).count()
        agg_results = financial_query.filter(**hour_filter).aggregate(
            revenue=Sum("total_price"),
            subtotal=Sum("subtotal_from_frontend"),
            tax=Sum("tax_amount_from_frontend"),
            discount=Sum("discount_amount"),
            tip=Sum("tip_amount"),
            surcharge=Sum("surcharge_amount"),
        )
        revenue = Decimal(agg_results.get("revenue") or "0.00")

        if order_count > 0:
            hourly_data.append(
                {
                    "hour": f"{hour:02d}:00",
                    "order_count": order_count,
                    "revenue": float(revenue),
                    "avg_order_value": (
                        float(revenue / order_count) if order_count > 0 else 0
                    ),
                    "subtotal": float(agg_results.get("subtotal") or 0),
                    "tax": float(agg_results.get("tax") or 0),
                    "discount": float(agg_results.get("discount") or 0),
                    "tip": float(agg_results.get("tip") or 0),
                    "surcharge": float(agg_results.get("surcharge") or 0),
                }
            )

    # --- DAILY BREAKDOWN ---

    # Query 1: Get daily financial totals (NO JOINS)
    daily_financials = {
        item["date_group"]: item
        for item in financial_query.annotate(date_group=TruncDate(date_field))
        .values("date_group")
        .annotate(
            revenue=Sum("total_price"),
            subtotal=Sum("subtotal_from_frontend"),
            tax=Sum("tax_amount_from_frontend"),
            discount=Sum("discount_amount"),
            tip=Sum("tip_amount"),
            surcharge=Sum("surcharge_amount"),
        )
    }

    # Query 2: Get daily order counts
    daily_counts = {
        item["date_group"]: item["order_count"]
        for item in order_count_query.annotate(date_group=TruncDate(date_field))
        .values("date_group")
        .annotate(order_count=Count("id"))
    }

    # Query 3: Get daily item counts (This query contains the JOIN)
    daily_item_counts = {
        item["date_group"]: item["total_items"]
        for item in financial_query.annotate(date_group=TruncDate(date_field))
        .values("date_group")
        .annotate(total_items=Sum("items__quantity"))
    }

    formatted_daily_data = []
    # Loop through all days that had any order
    for date_group, order_count in sorted(daily_counts.items()):
        financials = daily_financials.get(date_group, {})
        total_items = daily_item_counts.get(date_group, 0)

        avg_items_per_order = total_items / order_count if order_count > 0 else 0

        formatted_daily_data.append(
            {
                "date": date_group.strftime("%Y-%m-%d"),
                "day_of_week": date_group.strftime("%A"),
                "order_count": order_count,
                "revenue": float(financials.get("revenue") or 0),
                "subtotal": float(financials.get("subtotal") or 0),
                "tax": float(financials.get("tax") or 0),
                "discount": float(financials.get("discount") or 0),
                "tip": float(financials.get("tip") or 0),
                "surcharge": float(financials.get("surcharge") or 0),
                "avg_items_per_order": round(avg_items_per_order, 2),
            }
        )

    # --- DAY OF WEEK SUMMARY (recalculated from consistent daily data) ---
    days_of_week = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ]
    day_of_week_data_agg = {
        day: {"order_count": 0, "revenue": Decimal("0.00"), "days_counted": 0}
        for day in days_of_week
    }
    for entry in formatted_daily_data:
        day = entry["day_of_week"]
        day_of_week_data_agg[day]["order_count"] += entry["order_count"]
        day_of_week_data_agg[day]["revenue"] += Decimal(str(entry["revenue"]))
        day_of_week_data_agg[day]["days_counted"] += 1

    day_of_week_summary = [
        {
            "day_of_week": day,
            "avg_order_count": round(
                data["order_count"] / (data["days_counted"] or 1), 2
            ),
            "avg_revenue": round(
                float(data["revenue"] / (data["days_counted"] or 1)), 2
            ),
        }
        for day, data in day_of_week_data_agg.items()
    ]

    # --- ORDER SOURCE BREAKDOWN ---
    source_data = (
        financial_query.values("source")
        .annotate(order_count=Count("id"), total_revenue=Sum("total_price"))
        .order_by("-total_revenue")
    )
    order_source_summary = [
        {
            "source": e["source"],
            "order_count": e["order_count"],
            "total_revenue": float(e["total_revenue"] or 0),
        }
        for e in source_data
    ]

    # --- FINAL SUMMARY ---
    total_orders_summary = order_count_query.count()
    total_revenue_summary = financial_query.aggregate(total_revenue=Sum("total_price"))[
        "total_revenue"
    ] or Decimal("0.00")

    avg_orders_per_day = (
        total_orders_summary / len(formatted_daily_data) if formatted_daily_data else 0
    )

    summary = {
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
        "total_orders": total_orders_summary,
        "total_revenue": float(total_revenue_summary),
        "avg_orders_per_day": round(avg_orders_per_day, 2),
        "peak_hours_detail": sorted(
            hourly_data, key=lambda x: x["order_count"], reverse=True
        )[:3],
        "busiest_days_detail": sorted(
            formatted_daily_data, key=lambda x: x["order_count"], reverse=True
        )[:3],
        "order_source_breakdown": order_source_summary,
    }

    return {
        "summary": summary,
        "hourly_data": hourly_data,
        "daily_data": formatted_daily_data,
        "day_of_week_summary": day_of_week_summary,
    }
