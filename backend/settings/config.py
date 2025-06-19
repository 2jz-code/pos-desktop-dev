"""
Centralized configuration management using the Singleton pattern.
This module provides a single point of access to global application settings,
eliminating the need for direct database queries from business logic.
"""

from decimal import Decimal
from typing import Optional
from django.core.exceptions import ImproperlyConfigured


class AppSettings:
    """
    A singleton class that provides centralized access to global application settings.
    This class caches the settings in memory and provides a clean interface
    for accessing configuration throughout the application.
    """

    _instance: Optional["AppSettings"] = None
    _initialized: bool = False

    def __new__(cls) -> "AppSettings":
        """
        Implement the singleton pattern to ensure only one instance exists.
        """
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """
        Initialize the singleton instance only once.
        """
        if not self._initialized:
            self.load_settings()
            self._initialized = True

    def load_settings(self) -> None:
        """
        Load settings from the database and populate instance attributes.
        This method performs the database query and caches the results.
        """
        # Import here to avoid circular imports
        from .models import GlobalSettings

        try:
            # Use get_or_create with pk=1 to ensure we always have settings
            settings_obj, created = GlobalSettings.objects.get_or_create(pk=1)

            # Populate instance attributes from the model
            self.tax_rate: Decimal = settings_obj.tax_rate
            self.surcharge_percentage: Decimal = settings_obj.surcharge_percentage
            self.active_terminal_provider: str = settings_obj.active_terminal_provider

            if created:
                print("Created default GlobalSettings instance")

        except Exception as e:
            raise ImproperlyConfigured(f"Failed to load GlobalSettings: {e}")

    def reload(self) -> None:
        """
        Reload settings from the database.
        This method is called when settings are updated to refresh the cache.
        """
        self.load_settings()
        print("AppSettings cache reloaded")

    def __str__(self) -> str:
        return (
            f"AppSettings(tax_rate={self.tax_rate}, "
            f"surcharge_percentage={self.surcharge_percentage}, "
            f"active_terminal_provider={self.active_terminal_provider})"
        )


# Create the singleton instance at module level
app_settings = AppSettings()
