from rest_framework import serializers
from datetime import datetime, date
from typing import Dict, Any

from .models import (
    BusinessHoursProfile,
    RegularHours,
    TimeSlot,
    SpecialHours,
    SpecialHoursTimeSlot,
    Holiday
)
from .services import BusinessHoursService


# Read-only serializers for public API endpoints
class TimeSlotSerializer(serializers.ModelSerializer):
    """Serializer for time slots"""
    
    class Meta:
        model = TimeSlot
        fields = ['opening_time', 'closing_time', 'slot_type']


class SpecialHoursTimeSlotSerializer(serializers.ModelSerializer):
    """Serializer for special hours time slots"""
    
    class Meta:
        model = SpecialHoursTimeSlot
        fields = ['opening_time', 'closing_time']


class HoursInfoSerializer(serializers.Serializer):
    """Serializer for hours information (used in responses)"""
    is_closed = serializers.BooleanField()
    slots = serializers.ListField(child=serializers.DictField(), required=False)
    reason = serializers.CharField(required=False, allow_blank=True)


class BusinessHoursStatusSerializer(serializers.Serializer):
    """Serializer for business hours status endpoint"""
    is_open = serializers.BooleanField()
    current_time = serializers.DateTimeField()
    timezone = serializers.CharField()
    next_opening = serializers.DateTimeField(required=False, allow_null=True)
    next_closing = serializers.DateTimeField(required=False, allow_null=True)
    today_hours = HoursInfoSerializer()


class WeeklyScheduleSerializer(serializers.Serializer):
    """Serializer for weekly schedule endpoint"""
    
    def to_representation(self, instance):
        """Convert weekly schedule dict to proper format"""
        if isinstance(instance, dict):
            # Transform the schedule data for better API response
            formatted_schedule = {}
            for date_str, hours_info in instance.items():
                formatted_schedule[date_str] = {
                    'is_closed': hours_info['is_closed'],
                    'slots': hours_info['slots'],
                    'reason': hours_info.get('reason', '')
                }
            return formatted_schedule
        return instance


class DateHoursSerializer(serializers.Serializer):
    """Serializer for date-specific hours"""
    date = serializers.DateField()
    hours = HoursInfoSerializer()


# Admin CRUD serializers
class TimeSlotAdminSerializer(serializers.ModelSerializer):
    """Admin serializer for time slots with full CRUD"""
    
    class Meta:
        model = TimeSlot
        fields = ['id', 'opening_time', 'closing_time', 'slot_type', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class RegularHoursAdminSerializer(serializers.ModelSerializer):
    """Admin serializer for regular hours"""
    time_slots = TimeSlotAdminSerializer(many=True, read_only=True)
    day_name = serializers.SerializerMethodField()
    
    class Meta:
        model = RegularHours
        fields = ['id', 'day_of_week', 'day_name', 'is_closed', 'time_slots', 'created_at', 'updated_at']
        read_only_fields = ['id', 'day_name', 'created_at', 'updated_at']
    
    def get_day_name(self, obj):
        return dict(obj.DAYS_OF_WEEK).get(obj.day_of_week, '')


class SpecialHoursTimeSlotAdminSerializer(serializers.ModelSerializer):
    """Admin serializer for special hours time slots"""
    
    class Meta:
        model = SpecialHoursTimeSlot
        fields = ['id', 'opening_time', 'closing_time', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SpecialHoursAdminSerializer(serializers.ModelSerializer):
    """Admin serializer for special hours"""
    special_time_slots = SpecialHoursTimeSlotAdminSerializer(many=True, read_only=True)
    
    class Meta:
        model = SpecialHours
        fields = [
            'id', 'date', 'is_closed', 'reason', 
            'special_time_slots', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class HolidayAdminSerializer(serializers.ModelSerializer):
    """Admin serializer for holidays"""
    date_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Holiday
        fields = [
            'id', 'name', 'month', 'day', 'date_display', 
            'is_closed', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'date_display', 'created_at', 'updated_at']
    
    def get_date_display(self, obj):
        import calendar
        month_name = calendar.month_name[obj.month]
        return f"{month_name} {obj.day}"


class BusinessHoursProfileAdminSerializer(serializers.ModelSerializer):
    """Admin serializer for business hours profiles"""
    regular_hours = RegularHoursAdminSerializer(many=True, read_only=True)
    special_hours_count = serializers.SerializerMethodField()
    holidays_count = serializers.SerializerMethodField()
    
    class Meta:
        model = BusinessHoursProfile
        fields = [
            'id', 'name', 'timezone', 'is_active', 'is_default',
            'regular_hours', 'special_hours_count', 'holidays_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'special_hours_count', 'holidays_count', 'created_at', 'updated_at']
    
    def get_special_hours_count(self, obj):
        return obj.special_hours.count()
    
    def get_holidays_count(self, obj):
        return obj.holidays.count()
    
    def create(self, validated_data):
        """Override create to set up default regular hours"""
        profile = super().create(validated_data)
        
        # Create regular hours for each day
        days = [
            (0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'),
            (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday')
        ]
        for day_num, day_name in days:
            RegularHours.objects.create(
                profile=profile,
                day_of_week=day_num,
                is_closed=True  # Start with all days closed
            )
        
        return profile


# Service-driven serializers for complex operations
class BusinessHoursCheckSerializer(serializers.Serializer):
    """Serializer for checking business hours at specific time"""
    datetime = serializers.DateTimeField()
    profile_id = serializers.IntegerField(required=False, allow_null=True)
    
    def validate_profile_id(self, value):
        """Validate profile exists and is active"""
        if value is not None:
            try:
                profile = BusinessHoursProfile.objects.get(id=value, is_active=True)
            except BusinessHoursProfile.DoesNotExist:
                raise serializers.ValidationError("Profile not found or inactive")
        return value


class BusinessHoursUpdateSerializer(serializers.Serializer):
    """Serializer for bulk updating business hours"""
    profile_id = serializers.IntegerField()
    regular_hours = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )
    special_hours = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )
    holidays = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )
    
    def validate_profile_id(self, value):
        """Validate profile exists and is active"""
        try:
            profile = BusinessHoursProfile.objects.get(id=value, is_active=True)
        except BusinessHoursProfile.DoesNotExist:
            raise serializers.ValidationError("Profile not found or inactive")
        return value


# Utility serializers for responses
class BusinessHoursServiceResponseSerializer(serializers.Serializer):
    """Generic response wrapper for service calls"""
    success = serializers.BooleanField()
    message = serializers.CharField(required=False)
    data = serializers.DictField(required=False)
    errors = serializers.ListField(required=False)


class BusinessHoursSummarySerializer(serializers.Serializer):
    """Serializer for business hours summary endpoint"""
    profile = BusinessHoursProfileAdminSerializer()
    current_status = BusinessHoursStatusSerializer()
    upcoming_changes = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )
    recent_special_hours = SpecialHoursAdminSerializer(many=True, required=False)