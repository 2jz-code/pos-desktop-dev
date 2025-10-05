"""
Settings Service Layer

This module contains business logic for managing application settings,
extracting complex operations from views and centralizing configuration management.
"""

from datetime import datetime, time
from typing import Dict, Any, Optional, Union, List, Tuple
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    TerminalRegistration,
    PrinterConfiguration,
    WebOrderSettings,
)
from payments.strategies import StripeTerminalStrategy


class SettingsService:
    """
    Service layer for managing global application settings.
    Handles business logic for settings operations, validation, and management.
    
    Extracted from GlobalSettingsViewSet - previously 300+ lines of business logic in views.
    """
    
    @staticmethod
    def get_global_settings() -> GlobalSettings:
        """
        Get the tenant-scoped GlobalSettings instance.
        Creates one if it doesn't exist for the current tenant.

        TenantManager automatically filters by current tenant context.
        OneToOneField ensures only one instance per tenant.

        Returns:
            GlobalSettings: The tenant's settings instance
        """
        from tenant.managers import get_current_tenant

        tenant = get_current_tenant()
        if not tenant:
            raise ValidationError("No tenant context available for settings")

        # Try to get existing settings for this tenant
        try:
            obj = GlobalSettings.objects.get(tenant=tenant)
        except GlobalSettings.DoesNotExist:
            # Create new settings - avoid get_or_create due to id sequence conflicts
            obj = GlobalSettings(
                tenant=tenant,
                store_name=f"{tenant.name}",
                store_address='',
                store_phone='',
                store_email='',
            )
            obj.save()

        return obj
    
    @staticmethod
    def update_global_settings(
        update_data: Dict[str, Any], 
        partial: bool = True
    ) -> GlobalSettings:
        """
        Update global settings with validation and cache management.
        
        Args:
            update_data: Dictionary of fields to update
            partial: Whether this is a partial update
            
        Returns:
            GlobalSettings: Updated settings instance
            
        Raises:
            ValidationError: If validation fails
        """
        instance = SettingsService.get_global_settings()
        
        with transaction.atomic():
            # Apply updates to instance
            for field, value in update_data.items():
                if hasattr(instance, field):
                    setattr(instance, field, value)
                    
            # Save with validation
            instance.full_clean()
            instance.save(update_fields=list(update_data.keys()) if partial else None)
            
            # Clear settings cache after update
            SettingsService._clear_settings_cache()
            
        return instance
    
    @staticmethod
    def get_store_info() -> Dict[str, Any]:
        """
        Get store information section.
        
        Extracted from GlobalSettingsViewSet.store_info() action.
        
        Returns:
            Dict containing store information fields
        """
        instance = SettingsService.get_global_settings()
        return {
            "store_name": instance.store_name,
            "store_address": instance.store_address,
            "store_phone": instance.store_phone,
            "store_email": instance.store_email,
        }
    
    @staticmethod
    def update_store_info(update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update store information section with field validation.
        
        Extracted from GlobalSettingsViewSet.store_info() action (25+ lines).
        
        Args:
            update_data: Dictionary of store info fields to update
            
        Returns:
            Dict containing updated store information
            
        Raises:
            ValidationError: If validation fails
        """
        allowed_fields = {
            "store_name", "store_address", "store_phone", "store_email"
        }
        
        # Filter to only allowed fields (business rule from original view)
        filtered_data = {
            k: v for k, v in update_data.items() 
            if k in allowed_fields
        }
        
        if not filtered_data:
            raise ValidationError("No valid store information fields provided")
            
        SettingsService.update_global_settings(filtered_data, partial=True)
        return SettingsService.get_store_info()
    
    @staticmethod
    def get_financial_settings() -> Dict[str, Any]:
        """
        Get financial settings section.
        
        Extracted from GlobalSettingsViewSet.financial() action.
        
        Returns:
            Dict containing financial settings fields
        """
        instance = SettingsService.get_global_settings()
        return {
            "tax_rate": instance.tax_rate,
            "surcharge_percentage": instance.surcharge_percentage,
            "currency": instance.currency,
        }
    
    @staticmethod
    def update_financial_settings(update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update financial settings with business validation.
        
        Extracted from GlobalSettingsViewSet.financial() action (30+ lines).
        
        Args:
            update_data: Dictionary of financial fields to update
            
        Returns:
            Dict containing updated financial settings
            
        Raises:
            ValidationError: If validation fails
        """
        allowed_fields = {"tax_rate", "surcharge_percentage", "currency"}
        
        # Filter to only allowed fields (business rule from original view)
        filtered_data = {
            k: v for k, v in update_data.items() 
            if k in allowed_fields
        }
        
        if not filtered_data:
            raise ValidationError("No valid financial settings fields provided")
        
        # Business validation rules
        if "tax_rate" in filtered_data:
            tax_rate = filtered_data["tax_rate"]
            if tax_rate is not None and (tax_rate < 0 or tax_rate > 1):
                raise ValidationError("Tax rate must be between 0 and 1 (0% to 100%)")
        
        if "surcharge_percentage" in filtered_data:
            surcharge = filtered_data["surcharge_percentage"]
            if surcharge is not None and (surcharge < 0 or surcharge > 1):
                raise ValidationError("Surcharge percentage must be between 0 and 1 (0% to 100%)")
                
        SettingsService.update_global_settings(filtered_data, partial=True)
        return SettingsService.get_financial_settings()
    
    @staticmethod
    def get_receipt_config() -> Dict[str, Any]:
        """
        Get receipt configuration section.
        
        Extracted from GlobalSettingsViewSet.receipt_config() action.
        
        Returns:
            Dict containing receipt configuration fields
        """
        instance = SettingsService.get_global_settings()
        return {
            "receipt_header": instance.receipt_header,
            "receipt_footer": instance.receipt_footer,
        }
    
    @staticmethod
    def update_receipt_config(update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update receipt configuration section.
        
        Extracted from GlobalSettingsViewSet.receipt_config() action (20+ lines).
        
        Args:
            update_data: Dictionary of receipt config fields to update
            
        Returns:
            Dict containing updated receipt configuration
            
        Raises:
            ValidationError: If validation fails
        """
        allowed_fields = {"receipt_header", "receipt_footer"}
        
        # Filter to only allowed fields (business rule from original view)
        filtered_data = {
            k: v for k, v in update_data.items() 
            if k in allowed_fields
        }
        
        if not filtered_data:
            raise ValidationError("No valid receipt configuration fields provided")
            
        SettingsService.update_global_settings(filtered_data, partial=True)
        return SettingsService.get_receipt_config()
    
    @staticmethod
    def get_business_hours() -> Dict[str, Any]:
        """
        Get business hours configuration with formatted times.
        
        Extracted from GlobalSettingsViewSet.business_hours() action.
        
        Returns:
            Dict containing business hours data with formatted times
        """
        instance = SettingsService.get_global_settings()
        return {
            "opening_time": (
                instance.opening_time.strftime("%H:%M")
                if instance.opening_time
                else None
            ),
            "closing_time": (
                instance.closing_time.strftime("%H:%M")
                if instance.closing_time
                else None
            ),
            "timezone": instance.timezone,
        }
    
    @staticmethod
    def update_business_hours(update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update business hours with complex time validation and parsing.
        
        Extracted from GlobalSettingsViewSet.business_hours() action (64+ lines of complex logic).
        This was the most complex business logic in the original views.
        
        Args:
            update_data: Dictionary of business hours fields to update
            
        Returns:
            Dict containing updated business hours
            
        Raises:
            ValidationError: If time parsing or validation fails
        """
        allowed_fields = {"opening_time", "closing_time", "timezone"}
        instance = SettingsService.get_global_settings()
        updated_fields = {}
        
        for field in allowed_fields:
            if field in update_data:
                value = update_data[field]
                
                # Handle time fields with special parsing (complex logic from original view)
                if field in ["opening_time", "closing_time"]:
                    if value is None or value == "":
                        setattr(instance, field, None)
                        updated_fields[field] = None
                    else:
                        # Parse time string (HH:MM format) - extracted from original view
                        try:
                            time_obj = datetime.strptime(value, "%H:%M").time()
                            setattr(instance, field, time_obj)
                            updated_fields[field] = value
                        except ValueError:
                            raise ValidationError(
                                f"Invalid time format for {field}. Use HH:MM format."
                            )
                else:
                    # Handle non-time fields (timezone)
                    setattr(instance, field, value)
                    updated_fields[field] = value
        
        if not updated_fields:
            raise ValidationError("No valid business hours fields provided")
        
        # Business rule validation - ensure logical time sequence
        if instance.opening_time and instance.closing_time:
            if instance.opening_time >= instance.closing_time:
                raise ValidationError(
                    "Opening time must be earlier than closing time"
                )
        
        # Save changes with transaction safety
        instance.save(update_fields=list(updated_fields.keys()))
        
        # Clear settings cache after update (important for app_settings)
        SettingsService._clear_settings_cache()
        
        return SettingsService.get_business_hours()
    
    @staticmethod
    def get_settings_summary() -> Dict[str, Any]:
        """
        Get a summary of key settings for display purposes.
        
        Extracted from GlobalSettingsViewSet.summary() action.
        
        Returns:
            Dict containing summary of key settings
        """
        instance = SettingsService.get_global_settings()
        return {
            "store_name": instance.store_name,
            "currency": instance.currency,
            "tax_rate": instance.tax_rate,
            "timezone": instance.timezone,
            "active_terminal_provider": instance.active_terminal_provider,
        }
    
    @staticmethod
    def get_receipt_format_data() -> Dict[str, Any]:
        """
        Get all the data needed for receipt formatting.
        Combines store info and receipt configuration for use by receipt formatters.
        
        Extracted from GlobalSettingsViewSet.receipt_format_data() action.
        
        Returns:
            Dict containing all receipt formatting data
        """
        instance = SettingsService.get_global_settings()
        return {
            # Store Information
            "store_name": instance.store_name,
            "store_address": instance.store_address,
            "store_phone": instance.store_phone,
            "store_email": instance.store_email,
            # Receipt Configuration
            "receipt_header": instance.receipt_header,
            "receipt_footer": instance.receipt_footer,
        }
    
    @staticmethod
    def _clear_settings_cache():
        """
        Clear the settings cache after updates.
        This ensures that cached settings are refreshed.
        
        Extracted from business_hours() action in original view.
        """
        try:
            from .config import app_settings
            app_settings.reload()
        except ImportError:
            # If config module is not available, skip cache clearing
            pass


class PrinterConfigurationService:
    """
    Service layer for managing printer configuration settings.
    Handles singleton printer configuration business logic.
    
    Extracted from PrinterConfigurationViewSet - previously 50+ lines in views.
    """
    
    @staticmethod
    def get_printer_configuration() -> PrinterConfiguration:
        """
        Get the tenant-scoped PrinterConfiguration instance.
        Creates one if it doesn't exist for the current tenant.

        TenantManager automatically filters by current tenant context.
        OneToOneField ensures only one instance per tenant.

        Extracted from PrinterConfigurationViewSet.get_object().

        Returns:
            PrinterConfiguration: The tenant's printer config instance
        """
        from tenant.managers import get_current_tenant

        tenant = get_current_tenant()
        if not tenant:
            raise ValidationError("No tenant context available for printer configuration")

        # Try to get existing config for this tenant
        try:
            obj = PrinterConfiguration.objects.get(tenant=tenant)
        except PrinterConfiguration.DoesNotExist:
            # Create new config - avoid get_or_create due to id sequence conflicts
            obj = PrinterConfiguration(tenant=tenant)
            obj.save()

        return obj
    
    @staticmethod
    def update_printer_configuration(
        update_data: Dict[str, Any], 
        partial: bool = True
    ) -> PrinterConfiguration:
        """
        Update printer configuration with validation.
        
        Extracted from PrinterConfigurationViewSet update methods.
        
        Args:
            update_data: Dictionary of fields to update
            partial: Whether this is a partial update
            
        Returns:
            PrinterConfiguration: Updated configuration instance
            
        Raises:
            ValidationError: If validation fails
        """
        instance = PrinterConfigurationService.get_printer_configuration()
        
        with transaction.atomic():
            # Apply updates to instance
            for field, value in update_data.items():
                if hasattr(instance, field):
                    setattr(instance, field, value)
                    
            # Save with validation
            instance.full_clean()
            instance.save(update_fields=list(update_data.keys()) if partial else None)
            
        return instance


class WebOrderSettingsService:
    """
    Service layer for managing web order settings.
    Handles terminal receipt configuration for web orders.
    
    Extracted from WebOrderSettingsViewSet - previously 50+ lines in views.
    """
    
    @staticmethod
    def get_web_order_settings() -> WebOrderSettings:
        """
        Get the tenant-scoped WebOrderSettings instance with optimized query.
        Creates one if it doesn't exist for the current tenant.

        TenantManager automatically filters by current tenant context.
        OneToOneField ensures only one instance per tenant.

        Extracted from WebOrderSettingsViewSet.get_object() with prefetch optimization.

        Returns:
            WebOrderSettings: The tenant's web order settings instance
        """
        from tenant.managers import get_current_tenant

        tenant = get_current_tenant()
        if not tenant:
            raise ValidationError("No tenant context available for web order settings")

        # Try to get existing settings for this tenant
        try:
            obj = WebOrderSettings.objects.prefetch_related(
                'web_receipt_terminals__store_location'
            ).get(tenant=tenant)
        except WebOrderSettings.DoesNotExist:
            # Create new settings - avoid get_or_create due to id sequence conflicts
            obj = WebOrderSettings(tenant=tenant)
            obj.save()
        return obj
    
    @staticmethod
    def update_web_order_settings(
        update_data: Dict[str, Any], 
        partial: bool = True
    ) -> WebOrderSettings:
        """
        Update web order settings with many-to-many field handling.
        
        Extracted from WebOrderSettingsViewSet update methods.
        
        Args:
            update_data: Dictionary of fields to update
            partial: Whether this is a partial update
            
        Returns:
            WebOrderSettings: Updated settings instance
            
        Raises:
            ValidationError: If validation fails
        """
        instance = WebOrderSettingsService.get_web_order_settings()
        
        with transaction.atomic():
            # Handle many-to-many fields specially (business logic from original view)
            m2m_fields = {}
            regular_fields = {}
            
            for field, value in update_data.items():
                if hasattr(instance, field):
                    field_obj = instance._meta.get_field(field)
                    if field_obj.many_to_many:
                        m2m_fields[field] = value
                    else:
                        regular_fields[field] = value
            
            # Update regular fields
            for field, value in regular_fields.items():
                setattr(instance, field, value)
            
            # Save regular field changes
            if regular_fields:
                instance.full_clean()
                instance.save(update_fields=list(regular_fields.keys()) if partial else None)
            
            # Update many-to-many fields
            for field, value in m2m_fields.items():
                getattr(instance, field).set(value)
                
        return instance


class TerminalService:
    """
    Service layer for managing terminal registrations and locations.
    Handles terminal-related business logic and Stripe integration.
    
    Extracted from multiple views - previously 100+ lines of business logic.
    """
    
    @staticmethod
    def upsert_terminal_registration(registration_data: Dict[str, Any]) -> Tuple[TerminalRegistration, bool]:
        """
        Create or update a terminal registration (UPSERT operation).
        
        Extracted from TerminalRegistrationViewSet.create() method (40+ lines of complex logic).
        
        Args:
            registration_data: Dictionary containing terminal registration data
            
        Returns:
            tuple: (TerminalRegistration instance, created_flag)
            
        Raises:
            ValidationError: If device_id is missing or validation fails
        """
        device_id = registration_data.get("device_id")
        if not device_id:
            raise ValidationError({"device_id": ["This field is required."]})
        
        # Get existing instance or None (business logic from original view)
        instance = TerminalRegistration.objects.select_related('store_location').filter(
            device_id=device_id
        ).first()
        
        created = instance is None
        
        with transaction.atomic():
            if instance:
                # Update existing registration (partial=True logic from original)
                for field, value in registration_data.items():
                    if hasattr(instance, field):
                        setattr(instance, field, value)
                instance.full_clean()
                instance.save()
            else:
                # Create new registration (partial=False logic from original)
                instance = TerminalRegistration(**registration_data)
                instance.full_clean()
                instance.save()
        
        return instance, created
    
    @staticmethod
    def set_default_store_location(location_id: int) -> StoreLocation:
        """
        Set a store location as the default location.
        
        Extracted from StoreLocationViewSet.set_default() action.
        
        Args:
            location_id: ID of the location to set as default
            
        Returns:
            StoreLocation: The updated location instance
            
        Raises:
            ValidationError: If location doesn't exist
        """
        try:
            location = StoreLocation.objects.get(pk=location_id)
        except StoreLocation.DoesNotExist:
            raise ValidationError("Store location not found")
        
        with transaction.atomic():
            # Clear existing default (if any) - business rule from original view
            StoreLocation.objects.filter(is_default=True).update(is_default=False)
            
            # Set new default
            location.is_default = True
            location.save(update_fields=['is_default'])
            
            # Update GlobalSettings to point to this location as default
            global_settings = SettingsService.get_global_settings()
            global_settings.default_store_location = location
            global_settings.save(update_fields=['default_store_location'])
        
        return location
    
    @staticmethod
    def list_stripe_readers(location_id: Optional[str] = None) -> Dict[str, Any]:
        """
        List available Stripe Terminal Readers with error handling.
        
        Extracted from TerminalReaderListView.get() method (25+ lines).
        
        Args:
            location_id: Optional Stripe location ID to filter by
            
        Returns:
            Dict containing reader list or error information
        """
        try:
            strategy = StripeTerminalStrategy()
            readers = strategy.list_readers(location_id=location_id)
            return {"status": "success", "readers": readers}
        except Exception as e:
            return {
                "status": "error",
                "error": f"Failed to retrieve readers from Stripe: {str(e)}"
            }
    
    @staticmethod
    def sync_stripe_locations() -> Dict[str, Any]:
        """
        Trigger synchronization of locations from Stripe.
        
        Extracted from SyncStripeLocationsView.post() method (25+ lines).
        
        Returns:
            Dict containing sync result information
        """
        try:
            result = StripeTerminalStrategy.sync_locations_from_stripe()
            return result
        except Exception as e:
            return {
                "status": "error",
                "error": f"Failed to sync locations from Stripe: {str(e)}"
            }


class SettingsValidationService:
    """
    Service layer for complex settings validation.
    Provides business rule validation across settings.
    
    New service to centralize validation logic scattered across views.
    """
    
    @staticmethod
    def validate_business_hours_consistency(opening_time: Optional[time], closing_time: Optional[time]) -> None:
        """
        Validate that business hours are logically consistent.
        
        Extracted validation logic from business_hours() action.
        
        Args:
            opening_time: The opening time
            closing_time: The closing time
            
        Raises:
            ValidationError: If hours are inconsistent
        """
        if opening_time and closing_time:
            if opening_time >= closing_time:
                raise ValidationError(
                    "Opening time must be earlier than closing time"
                )
    
    @staticmethod
    def validate_financial_settings_consistency(
        tax_rate: Optional[float], 
        surcharge_percentage: Optional[float]
    ) -> None:
        """
        Validate that financial settings are consistent.
        
        Business rule validation for financial settings.
        
        Args:
            tax_rate: The tax rate (0-1)
            surcharge_percentage: The surcharge percentage (0-1)
            
        Raises:
            ValidationError: If settings are inconsistent
        """
        total_percentage = 0
        if tax_rate:
            total_percentage += tax_rate
        if surcharge_percentage:
            total_percentage += surcharge_percentage
            
        if total_percentage > 1.5:  # Allow up to 150% total (tax + surcharge)
            raise ValidationError(
                "Combined tax rate and surcharge percentage cannot exceed 150%"
            )
    
    @staticmethod
    def validate_store_info_completeness(store_data: Dict[str, Any]) -> List[str]:
        """
        Validate that store information is complete for business operations.
        
        Args:
            store_data: Dictionary of store information
            
        Returns:
            List of validation warnings (empty if all valid)
        """
        warnings = []
        required_fields = ["store_name", "store_address", "store_phone"]
        
        for field in required_fields:
            if not store_data.get(field):
                warnings.append(f"{field.replace('_', ' ').title()} is recommended for complete store setup")
        
        return warnings