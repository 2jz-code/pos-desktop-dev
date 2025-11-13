"""
Reports Tests

Basic tests for reports app (Report generation, caching, and scheduling).
"""

import pytest


@pytest.mark.django_db
class TestReportsApp:
    """Test reports app basic functionality"""

    def test_models_import(self):
        """Test that report models can be imported"""
        from reports.models import ReportCache, SavedReport, ReportTemplate, ReportExecution
        assert ReportCache is not None
        assert SavedReport is not None
        assert ReportTemplate is not None
        assert ReportExecution is not None

    def test_app_exists(self):
        """Test that reports app is installed"""
        from django.apps import apps
        assert apps.is_installed('reports')
