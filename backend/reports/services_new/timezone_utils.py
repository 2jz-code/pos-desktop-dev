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
        """Get the configured business timezone from settings."""
        try:
            # Import here to avoid circular imports
            from settings.config import AppSettings
            
            # Use business settings timezone
            app_settings = AppSettings()
            business_timezone = app_settings.timezone
            
            # Debug logging
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Using business timezone: {business_timezone}")
            
            return pytz.timezone(business_timezone)
        except Exception as e:
            # Debug logging for fallback
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to get business timezone, falling back to Django settings: {e}")
            logger.info(f"Using Django timezone fallback: {settings.TIME_ZONE}")
            
            # Fallback to Django settings if business settings fail
            return pytz.timezone(settings.TIME_ZONE)

    @staticmethod
    def trunc_date_local(field_name):
        """Truncate date field to local timezone instead of UTC."""
        # Convert to local timezone, then truncate to date
        local_tz = TimezoneUtils.get_local_timezone()
        return TruncDate(Cast(field_name, DateTimeField()), tzinfo=local_tz)