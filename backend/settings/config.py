"""
Centralized configuration management using the Singleton pattern.
This module provides a single point of access to global application settings,
eliminating the need for direct database queries from business logic.
"""

from decimal import Decimal
from typing import Optional, List, Dict, Any
from django.core.exceptions import ImproperlyConfigured


class AppSettings:
    """
    A LAZY singleton class that provides centralized access to global application settings.
    It defers database loading until the first setting is accessed, allowing management
    commands like 'makemigrations' to run before the database schema is up to date.
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
        Initialization is deferred to the first attribute access.
        """
        pass

    def _setup(self):
        """
        The actual setup and loading method. Called only once.
        """
        if not self._initialized:
            self.load_settings()
            self._initialized = True

    def __getattr__(self, name: str) -> Any:
        """
        Lazily loads settings on first access, then retrieves the attribute.
        """
        # First, check if settings are initialized. If not, set them up.
        if not self._initialized:
            self._setup()

        # After setup, the attribute should exist in the instance's __dict__.
        # This check prevents infinite recursion for attributes that truly don't exist.
        try:
            return self.__dict__[name]
        except KeyError:
            raise AttributeError(f"'AppSettings' object has no attribute '{name}'")

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

            # === DEFAULTS ===
            self.default_inventory_location = settings_obj.default_inventory_location
            self.default_store_location = settings_obj.default_store_location

            # === WEB ORDER NOTIFICATION SETTINGS ===
            self.enable_web_order_notifications: bool = settings_obj.enable_web_order_notifications
            self.web_order_notification_sound: str = settings_obj.web_order_notification_sound
            self.web_order_auto_print_receipt: bool = settings_obj.web_order_auto_print_receipt
            self.web_order_auto_print_kitchen: bool = settings_obj.web_order_auto_print_kitchen
            self.default_inventory_location_id: int | None = settings_obj.default_inventory_location_id

            if created:
                print("Created default GlobalSettings instance")

            # Load printer configurations from its own singleton model
            self._load_printer_config()

        except Exception as e:
            raise ImproperlyConfigured(f"Failed to load GlobalSettings: {e}")

    def _load_printer_config(self) -> None:
        """Load printer configurations from the singleton PrinterConfiguration model."""
        from .models import PrinterConfiguration
        try:
            printer_config, created = PrinterConfiguration.objects.get_or_create(pk=1)
            self.receipt_printers: List[Dict[str, Any]] = printer_config.receipt_printers
            self.kitchen_printers: List[Dict[str, Any]] = printer_config.kitchen_printers
            self.kitchen_zones: List[Dict[str, Any]] = printer_config.kitchen_zones
            if created:
                print("Created default PrinterConfiguration instance")
        except Exception as e:
            # If loading fails, default to empty lists to prevent crashes
            print(f"Warning: Failed to load printer configuration: {e}")
            self.receipt_printers = []
            self.kitchen_printers = []
            self.kitchen_zones = []

    def reload(self) -> None:
        """
        Reload settings from the database.
        This method is called when settings are updated to refresh the cache.
        """
        self.load_settings()
        print("AppSettings cache reloaded")

    def get_default_inventory_location(self):
        """
        Get the default inventory location. Creates one if none exists.
        Maintained for backwards compatibility and inventory separation.
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

    def get_default_store_location(self):
        """
        Get the default store location. Creates one if none exists.
        This is the primary method for getting the default physical location.
        """
        if self.default_store_location is None:
            from .models import StoreLocation, GlobalSettings
            
            # Create or get a default store location
            default_location, created = StoreLocation.objects.get_or_create(
                is_default=True,
                defaults={"name": "Main Location"}
            )
            
            # Update the global settings to use this new location
            settings_obj = GlobalSettings.objects.get(pk=1)
            settings_obj.default_store_location = default_location
            settings_obj.save()
            
            self.default_store_location = default_location
            
            if created:
                print("Created default store location: Main Location")
        
        return self.default_store_location

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

    def get_web_order_config(self) -> dict:
        """Get web order notification configuration as a dictionary."""
        return {
            "notifications_enabled": self.enable_web_order_notifications,
            "notification_sound": self.web_order_notification_sound,
            "auto_print_receipt": self.web_order_auto_print_receipt,
            "auto_print_kitchen": self.web_order_auto_print_kitchen,
        }

    def get_printer_config(self) -> dict:
        """Get all printer configurations as a dictionary."""
        return {
            "receipt_printers": self.receipt_printers,
            "kitchen_printers": self.kitchen_printers,
            "kitchen_zones": self.kitchen_zones,
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
