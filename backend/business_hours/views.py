from rest_framework import status, viewsets, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.shortcuts import get_object_or_404
from datetime import datetime, date, timedelta
from typing import Optional

from .models import (
    BusinessHoursProfile,
    RegularHours,
    TimeSlot,
    SpecialHours,
    SpecialHoursTimeSlot,
    Holiday
)
from .services import BusinessHoursService
from .serializers import (
    BusinessHoursStatusSerializer,
    WeeklyScheduleSerializer,
    DateHoursSerializer,
    BusinessHoursProfileAdminSerializer,
    RegularHoursAdminSerializer,
    SpecialHoursAdminSerializer,
    HolidayAdminSerializer,
    TimeSlotAdminSerializer,
    SpecialHoursTimeSlotAdminSerializer,
    BusinessHoursCheckSerializer,
    HoursInfoSerializer
)


# Public API Views (no authentication required)
class BusinessHoursStatusView(APIView):
    """Get current business hours status"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, profile_id=None):
        """
        Get current open/closed status with context
        
        Query params:
        - profile_id: Optional profile ID (uses default if not provided)
        """
        try:
            service = BusinessHoursService(profile_id)
            summary = service.get_status_summary()
            
            serializer = BusinessHoursStatusSerializer(summary)
            return Response(serializer.data)
            
        except BusinessHoursProfile.DoesNotExist:
            return Response(
                {"error": "Business hours profile not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BusinessHoursScheduleView(APIView):
    """Get weekly business hours schedule"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, profile_id=None):
        """
        Get weekly schedule starting from specified date
        
        Query params:
        - start_date: YYYY-MM-DD format (defaults to current date)
        - profile_id: Optional profile ID
        """
        try:
            # Parse start date from query params
            start_date_str = request.query_params.get('start_date')
            if start_date_str:
                try:
                    start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                except ValueError:
                    return Response(
                        {"error": "Invalid date format. Use YYYY-MM-DD"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                start_date = timezone.now().date()
            
            service = BusinessHoursService(profile_id)
            schedule = service.get_weekly_schedule(start_date)
            
            serializer = WeeklyScheduleSerializer(schedule)
            return Response({
                "start_date": start_date.isoformat(),
                "schedule": serializer.data
            })
            
        except BusinessHoursProfile.DoesNotExist:
            return Response(
                {"error": "Business hours profile not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BusinessHoursTodayView(APIView):
    """Get today's business hours"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, profile_id=None):
        """
        Get hours for today
        
        Query params:
        - date: YYYY-MM-DD format (defaults to today)
        - profile_id: Optional profile ID
        """
        try:
            # Parse date from query params
            date_str = request.query_params.get('date')
            if date_str:
                try:
                    target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                except ValueError:
                    return Response(
                        {"error": "Invalid date format. Use YYYY-MM-DD"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                target_date = timezone.now().date()
            
            service = BusinessHoursService(profile_id)
            hours_info = service.get_hours_for_date(target_date)
            
            response_data = {
                "date": target_date.isoformat(),
                "hours": hours_info
            }
            
            serializer = DateHoursSerializer(response_data)
            return Response(serializer.data)
            
        except BusinessHoursProfile.DoesNotExist:
            return Response(
                {"error": "Business hours profile not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def check_business_hours(request):
    """
    Check if business is open at a specific datetime
    
    POST body:
    {
        "datetime": "2024-01-15T14:30:00Z",
        "profile_id": 1  // optional
    }
    """
    serializer = BusinessHoursCheckSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        check_datetime = serializer.validated_data['datetime']
        profile_id = serializer.validated_data.get('profile_id')
        
        service = BusinessHoursService(profile_id)
        is_open = service.is_open(check_datetime)
        
        return Response({
            "datetime": check_datetime.isoformat(),
            "is_open": is_open,
            "profile_id": profile_id or "default"
        })
        
    except BusinessHoursProfile.DoesNotExist:
        return Response(
            {"error": "Business hours profile not found"},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Admin API Views (authentication required)
class BusinessHoursProfileViewSet(viewsets.ModelViewSet):
    """CRUD operations for business hours profiles"""
    queryset = BusinessHoursProfile.objects.all().order_by('-is_default', 'name')
    serializer_class = BusinessHoursProfileAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter by active profiles unless specifically requested"""
        queryset = super().get_queryset()
        include_inactive = self.request.query_params.get('include_inactive', 'false').lower()
        
        if include_inactive != 'true':
            queryset = queryset.filter(is_active=True)
            
        return queryset


class RegularHoursViewSet(viewsets.ModelViewSet):
    """CRUD operations for regular hours"""
    queryset = RegularHours.objects.all().order_by('profile', 'day_of_week')
    serializer_class = RegularHoursAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter by profile if specified"""
        queryset = super().get_queryset()
        profile_id = self.request.query_params.get('profile_id')
        
        if profile_id:
            queryset = queryset.filter(profile_id=profile_id)
            
        return queryset


class TimeSlotViewSet(viewsets.ModelViewSet):
    """CRUD operations for time slots"""
    queryset = TimeSlot.objects.all().order_by('regular_hours', 'opening_time')
    serializer_class = TimeSlotAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter by regular hours if specified"""
        queryset = super().get_queryset()
        regular_hours_id = self.request.query_params.get('regular_hours_id')
        profile_id = self.request.query_params.get('profile_id')
        
        if regular_hours_id:
            queryset = queryset.filter(regular_hours_id=regular_hours_id)
        elif profile_id:
            queryset = queryset.filter(regular_hours__profile_id=profile_id)
            
        return queryset


class SpecialHoursViewSet(viewsets.ModelViewSet):
    """CRUD operations for special hours"""
    queryset = SpecialHours.objects.all().order_by('-date')
    serializer_class = SpecialHoursAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter by profile and date range if specified"""
        queryset = super().get_queryset()
        profile_id = self.request.query_params.get('profile_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if profile_id:
            queryset = queryset.filter(profile_id=profile_id)
            
        if start_date:
            try:
                start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
                queryset = queryset.filter(date__gte=start_date_obj)
            except ValueError:
                pass  # Invalid date format, ignore filter
                
        if end_date:
            try:
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
                queryset = queryset.filter(date__lte=end_date_obj)
            except ValueError:
                pass  # Invalid date format, ignore filter
                
        return queryset


class SpecialHoursTimeSlotViewSet(viewsets.ModelViewSet):
    """CRUD operations for special hours time slots"""
    queryset = SpecialHoursTimeSlot.objects.all().order_by('special_hours', 'opening_time')
    serializer_class = SpecialHoursTimeSlotAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter by special hours if specified"""
        queryset = super().get_queryset()
        special_hours_id = self.request.query_params.get('special_hours_id')
        
        if special_hours_id:
            queryset = queryset.filter(special_hours_id=special_hours_id)
            
        return queryset


class HolidayViewSet(viewsets.ModelViewSet):
    """CRUD operations for holidays"""
    queryset = Holiday.objects.all().order_by('month', 'day')
    serializer_class = HolidayAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter by profile if specified"""
        queryset = super().get_queryset()
        profile_id = self.request.query_params.get('profile_id')
        
        if profile_id:
            queryset = queryset.filter(profile_id=profile_id)
            
        return queryset


# Utility Admin Views
class BusinessHoursSummaryView(APIView):
    """Get comprehensive summary of business hours configuration"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, profile_id=None):
        """Get summary including current status, upcoming changes, etc."""
        try:
            if profile_id:
                profile = get_object_or_404(BusinessHoursProfile, id=profile_id, is_active=True)
            else:
                profile = get_object_or_404(BusinessHoursProfile, is_default=True, is_active=True)
            
            service = BusinessHoursService(profile.id)
            current_status = service.get_status_summary()
            
            # Get upcoming special hours (next 30 days)
            today = timezone.now().date()
            upcoming_special = SpecialHours.objects.filter(
                profile=profile,
                date__gte=today,
                date__lte=today + timedelta(days=30)
            ).order_by('date')[:5]  # Limit to 5 upcoming
            
            response_data = {
                "profile": BusinessHoursProfileAdminSerializer(profile).data,
                "current_status": current_status,
                "upcoming_special_hours": SpecialHoursAdminSerializer(upcoming_special, many=True).data
            }
            
            return Response(response_data)
            
        except BusinessHoursProfile.DoesNotExist:
            return Response(
                {"error": "Business hours profile not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
