from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create router for admin ViewSets
router = DefaultRouter()
router.register(r'admin/profiles', views.BusinessHoursProfileViewSet, basename='businesshoursprofile')
router.register(r'admin/regular-hours', views.RegularHoursViewSet, basename='regularhours')
router.register(r'admin/time-slots', views.TimeSlotViewSet, basename='timeslot')
router.register(r'admin/special-hours', views.SpecialHoursViewSet, basename='specialhours')
router.register(r'admin/special-time-slots', views.SpecialHoursTimeSlotViewSet, basename='specialhourstimeslot')
router.register(r'admin/holidays', views.HolidayViewSet, basename='holiday')

app_name = 'business_hours'

urlpatterns = [
    # Public API endpoints (no auth required)
    path('status/', views.BusinessHoursStatusView.as_view(), name='status'),
    path('status/<int:profile_id>/', views.BusinessHoursStatusView.as_view(), name='status-profile'),
    
    path('schedule/', views.BusinessHoursScheduleView.as_view(), name='schedule'),
    path('schedule/<int:profile_id>/', views.BusinessHoursScheduleView.as_view(), name='schedule-profile'),
    
    path('today/', views.BusinessHoursTodayView.as_view(), name='today'),
    path('today/<int:profile_id>/', views.BusinessHoursTodayView.as_view(), name='today-profile'),
    
    path('check/', views.check_business_hours, name='check'),
    
    # Admin endpoints (auth required)
    path('admin/summary/', views.BusinessHoursSummaryView.as_view(), name='admin-summary'),
    path('admin/summary/<int:profile_id>/', views.BusinessHoursSummaryView.as_view(), name='admin-summary-profile'),
    
    # Include router URLs
    path('', include(router.urls)),
]