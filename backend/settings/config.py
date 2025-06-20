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

            # === TAX & FINANCIAL SETTINGS ===
            self.tax_rate: Decimal = settings_obj.tax_rate
            self.surcharge_percentage: Decimal = settings_obj.surcharge_percentage
            self.currency: str = settings_obj.currency

            # === STORE INFORMATION ===
            self.store_name: str = settings_obj.store_name
            self.store_address: str = settings_obj.store_address
            self.store_phone: str = settings_obj.store_phone
            self.store_email: str = settings_obj.store_email

            # === RECEIPT CONFIGURATION ===
            self.receipt_header: str = settings_obj.receipt_header
            self.receipt_footer: str = settings_obj.receipt_footer

            # === PAYMENT PROCESSING ===
            self.active_terminal_provider: str = settings_obj.active_terminal_provider

            # === BUSINESS HOURS ===
            self.opening_time = settings_obj.opening_time
            self.closing_time = settings_obj.closing_time
            self.timezone: str = settings_obj.timezone

            # === INVENTORY SETTINGS ===
            self.default_inventory_location = settings_obj.default_inventory_location

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

    def get_default_location(self):
        """
        Get the default inventory location. Creates one if none exists.
        """
        if self.default_inventory_location is None:
            # Import here to avoid circular imports
            from inventory.models import Location
            from .models import GlobalSettings
            
            # Create a default location if none exists
            default_location, created = Location.objects.get_or_create(
                name="Main Store",
                defaults={"description": "Default main store location"}
            )
            
            # Update the settings to use this location
            settings_obj = GlobalSettings.objects.get(pk=1)
            settings_obj.default_inventory_location = default_location
            settings_obj.save()
            
            self.default_inventory_location = default_location
            
            if created:
                print("Created default inventory location: Main Store")
        
        return self.default_inventory_location

    def get_store_info(self) -> dict:
        """
        Get store information as a dictionary.
        Useful for receipt generation and display purposes.
        """
        return {
            "name": self.store_name,
            "address": self.store_address,
            "phone": self.store_phone,
            "email": self.store_email,
        }

    def get_financial_settings(self) -> dict:
        """
        Get financial settings as a dictionary.
        Useful for order calculations.
        """
        return {
            "tax_rate": self.tax_rate,
            "surcharge_percentage": self.surcharge_percentage,
            "currency": self.currency,
        }

    def get_receipt_config(self) -> dict:
        """
        Get receipt configuration as a dictionary.
        Useful for receipt generation.
        """
        return {
            "header": self.receipt_header,
            "footer": self.receipt_footer,
        }

    def __str__(self) -> str:
        return (
            f"AppSettings(store='{self.store_name}', "
            f"currency={self.currency}, "
            f"tax_rate={self.tax_rate}, "
            f"provider={self.active_terminal_provider})"
        )


# Create the singleton instance at module level
app_settings = AppSettings()
