"""
Centralized configuration management using the Singleton pattern.
This module provides a single point of access to global application settings,
eliminating the need for direct database queries from business logic.
"""

from decimal import Decimal
from typing import Optional, List, Dict, Any
from django.core.exceptions import ImproperlyConfigured
from core_backend.infrastructure.cache_utils import cache_static_data, cache_dynamic_data
import logging

logger = logging.getLogger(__name__)


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

        Multi-tenant: TenantManager automatically filters by current tenant.
        Each tenant gets their own GlobalSettings instance.
        """
        # Import here to avoid circular imports
        from .models import GlobalSettings
        from tenant.managers import get_current_tenant

        try:
            tenant = get_current_tenant()
            if not tenant:
                raise ImproperlyConfigured("No tenant context available for settings")

            # Try to get existing settings for this tenant
            try:
                settings_obj = GlobalSettings.objects.get(tenant=tenant)
                created = False
            except GlobalSettings.DoesNotExist:
                # Create new settings for this tenant
                # Note: Don't use get_or_create due to potential id sequence conflicts
                # from pre-multi-tenancy data
                settings_obj = GlobalSettings(
                    tenant=tenant,
                    store_name=f"{tenant.name}",
                    store_address='',
                    store_phone='',
                    store_email='',
                )
                settings_obj.save()
                created = True

            # === TAX & FINANCIAL SETTINGS ===
            self.tax_rate: Decimal = settings_obj.tax_rate
            self.surcharge_percentage: Decimal = settings_obj.surcharge_percentage
            self.currency: str = settings_obj.currency
            self.allow_discount_stacking: bool = settings_obj.allow_discount_stacking

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
            self.default_inventory_location_id: int | None = (
                settings_obj.default_inventory_location_id
            )
            
            # === INVENTORY THRESHOLD DEFAULTS ===
            self.default_low_stock_threshold: Decimal = settings_obj.default_low_stock_threshold
            self.default_expiration_threshold: int = settings_obj.default_expiration_threshold

            if created:
                logger.info("Created default GlobalSettings instance")

            # Load extended configurations from their own singleton models
            self._load_printer_config()
            self._load_web_order_config()

        except Exception as e:
            raise ImproperlyConfigured(f"Failed to load settings: {e}")

    def _load_printer_config(self) -> None:
        """
        Load printer configurations from tenant-scoped PrinterConfiguration model.
        TenantManager automatically filters by current tenant.
        """
        from .models import PrinterConfiguration
        from tenant.managers import get_current_tenant

        try:
            tenant = get_current_tenant()
            if not tenant:
                raise Exception("No tenant context available")

            # Try to get existing config for this tenant
            try:
                printer_config = PrinterConfiguration.objects.get(tenant=tenant)
                created = False
            except PrinterConfiguration.DoesNotExist:
                # Create new config - avoid get_or_create due to id sequence conflicts
                printer_config = PrinterConfiguration(tenant=tenant)
                printer_config.save()
                created = True
            self.receipt_printers: List[Dict[str, Any]] = (
                printer_config.receipt_printers
            )
            self.kitchen_printers: List[Dict[str, Any]] = (
                printer_config.kitchen_printers
            )
            self.kitchen_zones: List[Dict[str, Any]] = printer_config.kitchen_zones
            if created:
                logger.info("Created default PrinterConfiguration instance")
        except Exception as e:
            # If loading fails, default to empty lists to prevent crashes
            logger.warning(f"Failed to load printer configuration: {e}")
            self.receipt_printers = []
            self.kitchen_printers = []
            self.kitchen_zones = []

    def _load_web_order_config(self) -> None:
        """
        Load web order settings from tenant-scoped WebOrderSettings model.
        TenantManager automatically filters by current tenant.
        """
        from .models import WebOrderSettings
        from tenant.managers import get_current_tenant

        try:
            tenant = get_current_tenant()
            if not tenant:
                raise Exception("No tenant context available")

            # Try to get existing config for this tenant
            try:
                web_settings = WebOrderSettings.objects.get(tenant=tenant)
                created = False
            except WebOrderSettings.DoesNotExist:
                # Create new config - avoid get_or_create due to id sequence conflicts
                web_settings = WebOrderSettings(tenant=tenant)
                web_settings.save()
                created = True

            # Map model fields to AppSettings attributes
            self.enable_web_order_notifications: bool = web_settings.enable_notifications
            self.web_order_notification_sound: bool = web_settings.play_notification_sound
            self.web_order_auto_print_receipt: bool = web_settings.auto_print_receipt
            self.web_order_auto_print_kitchen: bool = web_settings.auto_print_kitchen
            if created:
                logger.info("Created default WebOrderSettings instance")
        except Exception as e:
            logger.warning(f"Failed to load web order configuration: {e}")
            # Set sensible defaults to prevent crashes
            self.enable_web_order_notifications = False
            self.web_order_notification_sound = False
            self.web_order_auto_print_receipt = False
            self.web_order_auto_print_kitchen = False

    def reload(self) -> None:
        """
        Reload settings from the database.
        This method is called when settings are updated to refresh the cache.
        """
        self.load_settings()
        logger.info("AppSettings cache reloaded")

    def get_default_inventory_location(self):
        """
        Get the default inventory location. Creates one if none exists.
        Maintained for backwards compatibility and inventory separation.

        Multi-tenant: TenantManager automatically filters by current tenant.
        """
        if self.default_inventory_location is None:
            # Import here to avoid circular imports
            from inventory.models import Location
            from .models import GlobalSettings
            from tenant.managers import get_current_tenant

            tenant = get_current_tenant()
            if not tenant:
                raise ImproperlyConfigured("No tenant context available for creating default location")

            # Create a default location if none exists (tenant-scoped)
            default_location, created = Location.objects.get_or_create(
                name="Main Store",
                tenant=tenant,
                defaults={"description": "Default main store location"},
            )

            # Update the settings to use this location (tenant-scoped)
            settings_obj = GlobalSettings.objects.get()  # TenantManager filters by current tenant
            settings_obj.default_inventory_location = default_location
            settings_obj.save()

            self.default_inventory_location = default_location

            if created:
                logger.info("Created default inventory location: Main Store")

        return self.default_inventory_location

    def get_default_store_location(self):
        """
        Get the default store location. Creates one if none exists.
        This is the primary method for getting the default physical location.

        Multi-tenant: TenantManager automatically filters by current tenant.
        """
        if self.default_store_location is None:
            from .models import StoreLocation, GlobalSettings

            # Create or get a default store location (tenant-scoped)
            default_location, created = StoreLocation.objects.get_or_create(
                is_default=True, defaults={"name": "Main Location"}
            )

            # Update the global settings to use this new location (tenant-scoped)
            settings_obj = GlobalSettings.objects.get()  # TenantManager filters by current tenant
            settings_obj.default_store_location = default_location
            settings_obj.save()

            self.default_store_location = default_location

            if created:
                logger.info("Created default store location: Main Location")

        return self.default_store_location

    def get_default_location(self):
        """
        Backwards compatibility method for inventory system.
        Returns the default inventory location.
        """
        return self.get_default_inventory_location()

    @cache_static_data(timeout=3600*24)  # 24 hours in static cache
    def get_cached_global_settings(self):
        """Cache global settings - very stable data"""
        if not self._initialized:
            self._setup()
        return self
    
    @cache_static_data(timeout=3600*8)  # 8 hours in static cache
    def get_store_locations(self):
        """Cache store locations - changes infrequently"""
        from .models import StoreLocation
        return list(StoreLocation.objects.all())
    
    def warm_settings_cache(self):
        """Pre-load critical settings into cache for better startup performance"""
        try:
            logger.info("Warming settings cache...")
            
            # Pre-load core settings that are frequently accessed
            critical_settings = [
                'tax_rate',
                'surcharge_percentage', 
                'currency',
                'store_name',
                'opening_time',
                'closing_time',
                'timezone',
                'active_terminal_provider'
            ]
            
            # Access each setting to trigger cache loading
            for setting_name in critical_settings:
                if hasattr(self, setting_name):
                    getattr(self, setting_name)
            
            # Pre-load cached methods
            self.get_cached_global_settings()
            self.get_store_locations()
            
            # Pre-load configuration dictionaries
            self.get_store_info()
            self.get_financial_settings()
            self.get_receipt_config()
            self.get_web_order_config()
            self.get_printer_config()
            
            logger.info("Settings cache warmed successfully")
            return True
            
        except Exception as e:
            logger.warning(f"Failed to warm settings cache: {e}")
            return False
    
    @cache_static_data(timeout=3600*4)  # 4 hours in static cache
    def get_cached_business_hours(self):
        """Cache business hours configuration for frequent access"""
        if not self._initialized:
            self._setup()
            
        return {
            'opening_time': self.opening_time.isoformat() if self.opening_time else None,
            'closing_time': self.closing_time.isoformat() if self.closing_time else None,
            'timezone': self.timezone,
            'is_24_hours': self.opening_time is None or self.closing_time is None
        }
    
    @cache_static_data(timeout=3600*6)  # 6 hours in static cache  
    def get_cached_payment_config(self):
        """Cache payment configuration for POS systems"""
        if not self._initialized:
            self._setup()
            
        return {
            'active_terminal_provider': self.active_terminal_provider,
            'currency': self.currency,
            'surcharge_percentage': float(self.surcharge_percentage),
            'allow_discount_stacking': self.allow_discount_stacking
        }
    
    @cache_static_data(timeout=3600*12)  # 12 hours in static cache
    def get_cached_store_branding(self):
        """Cache store branding information for receipts and displays"""
        if not self._initialized:
            self._setup()
            
        return {
            'store_name': self.store_name,
            'store_address': self.store_address,
            'store_phone': self.store_phone,
            'store_email': self.store_email,
            'receipt_header': self.receipt_header,
            'receipt_footer': self.receipt_footer
        }

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
            "play_notification_sound": self.web_order_notification_sound,
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
