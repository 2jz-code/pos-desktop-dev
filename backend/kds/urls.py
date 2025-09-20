from django.urls import path
from . import views

app_name = 'kds'

urlpatterns = [
    # Zone-specific history
    path('zones/<str:zone_id>/history/', views.zone_history, name='zone_history'),

    # Global search across all zones
    path('history/search/', views.search_history, name='search_history'),

    # Order timeline details
    path('orders/<str:order_id>/timeline/', views.order_timeline, name='order_timeline'),

    # Recent completion summary
    path('summary/recent/', views.recent_summary, name='recent_summary'),
]