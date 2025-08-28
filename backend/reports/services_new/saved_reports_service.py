"""
Service for managing saved reports functionality.
Handles running, duplicating, and managing saved reports.
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from django.utils import timezone
from django.db import transaction

from ..models import SavedReport, ReportExecution
from .base import BaseReportService
from .summary_service import SummaryReportService
from .sales_service import SalesReportService
from .products_service import ProductsReportService
from .payments_service import PaymentsReportService
from .operations_service import OperationsReportService

logger = logging.getLogger(__name__)


class SavedReportService(BaseReportService):
    """Service for managing saved reports."""

    @classmethod
    def run_saved_report(cls, saved_report: SavedReport, user) -> Dict[str, Any]:
        """
        Run a saved report and return the results.
        
        Args:
            saved_report: The SavedReport instance to run
            user: The user running the report
            
        Returns:
            Dict containing the report data
            
        Raises:
            ValueError: If report type is unknown or parameters are invalid
            PermissionError: If user doesn't have permission to run the report
        """
        # Check permissions
        if not user.is_staff and saved_report.user != user:
            raise PermissionError("You don't have permission to run this report")
        
        try:
            # Extract parameters from saved report
            parameters = saved_report.parameters
            start_date = datetime.fromisoformat(
                parameters["start_date"].replace("Z", "+00:00")
            )
            end_date = datetime.fromisoformat(
                parameters["end_date"].replace("Z", "+00:00")
            )
            
            # Generate report based on type
            report_data = cls._generate_report_by_type(
                saved_report.report_type,
                start_date,
                end_date,
                parameters
            )
            
            # Update last run time
            saved_report.last_run = timezone.now()
            saved_report.save(update_fields=['last_run'])
            
            # Track execution
            cls._track_execution(saved_report, user, success=True)
            
            return report_data
            
        except Exception as e:
            # Track failed execution
            cls._track_execution(saved_report, user, success=False, error=str(e))
            raise
    
    @classmethod
    def _generate_report_by_type(
        cls,
        report_type: str,
        start_date: datetime,
        end_date: datetime,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate report based on type."""
        if report_type == "summary":
            return SummaryReportService.generate_summary_report(
                start_date, end_date
            )
        elif report_type == "sales":
            return SalesReportService.generate_sales_report(
                start_date, end_date
            )
        elif report_type == "products":
            category_id = parameters.get("category_id")
            limit = parameters.get("limit", 10)
            trend_period = parameters.get("trend_period", "daily")
            return ProductsReportService.generate_products_report(
                start_date, end_date, category_id, limit, trend_period
            )
        elif report_type == "payments":
            return PaymentsReportService.generate_payments_report(
                start_date, end_date
            )
        elif report_type == "operations":
            return OperationsReportService.generate_operations_report(
                start_date, end_date
            )
        else:
            raise ValueError(f"Unknown report type: {report_type}")
    
    @classmethod
    @transaction.atomic
    def duplicate_saved_report(
        cls,
        saved_report: SavedReport,
        user,
        new_name: Optional[str] = None
    ) -> SavedReport:
        """
        Duplicate a saved report for a user.
        
        Args:
            saved_report: The SavedReport instance to duplicate
            user: The user creating the duplicate
            new_name: Optional custom name for the duplicate
            
        Returns:
            The newly created SavedReport instance
            
        Raises:
            PermissionError: If user doesn't have permission to duplicate the report
        """
        # Check permissions
        if not user.is_staff and saved_report.user != user:
            raise PermissionError("You don't have permission to duplicate this report")
        
        # Create a copy
        duplicated_report = SavedReport.objects.create(
            user=user,
            name=new_name or f"{saved_report.name} (Copy)",
            report_type=saved_report.report_type,
            parameters=saved_report.parameters,
            schedule=saved_report.schedule,
            format=saved_report.format,
            status="active",
        )
        
        logger.info(f"Duplicated report {saved_report.id} to {duplicated_report.id} for user {user.id}")
        
        return duplicated_report
    
    @classmethod
    @transaction.atomic
    def create_from_template(
        cls,
        template,
        user,
        report_name: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> SavedReport:
        """
        Create a saved report from a template.
        
        Args:
            template: The ReportTemplate instance
            user: The user creating the report
            report_name: Name for the new saved report
            parameters: Optional parameters to override template defaults
            
        Returns:
            The newly created SavedReport instance
        """
        # Use template parameters as base and override with provided parameters
        final_parameters = template.default_parameters.copy()
        if parameters:
            final_parameters.update(parameters)
        
        saved_report = SavedReport.objects.create(
            user=user,
            name=report_name,
            report_type=template.report_type,
            parameters=final_parameters,
            schedule=template.default_schedule,
            format=template.default_format,
            status="active",
        )
        
        logger.info(f"Created saved report {saved_report.id} from template {template.id} for user {user.id}")
        
        return saved_report
    
    @classmethod
    def _track_execution(
        cls,
        saved_report: SavedReport,
        user,
        success: bool = True,
        error: Optional[str] = None
    ) -> Optional[ReportExecution]:
        """
        Track the execution of a saved report.
        
        Args:
            saved_report: The SavedReport that was run
            user: The user who ran the report
            success: Whether the execution was successful
            error: Error message if execution failed
            
        Returns:
            The ReportExecution instance if tracking is enabled
        """
        try:
            execution = ReportExecution.objects.create(
                saved_report=saved_report,
                user=user,
                started_at=timezone.now(),
                completed_at=timezone.now() if success else None,
                status="completed" if success else "failed",
                error_message=error,
            )
            return execution
        except Exception as e:
            logger.warning(f"Failed to track report execution: {e}")
            return None
    
    @classmethod
    def get_scheduled_reports(cls) -> list:
        """
        Get all saved reports that are due to run.
        
        Returns:
            List of SavedReport instances that should be executed
        """
        now = timezone.now()
        return list(SavedReport.objects.filter(
            status="active",
            schedule__in=["daily", "weekly", "monthly"],
            next_run__lte=now
        ))
    
    @classmethod
    def update_next_run(cls, saved_report: SavedReport) -> None:
        """
        Update the next_run timestamp for a scheduled report.
        
        Args:
            saved_report: The SavedReport to update
        """
        saved_report.last_run = timezone.now()
        saved_report.next_run = saved_report._calculate_next_run()
        saved_report.save(update_fields=['last_run', 'next_run'])
    
    @classmethod
    def export_saved_report(
        cls,
        saved_report: SavedReport,
        format_type: str = "pdf"
    ) -> bytes:
        """
        Export a saved report to the specified format.
        
        Args:
            saved_report: The SavedReport to export
            format_type: The export format (pdf, excel, csv)
            
        Returns:
            The exported report as bytes
            
        Raises:
            ValueError: If format type is not supported
        """
        # Run the report to get data
        report_data = cls.run_saved_report(saved_report, saved_report.user)
        
        # Use appropriate export service based on report type
        # This would integrate with your existing export functionality
        # Implementation depends on your export service structure
        
        logger.info(f"Exported saved report {saved_report.id} to {format_type}")
        
        # Placeholder - integrate with your existing export services
        return b"exported_data"