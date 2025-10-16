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
                    brand_name=f"{tenant.name}",
                )
                settings_obj.save()
                created = True

            # === FINANCIAL SETTINGS (Tenant-wide) ===
            self.surcharge_percentage: Decimal = settings_obj.surcharge_percentage
            self.currency: str = settings_obj.currency
            self.allow_discount_stacking: bool = settings_obj.allow_discount_stacking

            # === BRAND IDENTITY (Tenant-wide) ===
            self.brand_name: str = settings_obj.brand_name
            self.brand_primary_color: str = settings_obj.brand_primary_color
            self.brand_secondary_color: str = settings_obj.brand_secondary_color

            # === RECEIPT TEMPLATES (Brand-level, locations can override) ===
            self.brand_receipt_header: str = settings_obj.brand_receipt_header
            self.brand_receipt_footer: str = settings_obj.brand_receipt_footer

            # === PAYMENT PROCESSING (Tenant-wide) ===
            self.active_terminal_provider: str = settings_obj.active_terminal_provider

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
                'surcharge_percentage',
                'currency',
                'brand_name',
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
            self.get_brand_info()
            self.get_financial_settings()
            self.get_receipt_config()
            self.get_web_order_config()
            self.get_printer_config()
            
            logger.info("Settings cache warmed successfully")
            return True
            
        except Exception as e:
            logger.warning(f"Failed to warm settings cache: {e}")
            return False
    
    
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
    def get_cached_brand_info(self):
        """Cache brand information for receipts and displays"""
        if not self._initialized:
            self._setup()

        return {
            'brand_name': self.brand_name,
            'brand_primary_color': self.brand_primary_color,
            'brand_secondary_color': self.brand_secondary_color,
            'brand_receipt_header': self.brand_receipt_header,
            'brand_receipt_footer': self.brand_receipt_footer
        }

    def get_brand_info(self) -> dict:
        """
        Get brand information as a dictionary.
        Useful for branding across all locations.
        """
        return {
            "name": self.brand_name,
            "primary_color": self.brand_primary_color,
            "secondary_color": self.brand_secondary_color,
        }

    def get_financial_settings(self) -> dict:
        """
        Get financial settings as a dictionary.
        Useful for order calculations.
        Note: tax_rate is location-specific, get from StoreLocation model.
        """
        return {
            "surcharge_percentage": self.surcharge_percentage,
            "currency": self.currency,
        }

    def get_receipt_config(self) -> dict:
        """
        Get receipt template configuration as a dictionary.
        These are brand-level templates. Locations can override.
        """
        return {
            "header": self.brand_receipt_header,
            "footer": self.brand_receipt_footer,
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
            f"AppSettings(brand='{self.brand_name}', "
            f"currency={self.currency}, "
            f"provider={self.active_terminal_provider})"
        )


# Create the singleton instance at module level
app_settings = AppSettings()
