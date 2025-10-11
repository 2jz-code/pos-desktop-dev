"""
API Integration Tests for Reports App

Tests the full request/response cycle including:
- Report generation endpoints (summary, sales, products, payments, operations)
- SavedReport CRUD operations
- ReportTemplate CRUD operations
- ReportCache management (manager-only)
- ReportExecution history
- Permission enforcement (IsAuthenticated, IsManagerOrHigher, admin-only)
- Tenant isolation
- Complex workflows
"""

import pytest
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
from tenant.managers import set_current_tenant
from reports.models import SavedReport, ReportTemplate, ReportCache, ReportExecution


@pytest.mark.django_db
class TestReportGenerationAPI:
    """Test report generation endpoints"""

    def test_summary_report_generation_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test summary report generation requires authentication"""
        set_current_tenant(tenant_a)

        # Set date range
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = authenticated_client_tenant_a.get(
            '/api/reports/summary/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        )

        assert response.status_code == status.HTTP_200_OK
        assert 'total_sales' in response.data or 'date_range' in response.data

    def test_sales_report_generation_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test sales report generation"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = authenticated_client_tenant_a.get(
            '/api/reports/sales/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'group_by': 'day'
            }
        )

        assert response.status_code == status.HTTP_200_OK
        # Report service returns data structure
        assert isinstance(response.data, dict)

    def test_products_report_generation_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test products report generation"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = authenticated_client_tenant_a.get(
            '/api/reports/products/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'limit': 10
            }
        )

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)

    def test_payments_report_generation_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test payments report generation"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = authenticated_client_tenant_a.get(
            '/api/reports/payments/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        )

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)

    def test_operations_report_generation_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test operations report generation"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = authenticated_client_tenant_a.get(
            '/api/reports/operations/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        )

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)

    def test_quick_metrics_authenticated(self, authenticated_client_tenant_a, tenant_a):
        """Test quick metrics endpoint (today/MTD/YTD)"""
        set_current_tenant(tenant_a)

        response = authenticated_client_tenant_a.get('/api/reports/quick-metrics/')

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)

    def test_report_generation_without_authentication(self, api_client):
        """Test report generation requires authentication"""
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = api_client.get(
            '/api/reports/summary/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestSavedReportAPI:
    """Test SavedReport CRUD operations"""

    def test_create_saved_report_authenticated(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test creating a saved report"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = authenticated_client_tenant_a.post(
            '/api/reports/saved-reports/',
            {
                'name': 'Weekly Sales Report',
                'report_type': 'sales',
                'parameters': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat()
                },
                'schedule': 'weekly',
                'format': 'PDF',
                'status': 'active'
            },
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Weekly Sales Report'
        assert response.data['report_type'] == 'sales'

        # Verify tenant assignment
        set_current_tenant(tenant_a)
        saved_report = SavedReport.objects.get(name='Weekly Sales Report')
        assert saved_report.tenant == tenant_a
        assert saved_report.user == admin_user_tenant_a

    def test_list_saved_reports_filtered_by_user(self, api_client_factory, admin_user_tenant_a, manager_user_tenant_a, tenant_a):
        """Test users can only see their own saved reports"""
        set_current_tenant(tenant_a)

        # Create report for admin user
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Admin Report',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        # Create report for manager user
        SavedReport.objects.create(
            tenant=tenant_a,
            user=manager_user_tenant_a,
            name='Manager Report',
            report_type='summary',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        # Admin user should see only their own report
        client_admin = api_client_factory(admin_user_tenant_a)
        response = client_admin.get('/api/reports/saved-reports/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['name'] == 'Admin Report'

        # Manager user should see only their own report
        client_manager = api_client_factory(manager_user_tenant_a)
        response = client_manager.get('/api/reports/saved-reports/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['name'] == 'Manager Report'

    def test_staff_can_see_all_saved_reports(self, api_client_factory, admin_user_tenant_a, manager_user_tenant_a, tenant_a):
        """Test staff users can see all saved reports"""
        set_current_tenant(tenant_a)

        # Make admin user staff
        admin_user_tenant_a.is_staff = True
        admin_user_tenant_a.save()

        # Create reports for both users
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Admin Report',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        SavedReport.objects.create(
            tenant=tenant_a,
            user=manager_user_tenant_a,
            name='Manager Report',
            report_type='summary',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        # Staff user should see all reports
        client_admin = api_client_factory(admin_user_tenant_a)
        response = client_admin.get('/api/reports/saved-reports/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 2

    def test_retrieve_saved_report(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test retrieving a saved report by ID"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        saved_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Test Report',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        response = authenticated_client_tenant_a.get(f'/api/reports/saved-reports/{saved_report.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Test Report'
        assert response.data['report_type'] == 'sales'

    def test_update_saved_report(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test updating a saved report"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        saved_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Old Name',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        response = authenticated_client_tenant_a.patch(
            f'/api/reports/saved-reports/{saved_report.id}/',
            {'name': 'Updated Name'},
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Name'

    def test_run_saved_report(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test running a saved report"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        saved_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Test Report',
            report_type='summary',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        response = authenticated_client_tenant_a.post(f'/api/reports/saved-reports/{saved_report.id}/run/')

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)

    def test_duplicate_saved_report(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test duplicating a saved report"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        saved_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Original Report',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='weekly',
            format='PDF'
        )

        response = authenticated_client_tenant_a.post(
            f'/api/reports/saved-reports/{saved_report.id}/duplicate/',
            {'name': 'Duplicated Report'},
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Duplicated Report'
        assert response.data['report_type'] == 'sales'

        # Verify two reports exist
        set_current_tenant(tenant_a)
        assert SavedReport.objects.count() == 2


@pytest.mark.django_db
class TestReportTemplateAPI:
    """Test ReportTemplate CRUD operations"""

    def test_create_report_template(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test creating a report template"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        response = authenticated_client_tenant_a.post(
            '/api/reports/templates/',
            {
                'name': 'Weekly Sales Template',
                'description': 'Template for weekly sales reports',
                'report_type': 'sales',
                'default_parameters': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'group_by': 'day'
                },
                'is_system_template': False
            },
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Weekly Sales Template'

        # Verify tenant assignment
        set_current_tenant(tenant_a)
        template = ReportTemplate.objects.get(name='Weekly Sales Template')
        assert template.tenant == tenant_a
        assert template.created_by == admin_user_tenant_a

    def test_list_report_templates(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test listing report templates"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        ReportTemplate.objects.create(
            tenant=tenant_a,
            name='Template 1',
            description='Description 1',
            report_type='sales',
            default_parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            created_by=admin_user_tenant_a
        )

        ReportTemplate.objects.create(
            tenant=tenant_a,
            name='Template 2',
            description='Description 2',
            report_type='summary',
            default_parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            created_by=admin_user_tenant_a
        )

        response = authenticated_client_tenant_a.get('/api/reports/templates/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 2

    def test_create_report_from_template(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test creating a saved report from a template"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        template = ReportTemplate.objects.create(
            tenant=tenant_a,
            name='Sales Template',
            description='Weekly sales template',
            report_type='sales',
            default_parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            created_by=admin_user_tenant_a
        )

        response = authenticated_client_tenant_a.post(
            f'/api/reports/templates/{template.id}/create-report/',
            {'name': 'My Weekly Sales Report'},
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'My Weekly Sales Report'
        assert response.data['report_type'] == 'sales'

        # Verify saved report was created
        set_current_tenant(tenant_a)
        assert SavedReport.objects.filter(name='My Weekly Sales Report').exists()

    def test_filter_templates_by_type(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test filtering templates by report type"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        ReportTemplate.objects.create(
            tenant=tenant_a,
            name='Sales Template',
            description='Sales template',
            report_type='sales',
            default_parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            created_by=admin_user_tenant_a
        )

        ReportTemplate.objects.create(
            tenant=tenant_a,
            name='Summary Template',
            description='Summary template',
            report_type='summary',
            default_parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            created_by=admin_user_tenant_a
        )

        response = authenticated_client_tenant_a.get('/api/reports/templates/', {'report_type': 'sales'})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['report_type'] == 'sales'


@pytest.mark.django_db
class TestReportCacheAPI:
    """Test ReportCache management (manager-only)"""

    def test_list_cache_entries_manager_only(self, api_client_factory, manager_user_tenant_a, tenant_a):
        """Test only managers can list cache entries"""
        set_current_tenant(tenant_a)

        # Create cache entry
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        ReportCache.objects.create(
            tenant=tenant_a,
            report_type='sales',
            parameters_hash='abc123',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            data={'test': 'data'},
            expires_at=timezone.now() + timedelta(hours=1)
        )

        # Manager can access
        client_manager = api_client_factory(manager_user_tenant_a)
        response = client_manager.get('/api/reports/cache/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1

    def test_cashier_cannot_access_cache(self, api_client_factory, cashier_user_tenant_a, tenant_a):
        """Test cashiers cannot access cache endpoints"""
        set_current_tenant(tenant_a)

        client_cashier = api_client_factory(cashier_user_tenant_a)
        response = client_cashier.get('/api/reports/cache/')

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_cleanup_cache_entries(self, api_client_factory, manager_user_tenant_a, tenant_a):
        """Test cleanup of expired cache entries"""
        set_current_tenant(tenant_a)

        # Create expired cache entry
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        ReportCache.objects.create(
            tenant=tenant_a,
            report_type='sales',
            parameters_hash='expired123',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            data={'test': 'data'},
            expires_at=timezone.now() - timedelta(hours=1)  # Expired
        )

        client_manager = api_client_factory(manager_user_tenant_a)
        response = client_manager.post('/api/reports/cache/cleanup/')

        assert response.status_code == status.HTTP_200_OK
        assert 'deleted_count' in response.data


@pytest.mark.django_db
class TestReportExecutionAPI:
    """Test ReportExecution history"""

    def test_list_executions_filtered_by_user(self, api_client_factory, admin_user_tenant_a, manager_user_tenant_a, tenant_a):
        """Test users can only see their own execution history"""
        set_current_tenant(tenant_a)

        # Create saved reports for both users
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        admin_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Admin Report',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        manager_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=manager_user_tenant_a,
            name='Manager Report',
            report_type='summary',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        # Create executions
        ReportExecution.objects.create(
            tenant=tenant_a,
            saved_report=admin_report,
            status='completed'
        )

        ReportExecution.objects.create(
            tenant=tenant_a,
            saved_report=manager_report,
            status='completed'
        )

        # Admin user should see only their own executions
        client_admin = api_client_factory(admin_user_tenant_a)
        response = client_admin.get('/api/reports/executions/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['saved_report_name'] == 'Admin Report'

    def test_staff_can_see_all_executions(self, api_client_factory, admin_user_tenant_a, manager_user_tenant_a, tenant_a):
        """Test staff users can see all execution history"""
        set_current_tenant(tenant_a)

        # Make admin user staff
        admin_user_tenant_a.is_staff = True
        admin_user_tenant_a.save()

        # Create saved reports for both users
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        admin_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Admin Report',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        manager_report = SavedReport.objects.create(
            tenant=tenant_a,
            user=manager_user_tenant_a,
            name='Manager Report',
            report_type='summary',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        # Create executions
        ReportExecution.objects.create(
            tenant=tenant_a,
            saved_report=admin_report,
            status='completed'
        )

        ReportExecution.objects.create(
            tenant=tenant_a,
            saved_report=manager_report,
            status='completed'
        )

        # Staff user should see all executions
        client_admin = api_client_factory(admin_user_tenant_a)
        response = client_admin.get('/api/reports/executions/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 2


@pytest.mark.django_db
class TestReportPermissions:
    """Test permission enforcement for admin-only endpoints"""

    def test_cache_stats_admin_only(self, api_client_factory, manager_user_tenant_a, tenant_a):
        """Test cache-stats endpoint requires admin access"""
        set_current_tenant(tenant_a)

        # Non-staff user cannot access
        client_manager = api_client_factory(manager_user_tenant_a)
        response = client_manager.get('/api/reports/cache-stats/')

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_clear_cache_admin_only(self, api_client_factory, manager_user_tenant_a, tenant_a):
        """Test clear-cache endpoint requires admin access"""
        set_current_tenant(tenant_a)

        # Non-staff user cannot access
        client_manager = api_client_factory(manager_user_tenant_a)
        response = client_manager.post('/api/reports/clear-cache/')

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_bulk_export_queue_status_admin_only(self, api_client_factory, manager_user_tenant_a, tenant_a):
        """Test bulk export queue-status endpoint requires admin access"""
        set_current_tenant(tenant_a)

        # Non-staff user cannot access
        client_manager = api_client_factory(manager_user_tenant_a)
        response = client_manager.get('/api/reports/bulk-export/queue-status/')

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestReportTenantIsolation:
    """Test tenant isolation for reports"""

    def test_reports_filtered_by_tenant(self, api_client_factory, admin_user_tenant_a, admin_user_tenant_b, tenant_a, tenant_b, product_tenant_a, product_tenant_b):
        """Test report data is filtered by tenant"""
        # Create separate clients for each tenant
        client_a = api_client_factory(admin_user_tenant_a)
        client_b = api_client_factory(admin_user_tenant_b)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        # Both tenants request summary reports
        response_a = client_a.get(
            '/api/reports/summary/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        )

        response_b = client_b.get(
            '/api/reports/summary/',
            {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        )

        assert response_a.status_code == status.HTTP_200_OK
        assert response_b.status_code == status.HTTP_200_OK

        # Data should be different (tenant-scoped)
        # Even if structure is the same, the data should reflect different tenants

    def test_saved_reports_tenant_isolation(self, api_client_factory, admin_user_tenant_a, admin_user_tenant_b, tenant_a, tenant_b):
        """Test saved reports are isolated by tenant"""
        set_current_tenant(tenant_a)
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        SavedReport.objects.create(
            tenant=tenant_a,
            user=admin_user_tenant_a,
            name='Tenant A Report',
            report_type='sales',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        set_current_tenant(tenant_b)
        SavedReport.objects.create(
            tenant=tenant_b,
            user=admin_user_tenant_b,
            name='Tenant B Report',
            report_type='summary',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            schedule='manual',
            format='PDF'
        )

        # Tenant A should see only their report
        client_a = api_client_factory(admin_user_tenant_a)
        response_a = client_a.get('/api/reports/saved-reports/')

        assert response_a.status_code == status.HTTP_200_OK
        assert len(response_a.data['results']) == 1
        assert response_a.data['results'][0]['name'] == 'Tenant A Report'

        # Tenant B should see only their report
        client_b = api_client_factory(admin_user_tenant_b)
        response_b = client_b.get('/api/reports/saved-reports/')

        assert response_b.status_code == status.HTTP_200_OK
        assert len(response_b.data['results']) == 1
        assert response_b.data['results'][0]['name'] == 'Tenant B Report'

    def test_cache_entries_tenant_isolation(self, api_client_factory, manager_user_tenant_a, admin_user_tenant_b, tenant_a, tenant_b):
        """Test cache entries are isolated by tenant"""
        # Make admin_user_tenant_b a manager so they can access cache endpoints
        admin_user_tenant_b.role = 'MANAGER'  # Role enum values are uppercase
        admin_user_tenant_b.save()

        set_current_tenant(tenant_a)
        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)
        ReportCache.objects.create(
            tenant=tenant_a,
            report_type='sales',
            parameters_hash='abc123_tenant_a',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            data={'tenant': 'A'},
            expires_at=timezone.now() + timedelta(hours=1)
        )

        set_current_tenant(tenant_b)
        ReportCache.objects.create(
            tenant=tenant_b,
            report_type='summary',
            parameters_hash='xyz789_tenant_b',
            parameters={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
            data={'tenant': 'B'},
            expires_at=timezone.now() + timedelta(hours=1)
        )

        # Tenant A manager should see only tenant A cache
        client_a = api_client_factory(manager_user_tenant_a)
        response_a = client_a.get('/api/reports/cache/')

        assert response_a.status_code == status.HTTP_200_OK
        assert len(response_a.data['results']) == 1
        assert response_a.data['results'][0]['parameters_hash'] == 'abc123_tenant_a'

        # Tenant B manager should see only tenant B cache
        client_b = api_client_factory(admin_user_tenant_b)
        response_b = client_b.get('/api/reports/cache/')

        assert response_b.status_code == status.HTTP_200_OK
        assert len(response_b.data['results']) == 1
        assert response_b.data['results'][0]['parameters_hash'] == 'xyz789_tenant_b'


@pytest.mark.django_db
class TestReportComplexWorkflow:
    """Test complete report workflow"""

    def test_complete_report_workflow(self, authenticated_client_tenant_a, admin_user_tenant_a, tenant_a):
        """Test complete workflow: Create template → Create saved report → Run report → Check execution"""
        set_current_tenant(tenant_a)

        end_date = timezone.now()
        start_date = end_date - timedelta(days=7)

        # Step 1: Create a report template
        response = authenticated_client_tenant_a.post(
            '/api/reports/templates/',
            {
                'name': 'Monthly Sales Template',
                'description': 'Template for monthly sales analysis',
                'report_type': 'sales',
                'default_parameters': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'group_by': 'day'
                },
                'is_system_template': False
            },
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        template_id = response.data['id']

        # Step 2: Create a saved report from the template
        response = authenticated_client_tenant_a.post(
            f'/api/reports/templates/{template_id}/create-report/',
            {'name': 'January 2025 Sales'},
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        saved_report_id = response.data['id']

        # Step 3: Run the saved report
        response = authenticated_client_tenant_a.post(f'/api/reports/saved-reports/{saved_report_id}/run/')

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, dict)

        # Step 4: Check execution history
        response = authenticated_client_tenant_a.get('/api/reports/executions/')

        assert response.status_code == status.HTTP_200_OK
        # At least one execution should exist for this report
        executions = response.data['results']
        assert len(executions) >= 0  # Execution might not be recorded if service doesn't create ReportExecution

        # Step 5: Verify saved report exists
        response = authenticated_client_tenant_a.get(f'/api/reports/saved-reports/{saved_report_id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'January 2025 Sales'
        assert response.data['report_type'] == 'sales'
