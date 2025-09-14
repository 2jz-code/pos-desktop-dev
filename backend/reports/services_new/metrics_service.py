"""
Business metrics and analytics service.
Handles all business KPIs, performance analytics, and metric calculations.
"""
import logging
import pytz
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional

from django.db import models
from django.db.models import (
    Sum, Count, Avg, F, Q, Max, Min,
    ExpressionWrapper, DecimalField, Value,
)
from django.db.models.functions import (
    TruncDate, TruncHour, TruncWeek, TruncMonth,
    Extract, Coalesce,
)
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from core_backend.infrastructure.cache_utils import (
    cache_static_data,
    cache_dynamic_data,
    cache_session_data,
)

from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from products.models import Product, Category
from users.models import User
from .base import BaseReportService

logger = logging.getLogger(__name__)


class BusinessMetricsService(BaseReportService):
    """Service for business metrics, KPIs, and analytics."""

    # Cache TTL in hours for different metric types
    CACHE_TTL = {
        "business_kpis": 8,    # 8 hours - core metrics change slowly
        "sales_summary": 1,    # 1 hour - more dynamic
        "payment_analytics": 4, # 4 hours - payment data is fairly stable
        "product_performance": 12,  # 12 hours - product trends are slow
        "operational_metrics": 2,   # 2 hours - operational data updates regularly
        "performance_monitoring": 6, # 6 hours - performance metrics are stable
    }

    @classmethod
    @cache_static_data(timeout=3600 * 8)  # 8 hours - business metrics change slowly
    def get_cached_business_kpis(cls):
        """Cache core business KPIs that don't change frequently."""
        try:
            # Calculate key business metrics
            thirty_days_ago = timezone.now() - timedelta(days=30)
            seven_days_ago = timezone.now() - timedelta(days=7)
            today = timezone.now()

            # Monthly performance
            monthly_orders = Order.objects.filter(
                created_at__gte=thirty_days_ago, 
                status=Order.OrderStatus.COMPLETED
            )

            monthly_revenue = monthly_orders.aggregate(
                total=Sum("grand_total")
            )["total"] or Decimal("0.00")

            # Weekly performance
            weekly_orders = Order.objects.filter(
                created_at__gte=seven_days_ago, 
                status=Order.OrderStatus.COMPLETED
            )

            weekly_revenue = weekly_orders.aggregate(
                total=Sum("grand_total")
            )["total"] or Decimal("0.00")

            # Daily performance
            today_start = today.replace(hour=0, minute=0, second=0, microsecond=0)
            daily_orders = Order.objects.filter(
                created_at__gte=today_start, 
                status=Order.OrderStatus.COMPLETED
            )

            daily_revenue = daily_orders.aggregate(
                total=Sum("grand_total")
            )["total"] or Decimal("0.00")

            # Customer metrics
            from customers.models import Customer
            total_customers = Customer.objects.filter(
                is_active=True
            ).count()

            repeat_customers = Order.objects.filter(
                status=Order.OrderStatus.COMPLETED,
                customer__isnull=False
            ).values("customer").annotate(
                order_count=Count("id")
            ).filter(order_count__gt=1).count()

            # Product performance
            top_selling_product = OrderItem.objects.filter(
                order__status=Order.OrderStatus.COMPLETED,
                order__created_at__gte=thirty_days_ago
            ).values("product__name").annotate(
                total_quantity=Sum("quantity")
            ).order_by("-total_quantity").first()

            # Average order metrics
            avg_order_value = monthly_orders.aggregate(
                avg=Avg("grand_total")
            )["avg"] or Decimal("0.00")

            orders_per_day = monthly_orders.count() / 30.0

            return {
                "period": "30_days",
                "monthly_metrics": {
                    "revenue": float(monthly_revenue),
                    "orders": monthly_orders.count(),
                    "avg_order_value": float(avg_order_value),
                    "orders_per_day": round(orders_per_day, 2),
                },
                "weekly_metrics": {
                    "revenue": float(weekly_revenue),
                    "orders": weekly_orders.count(),
                },
                "daily_metrics": {
                    "revenue": float(daily_revenue),
                    "orders": daily_orders.count(),
                },
                "customer_metrics": {
                    "total_customers": total_customers,
                    "repeat_customers": repeat_customers,
                    "repeat_rate": round((repeat_customers / total_customers * 100), 2) if total_customers > 0 else 0,
                },
                "product_insights": {
                    "top_selling_product": top_selling_product.get("product__name", "N/A") if top_selling_product else "N/A",
                    "top_selling_quantity": top_selling_product.get("total_quantity", 0) if top_selling_product else 0,
                },
                "cache_timestamp": timezone.now().isoformat(),
            }

        except Exception as e:
            logger.error(f"Failed to generate business KPIs: {e}", exc_info=True)
            return {
                "error": "Failed to generate business KPIs",
                "cache_timestamp": timezone.now().isoformat(),
            }

    @classmethod
    @cache_dynamic_data(timeout=3600 * 1)  # 1 hour - real-time data
    def get_real_time_sales_summary(cls):
        """Get real-time sales summary for dashboard."""
        try:
            now = timezone.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            # Today's metrics
            today_orders = Order.objects.filter(
                created_at__gte=today_start,
                status=Order.OrderStatus.COMPLETED
            )
            
            today_revenue = today_orders.aggregate(
                total=Sum('grand_total'),
                count=Count('id')
            )
            
            # This hour's metrics
            hour_start = now.replace(minute=0, second=0, microsecond=0)
            hour_orders = Order.objects.filter(
                created_at__gte=hour_start,
                status=Order.OrderStatus.COMPLETED
            )
            
            hour_revenue = hour_orders.aggregate(
                total=Sum('grand_total'),
                count=Count('id')
            )
            
            # Compare with yesterday
            yesterday_start = today_start - timedelta(days=1)
            yesterday_end = today_start
            yesterday_orders = Order.objects.filter(
                created_at__gte=yesterday_start,
                created_at__lt=yesterday_end,
                status=Order.OrderStatus.COMPLETED
            )
            
            yesterday_metrics = yesterday_orders.aggregate(
                total=Sum('grand_total'),
                count=Count('id')
            )
            
            # Calculate growth
            today_total = today_revenue['total'] or Decimal('0.00')
            yesterday_total = yesterday_metrics['total'] or Decimal('0.00')
            
            revenue_growth = 0
            if yesterday_total > 0:
                revenue_growth = float((today_total - yesterday_total) / yesterday_total * 100)
            
            return {
                "today": {
                    "revenue": float(today_total),
                    "orders": today_revenue['count'] or 0,
                    "avg_order": float(today_total / (today_revenue['count'] or 1)),
                },
                "this_hour": {
                    "revenue": float(hour_revenue['total'] or Decimal('0.00')),
                    "orders": hour_revenue['count'] or 0,
                },
                "yesterday_comparison": {
                    "revenue": float(yesterday_total),
                    "orders": yesterday_metrics['count'] or 0,
                    "growth_percentage": round(revenue_growth, 2),
                },
                "cache_timestamp": now.isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to get real-time sales summary: {e}", exc_info=True)
            return {
                "error": "Failed to get real-time sales summary",
                "cache_timestamp": timezone.now().isoformat(),
            }

    @classmethod
    @cache_static_data(timeout=3600 * 4)  # 4 hours - payment data is fairly stable
    def get_payment_analytics(cls):
        """Get payment method analytics and trends."""
        try:
            thirty_days_ago = timezone.now() - timedelta(days=30)
            
            # Payment method breakdown
            payment_methods = PaymentTransaction.objects.filter(
                created_at__gte=thirty_days_ago,
                status='completed'
            ).values('method').annotate(
                total_amount=Sum('amount'),
                count=Count('id'),
                avg_amount=Avg('amount')
            ).order_by('-total_amount')
            
            # Payment success rate
            total_transactions = PaymentTransaction.objects.filter(
                created_at__gte=thirty_days_ago
            ).count()
            
            successful_transactions = PaymentTransaction.objects.filter(
                created_at__gte=thirty_days_ago,
                status='completed'
            ).count()
            
            success_rate = (successful_transactions / total_transactions * 100) if total_transactions > 0 else 0
            
            # Tips analysis
            tips_analysis = PaymentTransaction.objects.filter(
                created_at__gte=thirty_days_ago,
                status='completed',
                tip__gt=0
            ).aggregate(
                total_tips=Sum('tip'),
                avg_tip=Avg('tip'),
                tip_transactions=Count('id')
            )
            
            # Daily payment trends (last 7 days)
            seven_days_ago = timezone.now() - timedelta(days=7)
            daily_trends = PaymentTransaction.objects.filter(
                created_at__gte=seven_days_ago,
                status='completed'
            ).extra(
                {'date': "DATE(created_at)"}
            ).values('date').annotate(
                total_amount=Sum('amount'),
                transaction_count=Count('id')
            ).order_by('date')
            
            return {
                "period": "30_days",
                "payment_methods": [
                    {
                        "method": pm['method'],
                        "total_amount": float(pm['total_amount'] or 0),
                        "transaction_count": pm['count'],
                        "average_amount": float(pm['avg_amount'] or 0),
                        "percentage": round(float(pm['total_amount'] or 0) / sum(float(p['total_amount'] or 0) for p in payment_methods) * 100, 2) if payment_methods else 0
                    }
                    for pm in payment_methods
                ],
                "success_metrics": {
                    "total_transactions": total_transactions,
                    "successful_transactions": successful_transactions,
                    "success_rate": round(success_rate, 2),
                },
                "tips_analysis": {
                    "total_tips": float(tips_analysis['total_tips'] or 0),
                    "average_tip": float(tips_analysis['avg_tip'] or 0),
                    "tip_transactions": tips_analysis['tip_transactions'] or 0,
                    "tip_rate": round((tips_analysis['tip_transactions'] or 0) / successful_transactions * 100, 2) if successful_transactions > 0 else 0,
                },
                "daily_trends": [
                    {
                        "date": trend['date'],
                        "total_amount": float(trend['total_amount'] or 0),
                        "transaction_count": trend['transaction_count'],
                    }
                    for trend in daily_trends
                ],
                "cache_timestamp": timezone.now().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to get payment analytics: {e}", exc_info=True)
            return {
                "error": "Failed to get payment analytics",
                "cache_timestamp": timezone.now().isoformat(),
            }

    @classmethod
    @cache_static_data(timeout=3600 * 12)  # 12 hours - product trends are slow
    def get_cached_product_performance_analysis(cls):
        """Get comprehensive product performance analysis."""
        try:
            thirty_days_ago = timezone.now() - timedelta(days=30)
            
            # Top performing products
            top_products = OrderItem.objects.filter(
                order__status=Order.OrderStatus.COMPLETED,
                order__created_at__gte=thirty_days_ago
            ).values(
                'product__name',
                'product__category__name'
            ).annotate(
                total_quantity=Sum('quantity'),
                total_revenue=Sum(
                    ExpressionWrapper(
                        F('quantity') * F('price_at_sale'),
                        output_field=DecimalField(max_digits=10, decimal_places=2)
                    )
                )
            ).order_by('-total_revenue')[:20]
            
            # Category performance
            category_performance = OrderItem.objects.filter(
                order__status=Order.OrderStatus.COMPLETED,
                order__created_at__gte=thirty_days_ago
            ).values('product__category__name').annotate(
                total_revenue=Sum(
                    ExpressionWrapper(
                        F('quantity') * F('price_at_sale'),
                        output_field=DecimalField(max_digits=10, decimal_places=2)
                    )
                ),
                total_quantity=Sum('quantity'),
                unique_products=Count('product', distinct=True)
            ).order_by('-total_revenue')
            
            # Low performing products (bottom 20%)
            all_products_revenue = OrderItem.objects.filter(
                order__status=Order.OrderStatus.COMPLETED,
                order__created_at__gte=thirty_days_ago
            ).values('product__name').annotate(
                total_revenue=Sum(
                    ExpressionWrapper(
                        F('quantity') * F('price_at_sale'),
                        output_field=DecimalField(max_digits=10, decimal_places=2)
                    )
                )
            ).order_by('total_revenue')
            
            total_products = all_products_revenue.count()
            bottom_20_percent = max(1, int(total_products * 0.2))
            low_performing = all_products_revenue[:bottom_20_percent]
            
            # Product velocity (sales per day)
            product_velocity = OrderItem.objects.filter(
                order__status=Order.OrderStatus.COMPLETED,
                order__created_at__gte=thirty_days_ago
            ).values('product__name').annotate(
                total_quantity=Sum('quantity'),
                daily_avg=ExpressionWrapper(
                    F('total_quantity') / 30.0,
                    output_field=DecimalField(max_digits=10, decimal_places=2)
                )
            ).order_by('-daily_avg')[:10]
            
            return {
                "analysis_period": "30_days",
                "top_products": [
                    {
                        "name": product['product__name'],
                        "category": product['product__category__name'],
                        "quantity_sold": product['total_quantity'],
                        "total_revenue": float(product['total_revenue'] or 0),
                    }
                    for product in top_products
                ],
                "category_performance": [
                    {
                        "category": cat['product__category__name'],
                        "total_revenue": float(cat['total_revenue'] or 0),
                        "total_quantity": cat['total_quantity'],
                        "unique_products": cat['unique_products'],
                    }
                    for cat in category_performance
                ],
                "low_performing_products": [
                    {
                        "name": product['product__name'],
                        "total_revenue": float(product['total_revenue'] or 0),
                    }
                    for product in low_performing
                ],
                "product_velocity": [
                    {
                        "name": product['product__name'],
                        "total_quantity": product['total_quantity'],
                        "daily_average": float(product['daily_avg'] or 0),
                    }
                    for product in product_velocity
                ],
                "summary": {
                    "total_products_analyzed": total_products,
                    "top_20_percent_products": len(top_products),
                    "bottom_20_percent_products": len(low_performing),
                },
                "cache_timestamp": timezone.now().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to get product performance analysis: {e}", exc_info=True)
            return {
                "error": "Failed to get product performance analysis",
                "cache_timestamp": timezone.now().isoformat(),
            }

    @classmethod
    @cache_dynamic_data(timeout=3600 * 2)  # 2 hours - operational data updates regularly
    def get_cached_operational_metrics(cls):
        """Get operational efficiency metrics."""
        try:
            now = timezone.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            seven_days_ago = now - timedelta(days=7)
            
            # Order processing times (from creation to completion)
            completed_orders = Order.objects.filter(
                status=Order.OrderStatus.COMPLETED,
                created_at__gte=seven_days_ago
            ).annotate(
                processing_time=ExpressionWrapper(
                    F('updated_at') - F('created_at'),
                    output_field=models.DurationField()
                )
            )
            
            avg_processing_time = completed_orders.aggregate(
                avg_time=Avg('processing_time')
            )['avg_time']
            
            # Order status distribution
            order_statuses = Order.objects.filter(
                created_at__gte=today_start
            ).values('status').annotate(
                count=Count('id')
            ).order_by('status')
            
            # Peak hours analysis
            hourly_orders = Order.objects.filter(
                created_at__gte=seven_days_ago,
                status=Order.OrderStatus.COMPLETED
            ).extra(
                {'hour': 'EXTRACT(hour FROM created_at)'}
            ).values('hour').annotate(
                order_count=Count('id'),
                total_revenue=Sum('grand_total')
            ).order_by('hour')
            
            # Staff performance (orders handled per staff member)
            staff_performance = Order.objects.filter(
                created_at__gte=seven_days_ago,
                status=Order.OrderStatus.COMPLETED,
                cashier__isnull=False
            ).values(
                'cashier__username',
                'cashier__first_name',
                'cashier__last_name'
            ).annotate(
                orders_handled=Count('id'),
                total_revenue=Sum('grand_total')
            ).order_by('-orders_handled')
            
            # Order type distribution
            order_types = Order.objects.filter(
                created_at__gte=seven_days_ago
            ).values('order_type').annotate(
                count=Count('id'),
                total_revenue=Sum('grand_total')
            ).order_by('-count')
            
            return {
                "analysis_period": "7_days",
                "processing_metrics": {
                    "average_processing_time_minutes": float(avg_processing_time.total_seconds() / 60) if avg_processing_time else 0,
                    "completed_orders": completed_orders.count(),
                },
                "order_status_distribution": [
                    {
                        "status": status['status'],
                        "count": status['count'],
                    }
                    for status in order_statuses
                ],
                "peak_hours": [
                    {
                        "hour": int(hour['hour']),
                        "order_count": hour['order_count'],
                        "total_revenue": float(hour['total_revenue'] or 0),
                    }
                    for hour in hourly_orders
                ],
                "staff_performance": [
                    {
                        "username": staff['cashier__username'],
                        "name": f"{staff['cashier__first_name']} {staff['cashier__last_name']}",
                        "orders_handled": staff['orders_handled'],
                        "total_revenue": float(staff['total_revenue'] or 0),
                        "avg_order_value": float(staff['total_revenue'] / staff['orders_handled']) if staff['orders_handled'] > 0 else 0,
                    }
                    for staff in staff_performance
                ],
                "order_types": [
                    {
                        "type": ot['order_type'],
                        "count": ot['count'],
                        "total_revenue": float(ot['total_revenue'] or 0),
                        "percentage": round(ot['count'] / sum(o['count'] for o in order_types) * 100, 2) if order_types else 0,
                    }
                    for ot in order_types
                ],
                "cache_timestamp": now.isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to get operational metrics: {e}", exc_info=True)
            return {
                "error": "Failed to get operational metrics",
                "cache_timestamp": timezone.now().isoformat(),
            }

    @classmethod
    @cache_session_data(timeout=3600 * 6)  # 6 hours - performance metrics are stable
    def get_performance_monitoring_cache(cls):
        """Get system performance and database metrics."""
        try:
            # Database metrics
            total_orders = Order.objects.count()
            total_order_items = OrderItem.objects.count()
            total_transactions = PaymentTransaction.objects.count()
            total_users = User.objects.count()
            total_products = Product.objects.count()
            
            # Recent activity (last 24 hours)
            last_24_hours = timezone.now() - timedelta(hours=24)
            recent_orders = Order.objects.filter(created_at__gte=last_24_hours).count()
            recent_transactions = PaymentTransaction.objects.filter(created_at__gte=last_24_hours).count()
            
            # Cache performance (if using Redis/Memcached)
            try:
                cache_stats = cache.get_stats()
            except:
                cache_stats = {"error": "Cache stats not available"}
            
            # Growth metrics (comparing last 30 days to previous 30 days)
            now = timezone.now()
            last_30_days = now - timedelta(days=30)
            previous_30_days = now - timedelta(days=60)
            
            current_period_orders = Order.objects.filter(
                created_at__gte=last_30_days
            ).count()
            
            previous_period_orders = Order.objects.filter(
                created_at__gte=previous_30_days,
                created_at__lt=last_30_days
            ).count()
            
            order_growth = 0
            if previous_period_orders > 0:
                order_growth = (current_period_orders - previous_period_orders) / previous_period_orders * 100
            
            return {
                "database_metrics": {
                    "total_orders": total_orders,
                    "total_order_items": total_order_items,
                    "total_transactions": total_transactions,
                    "total_users": total_users,
                    "total_products": total_products,
                },
                "activity_metrics": {
                    "orders_last_24h": recent_orders,
                    "transactions_last_24h": recent_transactions,
                    "avg_orders_per_hour": round(recent_orders / 24, 2),
                },
                "growth_metrics": {
                    "current_period_orders": current_period_orders,
                    "previous_period_orders": previous_period_orders,
                    "order_growth_percentage": round(order_growth, 2),
                },
                "cache_stats": cache_stats,
                "timestamp": timezone.now().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to get performance monitoring metrics: {e}", exc_info=True)
            return {
                "error": "Failed to get performance monitoring metrics",
                "timestamp": timezone.now().isoformat(),
            }

    # Utility methods
    @staticmethod
    def get_local_timezone():
        """Get the local timezone setting."""
        return getattr(settings, 'TIME_ZONE', 'UTC')

    @staticmethod
    def trunc_date_local(field_name):
        """Truncate date to local timezone."""
        local_tz = BusinessMetricsService.get_local_timezone()
        if local_tz != 'UTC':
            # Convert to local timezone before truncating
            return TruncDate(field_name, tzinfo=pytz.timezone(local_tz))
        return TruncDate(field_name)

    @classmethod
    def get_historical_trends_data(cls):
        """Get historical trends for various business metrics."""
        try:
            # Get data for the last 12 months
            end_date = timezone.now()
            start_date = end_date - timedelta(days=365)
            
            # Monthly revenue trends
            monthly_trends = Order.objects.filter(
                created_at__gte=start_date,
                status=Order.OrderStatus.COMPLETED
            ).extra(
                {'month': "DATE_FORMAT(created_at, '%%Y-%%m')"}
            ).values('month').annotate(
                total_revenue=Sum('grand_total'),
                order_count=Count('id'),
                avg_order_value=Avg('grand_total')
            ).order_by('month')
            
            # Weekly trends (last 12 weeks)
            twelve_weeks_ago = end_date - timedelta(weeks=12)
            weekly_trends = Order.objects.filter(
                created_at__gte=twelve_weeks_ago,
                status=Order.OrderStatus.COMPLETED
            ).extra(
                {'week': "DATE_FORMAT(created_at, '%%Y-%%u')"}
            ).values('week').annotate(
                total_revenue=Sum('grand_total'),
                order_count=Count('id')
            ).order_by('week')
            
            # Customer acquisition trends
            customer_trends = User.objects.filter(
                role=User.Role.CUSTOMER,
                date_joined__gte=start_date
            ).extra(
                {'month': "DATE_FORMAT(date_joined, '%%Y-%%m')"}
            ).values('month').annotate(
                new_customers=Count('id')
            ).order_by('month')
            
            return {
                "monthly_trends": [
                    {
                        "month": trend['month'],
                        "total_revenue": float(trend['total_revenue'] or 0),
                        "order_count": trend['order_count'],
                        "avg_order_value": float(trend['avg_order_value'] or 0),
                    }
                    for trend in monthly_trends
                ],
                "weekly_trends": [
                    {
                        "week": trend['week'],
                        "total_revenue": float(trend['total_revenue'] or 0),
                        "order_count": trend['order_count'],
                    }
                    for trend in weekly_trends
                ],
                "customer_acquisition": [
                    {
                        "month": trend['month'],
                        "new_customers": trend['new_customers'],
                    }
                    for trend in customer_trends
                ],
                "cache_timestamp": timezone.now().isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Failed to get historical trends: {e}", exc_info=True)
            return {
                "error": "Failed to get historical trends",
                "cache_timestamp": timezone.now().isoformat(),
            }