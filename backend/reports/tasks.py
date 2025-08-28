from celery import shared_task
from django.utils import timezone
from django.core.files.base import ContentFile
from django.conf import settings
from datetime import datetime, timedelta
import json
import logging
import os
from typing import Dict, Any, Optional, List

from .models import SavedReport, ReportExecution, ReportCache
from .services_new.summary_service import SummaryReportService
from .services_new.sales_service import SalesReportService
from .services_new.payments_service import PaymentsReportService
from .services_new.operations_service import OperationsReportService
from .services_new.export_service import ExportService
from .services_new.products_service import ProductsReportService
from .signals import cleanup_expired_caches, invalidate_all_report_caches
from .advanced_exports import AdvancedExportService, ExportQueue
from users.models import User

logger = logging.getLogger(__name__)


def _generate_products_report_wrapper(user, start_date, end_date, filters=None):
    """Wrapper to match the expected signature for tasks"""
    if filters is None:
        filters = {}
    
    return ProductsReportService.generate_products_report(
        start_date=start_date,
        end_date=end_date,
        category_id=filters.get("category_id"),
        limit=filters.get("limit", 10),
        trend_period=filters.get("trend_period", "auto"),
        use_cache=filters.get("use_cache", True),
    )


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_report_async(
    self,
    report_type: str,
    user_id: int,
    start_date: str,
    end_date: str,
    filters: Optional[Dict[str, Any]] = None,
    saved_report_id: Optional[int] = None,
):
    """
    Generate a report asynchronously in the background.

    This task handles:
    - Large report generation that might timeout in web requests
    - Scheduled report generation
    - Report caching and storage
    """
    try:
        # Get the user
        user = User.objects.get(id=user_id)

        # Create execution record
        execution = ReportExecution.objects.create(
            report_type=report_type,
            user=user,
            parameters={
                "start_date": start_date,
                "end_date": end_date,
                "filters": filters or {},
            },
            status="running",
            task_id=self.request.id,
        )

        logger.info(
            f"Starting background report generation: {report_type} for user {user_id}"
        )

        # Parse dates
        start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()

        # Generate the report based on type
        report_method_map = {
            "summary": SummaryReportService.generate_summary_report,
            "sales": SalesReportService.generate_sales_report,
            "products": _generate_products_report_wrapper,
            "payments": PaymentsReportService.generate_payments_report,
            "operations": OperationsReportService.generate_operations_report,
        }

        if report_type not in report_method_map:
            raise ValueError(f"Unknown report type: {report_type}")

        # Call the appropriate report generation method
        report_method = report_method_map[report_type]
        report_data = report_method(user, start_date_obj, end_date_obj, filters)

        # Update execution record with results
        execution.status = "completed"
        execution.completed_at = timezone.now()
        execution.result_data = report_data
        execution.save()

        # If this is for a saved report, update it
        if saved_report_id:
            try:
                saved_report = SavedReport.objects.get(id=saved_report_id, user=user)
                saved_report.last_generated_at = timezone.now()
                saved_report.last_execution = execution
                saved_report.save()

                # Generate and save file export if needed
                if saved_report.export_format:
                    export_report_async.delay(
                        saved_report.id, saved_report.export_format
                    )

            except SavedReport.DoesNotExist:
                logger.warning(
                    f"SavedReport {saved_report_id} not found for user {user_id}"
                )

        logger.info(
            f"Completed background report generation: {report_type} for user {user_id}"
        )

        return {
            "status": "completed",
            "execution_id": execution.id,
            "report_type": report_type,
            "generated_at": execution.completed_at.isoformat(),
            "data_size": len(str(report_data)),
        }

    except Exception as exc:
        logger.error(f"Error generating report {report_type} for user {user_id}: {exc}")

        # Update execution record with error
        try:
            execution.status = "failed"
            execution.error_message = str(exc)
            execution.completed_at = timezone.now()
            execution.save()
        except:
            pass

        # Retry the task if we haven't exceeded max retries
        if self.request.retries < self.max_retries:
            logger.info(
                f"Retrying report generation task in {self.default_retry_delay} seconds"
            )
            raise self.retry(exc=exc)

        # Max retries exceeded, mark as failed
        return {"status": "failed", "error": str(exc), "retries": self.request.retries}


