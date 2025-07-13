# reports/urls.py
from django.urls import path
from .views import (
    SavedReportListView,
    SavedReportDetailView,
    SalesReportView,
    ProductReportView,
    PaymentReportView,
    OperationalInsightsView,
    DashboardSummaryView
)

urlpatterns = [
    # Saved reports
    path('saved/', SavedReportListView.as_view(), name='saved-reports'),
    path('saved/<int:pk>/', SavedReportDetailView.as_view(), name='saved-report-detail'),
    
    # Report generation endpoints
    path('sales/', SalesReportView.as_view(), name='sales-report'),
    path('products/', ProductReportView.as_view(), name='product-report'),
    path('payments/', PaymentReportView.as_view(), name='payment-report'),
    path('operational/', OperationalInsightsView.as_view(), name='operational-insights'),
    
    # Dashboard summary
    path('dashboard-summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
]