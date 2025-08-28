"""
Base service class for reports with common functionality and utilities.
"""
import hashlib
import json
import logging
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from django.db.models import Sum
from django.utils import timezone
from django.core.cache import cache

from orders.models import Order
from ..models import ReportCache

logger = logging.getLogger(__name__)


class BaseReportService:
    """Base class for all report services with common functionality."""
    
    # Cache TTL in hours for different report types
    CACHE_TTL = {
        "summary": 1,
        "sales": 2,
        "products": 4,
        "payments": 2,
        "operations": 1,
    }

    @staticmethod
    def _generate_cache_key(report_type: str, parameters: Dict[str, Any]) -> str:
        """Generate a unique cache key for the given report type and parameters."""
        param_str = json.dumps(parameters, sort_keys=True, default=str)
        hash_obj = hashlib.md5(param_str.encode())
        return f"report_{report_type}_{hash_obj.hexdigest()}"

    @staticmethod
    def _get_cached_report(cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieve a cached report if it exists and is not expired."""
        try:
            cached_data = ReportCache.objects.filter(
                parameters_hash=cache_key,
                expires_at__gt=timezone.now()
            ).first()
            
            if cached_data:
                return cached_data.data  # data is already JSONField, no need to parse
        except Exception as e:
            logger.warning(f"Failed to retrieve cached report {cache_key}: {e}")
        return None

    @staticmethod
    def _cache_report(cache_key: str, data: Dict[str, Any], ttl_hours: int = 1) -> None:
        """Cache report data with the specified TTL."""
        try:
            expires_at = timezone.now() + timedelta(hours=ttl_hours)
            
            ReportCache.objects.update_or_create(
                parameters_hash=cache_key,
                defaults={
                    'data': data,  # data is JSONField, store directly
                    'expires_at': expires_at,
                    'report_type': 'sales',  # Add report_type field
                    'parameters': {'cached_at': timezone.now().isoformat()}  # Add parameters field
                }
            )
        except Exception as e:
            logger.warning(f"Failed to cache report {cache_key}: {e}")

    @staticmethod
    def cleanup_expired_cache() -> int:
        """Remove expired cache entries."""
        try:
            deleted_count, _ = ReportCache.objects.filter(
                expires_at__lt=timezone.now()
            ).delete()
            logger.info(f"Cleaned up {deleted_count} expired cache entries")
            return deleted_count
        except Exception as e:
            logger.error(f"Failed to cleanup expired cache: {e}")
            return 0

    @staticmethod
    def invalidate_cache_for_report_type(report_type: str) -> int:
        """Invalidate all cache entries for a specific report type."""
        try:
            deleted_count, _ = ReportCache.objects.filter(
                report_type=report_type
            ).delete()
            logger.info(f"Invalidated {deleted_count} cache entries for report type: {report_type}")
            return deleted_count
        except Exception as e:
            logger.error(f"Failed to invalidate cache for report type {report_type}: {e}")
            return 0

    @classmethod
    def get_cache_stats(cls) -> Dict[str, Any]:
        """Get cache statistics."""
        try:
            total_entries = ReportCache.objects.count()
            expired_entries = ReportCache.objects.filter(
                expires_at__lt=timezone.now()
            ).count()
            
            return {
                'total_entries': total_entries,
                'expired_entries': expired_entries,
                'active_entries': total_entries - expired_entries
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {'total_entries': 0, 'expired_entries': 0, 'active_entries': 0}

    @staticmethod
    def calculate_net_revenue(subtotal, tips, discounts, refunds=0):
        """Calculate net revenue from components."""
        return subtotal + tips - discounts - refunds

    @staticmethod
    def get_revenue_breakdown(subtotal, tips, discounts, tax, surcharges, refunds=0):
        """Get detailed revenue breakdown."""
        gross_revenue = subtotal + tips + tax + surcharges
        net_revenue = subtotal + tips - discounts - refunds
        total_deductions = discounts + refunds
        
        return {
            "gross_revenue": gross_revenue,
            "net_revenue": net_revenue,
            "subtotal": subtotal,
            "tips": tips,
            "tax": tax,
            "surcharges": surcharges,
            "discounts": discounts,
            "refunds": refunds,
            "total_deductions": total_deductions,
        }

    @staticmethod
    def get_quick_metrics() -> Dict[str, Any]:
        """Get quick business metrics for dashboard."""
        try:
            now = timezone.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            # Today's metrics
            today_orders = Order.objects.filter(
                created_at__gte=today_start,
                status=Order.OrderStatus.COMPLETED
            )
            
            today_revenue = today_orders.aggregate(
                total=Sum('grand_total')
            )['total'] or Decimal('0.00')
            
            today_count = today_orders.count()
            
            # This week's metrics
            week_start = today_start - timedelta(days=now.weekday())
            week_orders = Order.objects.filter(
                created_at__gte=week_start,
                status=Order.OrderStatus.COMPLETED
            )
            
            week_revenue = week_orders.aggregate(
                total=Sum('grand_total')
            )['total'] or Decimal('0.00')
            
            week_count = week_orders.count()
            
            return {
                'today': {
                    'revenue': float(today_revenue),
                    'orders': today_count,
                    'avg_order': float(today_revenue / today_count) if today_count > 0 else 0
                },
                'this_week': {
                    'revenue': float(week_revenue),
                    'orders': week_count,
                    'avg_order': float(week_revenue / week_count) if week_count > 0 else 0
                }
            }
        except Exception as e:
            logger.error(f"Failed to get quick metrics: {e}")
            return {
                'today': {'revenue': 0, 'orders': 0, 'avg_order': 0},
                'this_week': {'revenue': 0, 'orders': 0, 'avg_order': 0}
            }