@shared_task
def export_report_async(saved_report_id: int, format: str):
    """
    Export a saved report to a file format asynchronously.

    Supported formats: csv, xlsx, pdf
    """
    try:
        saved_report = SavedReport.objects.get(id=saved_report_id)

        logger.info(f"Starting export of saved report {saved_report_id} to {format}")

        # Get the latest execution data
        if (
            not saved_report.last_execution
            or not saved_report.last_execution.result_data
        ):
            logger.error(
                f"No execution data available for saved report {saved_report_id}"
            )
            return {"status": "failed", "error": "No report data available"}

        report_data = saved_report.last_execution.result_data

        # Export based on format
        if format == "csv":
            file_content = ExportService.export_to_csv(
                report_data, saved_report.report_type
            )
            file_name = (
                f"{saved_report.name}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
            )
            content_type = "text/csv"

        elif format == "xlsx":
            file_content = ExportService.export_to_xlsx(
                report_data, saved_report.report_type
            )
            file_name = (
                f"{saved_report.name}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            )
            content_type = (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )

        elif format == "pdf":
            file_content = ExportService.export_to_pdf(
                report_data, saved_report.report_type, saved_report.name
            )
            file_name = (
                f"{saved_report.name}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            )
            content_type = "application/pdf"

        else:
            raise ValueError(f"Unsupported export format: {format}")

        # Save the file
        saved_report.file.save(file_name, ContentFile(file_content), save=True)

        logger.info(f"Successfully exported saved report {saved_report_id} to {format}")

        return {
            "status": "completed",
            "file_name": file_name,
            "file_size": len(file_content),
            "content_type": content_type,
        }

    except SavedReport.DoesNotExist:
        logger.error(f"SavedReport {saved_report_id} not found")
        return {"status": "failed", "error": "Report not found"}

    except Exception as exc:
        logger.error(f"Error exporting saved report {saved_report_id}: {exc}")
        return {"status": "failed", "error": str(exc)}


@shared_task
def generate_scheduled_reports():
    """
    Generate scheduled reports that are due.
    This task should be run periodically (e.g., every hour).
    """
    try:
        now = timezone.now()
        current_time = now.time()
        current_weekday = now.weekday()  # 0=Monday, 6=Sunday

        # Find reports that should be generated
        scheduled_reports = SavedReport.objects.filter(
            is_scheduled=True, is_active=True, next_run_at__lte=now
        )

        generated_count = 0

        for report in scheduled_reports:
            try:
                # Calculate date range based on schedule frequency
                if report.schedule_frequency == "daily":
                    start_date = (now - timedelta(days=1)).date()
                    end_date = now.date()
                elif report.schedule_frequency == "weekly":
                    start_date = (now - timedelta(weeks=1)).date()
                    end_date = now.date()
                elif report.schedule_frequency == "monthly":
                    start_date = (now - timedelta(days=30)).date()
                    end_date = now.date()
                else:
                    continue

                # Generate the report
                generate_report_async.delay(
                    report_type=report.report_type,
                    user_id=report.user.id,
                    start_date=start_date.isoformat(),
                    end_date=end_date.isoformat(),
                    filters=report.filters,
                    saved_report_id=report.id,
                )

                # Update next run time
                if report.schedule_frequency == "daily":
                    report.next_run_at = now + timedelta(days=1)
                elif report.schedule_frequency == "weekly":
                    report.next_run_at = now + timedelta(weeks=1)
                elif report.schedule_frequency == "monthly":
                    report.next_run_at = now + timedelta(days=30)

                report.save()
                generated_count += 1

                logger.info(
                    f"Scheduled report {report.id} ({report.name}) queued for generation"
                )

            except Exception as exc:
                logger.error(f"Error scheduling report {report.id}: {exc}")
                continue

        logger.info(f"Scheduled {generated_count} reports for generation")

        return {"status": "completed", "reports_scheduled": generated_count}

    except Exception as exc:
        logger.error(f"Error in scheduled reports task: {exc}")
        return {"status": "failed", "error": str(exc)}


@shared_task
def cleanup_old_reports():
    """
    Clean up old report files and expired cache entries.
    This task should be run daily.
    """
    try:
        cleanup_count = 0

        # Clean up expired cache entries
        cleanup_expired_caches()

        # Clean up old report files (older than 30 days)
        cutoff_date = timezone.now() - timedelta(days=30)

        old_reports = SavedReport.objects.filter(
            created_at__lt=cutoff_date, file__isnull=False
        )

        for report in old_reports:
            try:
                # Delete the file
                if report.file:
                    file_path = report.file.path
                    if os.path.exists(file_path):
                        os.remove(file_path)
                        logger.info(f"Deleted old report file: {file_path}")

                    # Clear the file field
                    report.file = None
                    report.save()
                    cleanup_count += 1

            except Exception as exc:
                logger.error(
                    f"Error deleting old report file for report {report.id}: {exc}"
                )
                continue

        # Clean up old execution records (older than 90 days)
        execution_cutoff = timezone.now() - timedelta(days=90)
        old_executions = ReportExecution.objects.filter(created_at__lt=execution_cutoff)

        execution_count = old_executions.count()
        old_executions.delete()

        logger.info(
            f"Cleaned up {cleanup_count} old report files and {execution_count} old execution records"
        )

        return {
            "status": "completed",
            "files_cleaned": cleanup_count,
            "executions_cleaned": execution_count,
        }

    except Exception as exc:
        logger.error(f"Error in cleanup task: {exc}")
        return {"status": "failed", "error": str(exc)}


@shared_task
def invalidate_report_caches_task():
    """
    Manually invalidate all report caches.
    Useful for maintenance or data consistency issues.
    """
    try:
        invalidate_all_report_caches()

        logger.info("Manually invalidated all report caches via task")

        return {"status": "completed", "message": "All report caches invalidated"}

    except Exception as exc:
        logger.error(f"Error invalidating caches: {exc}")
        return {"status": "failed", "error": str(exc)}


@shared_task
def warm_report_caches():
    """
    Pre-generate commonly used reports to warm the cache.
    This task should be run during off-peak hours.
    """
    try:
        # Get system admin user for cache warming
        admin_user = User.objects.filter(is_superuser=True).first()
        if not admin_user:
            logger.warning("No admin user found for cache warming")
            return {"status": "skipped", "reason": "No admin user available"}

        # Generate common date ranges
        today = timezone.now().date()
        yesterday = today - timedelta(days=1)
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)

        common_ranges = [
            (yesterday, today),  # Yesterday
            (week_ago, today),  # Last week
            (month_ago, today),  # Last month
        ]

        reports_warmed = 0

        for start_date, end_date in common_ranges:
            for report_type in [
                "summary",
                "sales",
                "products",
                "payments",
                "operations",
            ]:
                try:
                    # Generate report to warm cache
                    report_method_map = {
                        "summary": SummaryReportService.generate_summary_report,
                        "sales": SalesReportService.generate_sales_report,
                        "products": _generate_products_report_wrapper,
                        "payments": PaymentsReportService.generate_payments_report,
                        "operations": OperationsReportService.generate_operations_report,
                    }

                    report_method = report_method_map[report_type]
                    report_method(admin_user, start_date, end_date)
                    reports_warmed += 1

                except Exception as exc:
                    logger.error(f"Error warming cache for {report_type}: {exc}")
                    continue

        logger.info(f"Warmed {reports_warmed} report caches")

        return {"status": "completed", "reports_warmed": reports_warmed}

    except Exception as exc:
        logger.error(f"Error in cache warming task: {exc}")
        return {"status": "failed", "error": str(exc)}


# Advanced Export Tasks
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_bulk_export_async(self, operation_id: str):
    """
    Process a bulk export operation asynchronously.

    This task handles:
    - Multiple report generation in sequence
    - File compression and packaging
    - Progress tracking and error handling
    """
    try:
        logger.info(f"Starting bulk export processing: {operation_id}")

        def progress_callback(message):
            """Callback to update task progress"""
            logger.info(f"Bulk export {operation_id}: {message}")
            # You could also update a progress model or cache here

        # Process the bulk export
        result = AdvancedExportService.process_bulk_export(
            operation_id=operation_id, progress_callback=progress_callback
        )

        logger.info(f"Bulk export completed successfully: {operation_id}")

        return {
            "status": "completed",
            "operation_id": operation_id,
            "file_path": result.get("file_path"),
            "file_size": result.get("file_size"),
            "reports_generated": result.get("reports_generated"),
            "completion_time": result.get("completion_time"),
        }

    except Exception as exc:
        logger.error(f"Error processing bulk export {operation_id}: {exc}")

        # Retry the task if we haven't exceeded max retries
        if self.request.retries < self.max_retries:
            logger.info(
                f"Retrying bulk export task in {self.default_retry_delay} seconds"
            )
            raise self.retry(exc=exc)

        # Max retries exceeded, mark as failed
        return {
            "status": "failed",
            "operation_id": operation_id,
            "error": str(exc),
            "retries": self.request.retries,
        }


@shared_task
def create_bulk_export_async(
    user_id: int,
    report_configs: List[Dict[str, Any]],
    export_format: str = "xlsx",
    compress: bool = True,
    priority: int = AdvancedExportService.PRIORITY_NORMAL,
):
    """
    Create and queue a bulk export operation.

    Args:
        user_id: User ID requesting the export
        report_configs: List of report configurations
        export_format: Export format (csv, xlsx, pdf)
        compress: Whether to compress files
        priority: Export priority level
    """
    try:
        user = User.objects.get(id=user_id)

        # Create the bulk export operation
        operation_id, estimated_time = AdvancedExportService.create_bulk_export(
            user=user,
            report_configs=report_configs,
            export_format=export_format,
            compress=compress,
            priority=priority,
        )

        # Add to processing queue
        ExportQueue.add_to_queue(operation_id, priority)

        # Queue the processing task based on priority
        if priority >= AdvancedExportService.PRIORITY_HIGH:
            # High priority - process immediately
            process_bulk_export_async.delay(operation_id)
        else:
            # Normal/Low priority - add to queue for batch processing
            process_export_queue.delay()

        logger.info(f"Bulk export queued: {operation_id} for user {user_id}")

        return {
            "status": "queued",
            "operation_id": operation_id,
            "estimated_time": estimated_time,
            "priority": priority,
        }

    except Exception as exc:
        logger.error(f"Error creating bulk export for user {user_id}: {exc}")
        return {"status": "failed", "error": str(exc)}


@shared_task
def process_export_queue():
    """
    Process the export queue in priority order.
    This task runs periodically to handle queued exports.
    """
    try:
        processed_count = 0
        max_concurrent_exports = 3  # Limit concurrent exports

        while processed_count < max_concurrent_exports:
            # Get next operation from queue
            operation_id = ExportQueue.get_next_operation()

            if not operation_id:
                break  # No more operations in queue

            # Process the export
            process_bulk_export_async.delay(operation_id)
            processed_count += 1

            logger.info(f"Queued export for processing: {operation_id}")

        logger.info(f"Processed {processed_count} exports from queue")

        return {"status": "completed", "exports_processed": processed_count}

    except Exception as exc:
        logger.error(f"Error processing export queue: {exc}")
        return {"status": "failed", "error": str(exc)}


@shared_task
def cleanup_export_files():
    """
    Clean up old export files and metadata.
    This task should be run daily to maintain storage.
    """
    try:
        # Clean up old exports (older than 7 days)
        cleaned_exports = AdvancedExportService.cleanup_old_exports(days_to_keep=7)

        # Clean up old report cache entries (handled by existing function)
        cleanup_expired_caches()

        logger.info(f"Cleaned up {cleaned_exports} old export files")

        return {"status": "completed", "exports_cleaned": cleaned_exports}

    except Exception as exc:
        logger.error(f"Error cleaning up export files: {exc}")
        return {"status": "failed", "error": str(exc)}
