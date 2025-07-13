from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create a router and register viewsets
router = DefaultRouter()
router.register(r"reports", views.ReportViewSet, basename="reports")
router.register(r"saved-reports", views.SavedReportViewSet, basename="saved-reports")
router.register(r"templates", views.ReportTemplateViewSet, basename="report-templates")
router.register(r"cache", views.ReportCacheViewSet, basename="report-cache")
router.register(
    r"executions", views.ReportExecutionViewSet, basename="report-executions"
)
router.register(r"bulk-export", views.BulkExportViewSet, basename="bulk-export")

# Legacy endpoint for backward compatibility
router.register(r"sales-summary", views.SalesSummaryViewSet, basename="sales-summary")

urlpatterns = [
    path("", include(router.urls)),
]

# URL patterns reference:
#
# Core report endpoints:
# GET /reports/summary/?start_date=2024-01-01&end_date=2024-01-31
# GET /reports/sales/?start_date=2024-01-01&end_date=2024-01-31
# GET /reports/products/?start_date=2024-01-01&end_date=2024-01-31&category_id=1&limit=20
# GET /reports/payments/?start_date=2024-01-01&end_date=2024-01-31
# GET /reports/operations/?start_date=2024-01-01&end_date=2024-01-31
# POST /reports/export/
# GET /reports/cache-stats/ (admin only)
# POST /reports/clear-cache/ (admin only)
#
# Saved reports management:
# GET /saved-reports/
# POST /saved-reports/
# GET /saved-reports/{id}/
# PUT /saved-reports/{id}/
# DELETE /saved-reports/{id}/
# POST /saved-reports/{id}/run/
# POST /saved-reports/{id}/duplicate/
#
# Report templates:
# GET /templates/
# POST /templates/
# GET /templates/{id}/
# PUT /templates/{id}/
# DELETE /templates/{id}/
# POST /templates/{id}/create-report/
#
# Report cache (admin only):
# GET /cache/
# GET /cache/{id}/
# POST /cache/cleanup/
#
# Report execution history:
# GET /executions/
# GET /executions/{id}/
#
# Bulk export operations (Phase 3):
# POST /bulk-export/create/
# GET /bulk-export/status/{operation_id}/
# GET /bulk-export/queue-status/ (admin only)
# POST /bulk-export/process-queue/ (admin only)
# POST /bulk-export/templates/
# DELETE /bulk-export/cleanup/ (admin only)
#
# Legacy (backward compatibility):
# GET /sales-summary/
