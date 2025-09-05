"""
Timezone utilities for reports.
"""
import pytz
from django.conf import settings
from django.db.models import DateTimeField
from django.db.models.functions import TruncDate, Cast


class TimezoneUtils:
    """Utilities for handling timezone-aware date operations in reports."""

    @staticmethod
    def get_local_timezone():
        """Get the configured business timezone from business hours profile."""
        try:
            # Import here to avoid circular imports
            from business_hours.models import BusinessHoursProfile
            
            try:
                # Get the default business hours profile (this is what the admin-site manages)
                profile = BusinessHoursProfile.objects.filter(is_default=True).first()
                if profile:
                    business_timezone = profile.timezone
                    return pytz.timezone(business_timezone)
                else:
                    # Fallback to GlobalSettings if no business hours profile
                    from settings.config import AppSettings
                    app_settings = AppSettings()
                    business_timezone = app_settings.timezone
                    return pytz.timezone(business_timezone)
                    
            except Exception as profile_e:
                # Fallback to GlobalSettings 
                from settings.config import AppSettings
                app_settings = AppSettings()
                business_timezone = app_settings.timezone
                return pytz.timezone(business_timezone)
                
        except Exception as e:
            # Final fallback to Django settings
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to get business timezone from all sources, falling back to Django settings: {e}")
            logger.info(f"Using Django timezone fallback: {settings.TIME_ZONE}")
            
            return pytz.timezone(settings.TIME_ZONE)

    @staticmethod
    def trunc_date_local(field_name):
        """Truncate date field to local timezone instead of UTC."""
        # Convert to local timezone, then truncate to date
        local_tz = TimezoneUtils.get_local_timezone()
        return TruncDate(Cast(field_name, DateTimeField()), tzinfo=local_tz)