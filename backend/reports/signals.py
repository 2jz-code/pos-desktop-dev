from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
import logging

from orders.models import Order
from products.models import Product
from payments.models import PaymentTransaction
from inventory.models import InventoryStock
from users.models import User
from .models import ReportCache

logger = logging.getLogger(__name__)


class ReportCacheInvalidator:
    """
    Centralized cache invalidation logic for reports.
    Follows the Observer pattern to respond to model changes.
    """

    @staticmethod
    def invalidate_cache_by_pattern(pattern: str):
        """Invalidate cache entries matching a pattern"""
        try:
            # Get all cache keys that match the pattern
            cache_entries = ReportCache.objects.filter(
                parameters_hash__icontains=pattern, expires_at__gt=timezone.now()
            )

            for entry in cache_entries:
                cache.delete(entry.parameters_hash)
                entry.delete()
                logger.info(f"Invalidated cache key: {entry.parameters_hash}")

        except Exception as e:
            logger.error(f"Error invalidating cache pattern {pattern}: {e}")

    @staticmethod
    def invalidate_date_range_caches(start_date=None, end_date=None):
        """Invalidate caches that might be affected by date range changes"""
        try:
            # If no dates provided, invalidate recent caches (last 30 days)
            if not start_date:
                start_date = timezone.now().date() - timedelta(days=30)
            if not end_date:
                end_date = timezone.now().date()

            # Find and invalidate affected cache entries
            cache_entries = ReportCache.objects.filter(
                generated_at__date__range=[start_date, end_date]
            )

            for entry in cache_entries:
                cache.delete(entry.parameters_hash)
                entry.delete()
                logger.info(f"Invalidated date-range cache: {entry.parameters_hash}")

        except Exception as e:
            logger.error(f"Error invalidating date range caches: {e}")


# Order-related signals
@receiver(post_save, sender=Order)
def invalidate_order_related_caches(sender, instance, created, **kwargs):
    """
    Invalidate report caches when orders are created or updated.
    This affects summary, sales, and operations reports.
    """
    try:
        # Invalidate summary and sales reports
        ReportCacheInvalidator.invalidate_cache_by_pattern("summary_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("sales_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("operations_report")

        # Invalidate caches for the order's date range
        order_date = instance.created_at.date()
        ReportCacheInvalidator.invalidate_date_range_caches(
            start_date=order_date, end_date=order_date
        )

        logger.info(
            f"Order {instance.id} {'created' if created else 'updated'} - invalidated related caches"
        )

    except Exception as e:
        logger.error(f"Error invalidating order caches for order {instance.id}: {e}")


@receiver(post_delete, sender=Order)
def invalidate_order_deletion_caches(sender, instance, **kwargs):
    """Invalidate caches when orders are deleted"""
    try:
        ReportCacheInvalidator.invalidate_cache_by_pattern("summary_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("sales_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("operations_report")

        logger.info(f"Order {instance.id} deleted - invalidated related caches")

    except Exception as e:
        logger.error(f"Error invalidating caches for deleted order {instance.id}: {e}")


# Payment-related signals
@receiver(post_save, sender=PaymentTransaction)
def invalidate_payment_related_caches(sender, instance, created, **kwargs):
    """
    Invalidate report caches when payments are processed.
    This affects summary, sales, and payments reports.
    """
    try:
        ReportCacheInvalidator.invalidate_cache_by_pattern("summary_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("sales_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("payments_report")

        # Invalidate caches for the payment's date range
        payment_date = instance.created_at.date()
        ReportCacheInvalidator.invalidate_date_range_caches(
            start_date=payment_date, end_date=payment_date
        )

        logger.info(
            f"Payment {instance.id} {'created' if created else 'updated'} - invalidated related caches"
        )

    except Exception as e:
        logger.error(
            f"Error invalidating payment caches for payment {instance.id}: {e}"
        )


# Product-related signals
@receiver(post_save, sender=Product)
def invalidate_product_related_caches(sender, instance, created, **kwargs):
    """
    Invalidate report caches when products are modified.
    This affects products and summary reports.
    """
    try:
        ReportCacheInvalidator.invalidate_cache_by_pattern("products_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("summary_report")

        logger.info(
            f"Product {instance.id} {'created' if created else 'updated'} - invalidated related caches"
        )

    except Exception as e:
        logger.error(
            f"Error invalidating product caches for product {instance.id}: {e}"
        )


@receiver(post_delete, sender=Product)
def invalidate_product_deletion_caches(sender, instance, **kwargs):
    """Invalidate caches when products are deleted"""
    try:
        ReportCacheInvalidator.invalidate_cache_by_pattern("products_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("summary_report")

        logger.info(f"Product {instance.id} deleted - invalidated related caches")

    except Exception as e:
        logger.error(
            f"Error invalidating caches for deleted product {instance.id}: {e}"
        )


# Inventory-related signals
@receiver(post_save, sender=InventoryStock)
def invalidate_inventory_related_caches(sender, instance, created, **kwargs):
    """
    Invalidate report caches when inventory levels change.
    This affects operations and summary reports.
    """
    try:
        ReportCacheInvalidator.invalidate_cache_by_pattern("operations_report")
        ReportCacheInvalidator.invalidate_cache_by_pattern("summary_report")

        logger.info(
            f"Inventory {instance.id} {'created' if created else 'updated'} - invalidated related caches"
        )

    except Exception as e:
        logger.error(
            f"Error invalidating inventory caches for inventory {instance.id}: {e}"
        )


# User-related signals (for cashier performance metrics)
@receiver(post_save, sender=User)
def invalidate_user_related_caches(sender, instance, created, **kwargs):
    """
    Invalidate report caches when user data changes.
    This affects operations reports that include cashier metrics.
    """
    try:
        # Only invalidate if this is a cashier or staff member
        if instance.is_staff or hasattr(instance, "role"):
            ReportCacheInvalidator.invalidate_cache_by_pattern("operations_report")

            logger.info(
                f"User {instance.id} {'created' if created else 'updated'} - invalidated related caches"
            )

    except Exception as e:
        logger.error(f"Error invalidating user caches for user {instance.id}: {e}")


# Scheduled cache cleanup
def cleanup_expired_caches():
    """
    Clean up expired cache entries from the database.
    This should be called periodically via a Celery task.
    """
    try:
        expired_count = ReportCache.objects.filter(
            expires_at__lt=timezone.now()
        ).count()

        if expired_count > 0:
            ReportCache.objects.filter(expires_at__lt=timezone.now()).delete()

            logger.info(f"Cleaned up {expired_count} expired cache entries")

    except Exception as e:
        logger.error(f"Error cleaning up expired caches: {e}")


# Manual cache invalidation utility
def invalidate_all_report_caches():
    """
    Manually invalidate all report caches.
    Useful for debugging or major data changes.
    """
    try:
        cache_count = ReportCache.objects.count()

        # Delete all cache entries
        ReportCache.objects.all().delete()

        # Clear Django cache
        cache.clear()

        logger.info(f"Manually invalidated all {cache_count} report caches")

    except Exception as e:
        logger.error(f"Error manually invalidating all caches: {e}")
