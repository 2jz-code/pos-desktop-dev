from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal
from core_backend.utils.archiving import SoftDeleteMixin
import logging
import zoneinfo

logger = logging.getLogger(__name__)


# === CHOICES ===

class TimezoneChoices(models.TextChoices):
    """Common timezone choices for business operations"""
    UTC = "UTC", "UTC (Coordinated Universal Time)"
    
    # US Timezones
    US_EASTERN = "America/New_York", "Eastern Time (US & Canada)"
    US_CENTRAL = "America/Chicago", "Central Time (US & Canada)"
    US_MOUNTAIN = "America/Denver", "Mountain Time (US & Canada)"
    US_PACIFIC = "America/Los_Angeles", "Pacific Time (US & Canada)"
    US_ALASKA = "America/Anchorage", "Alaska Time (US)"
    US_HAWAII = "Pacific/Honolulu", "Hawaii Time (US)"
    
    # Canadian Timezones
    CANADA_ATLANTIC = "America/Halifax", "Atlantic Time (Canada)"
    CANADA_NEWFOUNDLAND = "America/St_Johns", "Newfoundland Time (Canada)"
    
    # European Timezones
    UK_LONDON = "Europe/London", "Greenwich Mean Time (UK)"
    EUROPE_PARIS = "Europe/Paris", "Central European Time"
    EUROPE_BERLIN = "Europe/Berlin", "Central European Time (Germany)"
    
    # Other Common Timezones
    AUSTRALIA_SYDNEY = "Australia/Sydney", "Australian Eastern Time"
    ASIA_TOKYO = "Asia/Tokyo", "Japan Standard Time"
    ASIA_SHANGHAI = "Asia/Shanghai", "China Standard Time"


class TerminalProvider(models.TextChoices):
    STRIPE_TERMINAL = "STRIPE_TERMINAL", "Stripe Terminal"
    CLOVER_TERMINAL = "CLOVER_TERMINAL", "Clover Terminal"


# === CORE BUSINESS MODELS ===


class StoreLocation(SoftDeleteMixin):
    """
    Represents a primary physical store location, independent of any payment provider.
    This is the definitive source of truth for business locations.
    """

    name = models.CharField(max_length=100)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    is_default = models.BooleanField(
        default=False, help_text="Is this the default location for inventory deduction?"
    )

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.is_default:
            # ensure only one default location exists
            StoreLocation.objects.filter(is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)


# === SINGLETON CONFIGURATION MODELS ===


class GlobalSettings(models.Model):
    """
    A singleton model to store globally accessible settings for the application.
    These settings affect ALL terminals and should be managed centrally.
    """

    # === TAX & FINANCIAL SETTINGS ===
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0.08,
        help_text="The sales tax rate as a decimal (e.g., 0.08 for 8%).",
    )
    surcharge_percentage = models.DecimalField(
        max_digits=8,
        decimal_places=6,
        default=Decimal("0.00"),
        help_text="A percentage-based surcharge applied to the subtotal (e.g., 0.02 for 2%).",
    )
    currency = models.CharField(
        max_length=3, default="USD", help_text="Three-letter currency code (ISO 4217)."
    )
    allow_discount_stacking = models.BooleanField(
        default=False,
        help_text="If true, multiple discounts can be applied to a single order. If false, only one discount is allowed.",
    )

    # === STORE INFORMATION ===
    store_name = models.CharField(max_length=100, default="Ajeen POS")
    store_address = models.TextField(
        blank=True, help_text="Full business address for receipts."
    )
    store_phone = models.CharField(
        max_length=20, blank=True, help_text="Business phone number."
    )
    store_email = models.EmailField(blank=True, help_text="Business email address.")

    # === RECEIPT CONFIGURATION ===
    receipt_header = models.TextField(
        blank=True, help_text="Custom text to appear at the top of receipts."
    )
    receipt_footer = models.TextField(
        default="Thank you for your business!",
        help_text="The footer text that appears on printed receipts.",
    )

    # === PAYMENT PROCESSING ===
    active_terminal_provider = models.CharField(
        max_length=50,
        choices=TerminalProvider.choices,
        default=TerminalProvider.STRIPE_TERMINAL,
        help_text="The currently active payment terminal provider.",
    )

    # === BUSINESS HOURS ===
    opening_time = models.TimeField(
        null=True, blank=True, help_text="Business opening time (used for reporting)."
    )
    closing_time = models.TimeField(
        null=True, blank=True, help_text="Business closing time (used for reporting)."
    )
    timezone = models.CharField(
        max_length=50,
        choices=TimezoneChoices.choices,
        default=TimezoneChoices.UTC,
        help_text="Business timezone for reports and business hours. This affects how dates are displayed and interpreted in reports.",
    )

    # === INVENTORY & LOCATION DEFAULTS ===
    default_inventory_location = models.ForeignKey(
        "inventory.Location",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Default location for inventory operations and sales.",
        related_name="default_for_settings",
    )
    default_store_location = models.ForeignKey(
        "StoreLocation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Default store location for web orders and single-location setups.",
    )
    
    # === INVENTORY THRESHOLD DEFAULTS ===
    default_low_stock_threshold = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=10.00,
        help_text="Default threshold below which stock is considered low. Can be overridden per product.",
    )
    default_expiration_threshold = models.PositiveIntegerField(
        default=7,
        help_text="Default number of days before expiration to warn about expiring stock. Can be overridden per product.",
    )

    def clean(self):
        if GlobalSettings.objects.exists() and not self.pk:
            raise ValidationError("There can only be one GlobalSettings instance.")
        
        # Validate timezone
        if self.timezone:
            try:
                zoneinfo.ZoneInfo(self.timezone)
            except (zoneinfo.ZoneInfoNotFoundError, ValueError):
                raise ValidationError(f"'{self.timezone}' is not a valid timezone.")

    def save(self, *args, **kwargs):
        self.clean()
        
        # Check if timezone changed to clear cache
        timezone_changed = False
        if self.pk:
            try:
                old_instance = GlobalSettings.objects.get(pk=self.pk)
                timezone_changed = old_instance.timezone != self.timezone
            except GlobalSettings.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
        
        # Clear report cache if timezone changed
        if timezone_changed:
            from reports.services_new.base import BaseReportService
            # Clear all report cache entries since timezone affects all reports
            BaseReportService.cleanup_expired_cache()
            # Also invalidate cache for all report types
            for report_type in ['summary', 'sales', 'products', 'payments', 'operations']:
                BaseReportService.invalidate_cache_for_report_type(report_type)

    def __str__(self):
        return "Global Settings"

    def is_business_open(self) -> bool:
        """
        Check if the business is currently open based on opening/closing times and timezone.
        Returns True if business hours are not set (always open).
        """
        if not self.opening_time or not self.closing_time:
            return True  # Always open if hours not configured

        try:
            import pytz
            from datetime import datetime

            # Get current time in business timezone
            tz = pytz.timezone(self.timezone)
            current_time = datetime.now(tz).time()

            # Handle same-day hours (e.g., 9:00 AM - 10:00 PM)
            if self.opening_time <= self.closing_time:
                return self.opening_time <= current_time <= self.closing_time

            # Handle overnight hours (e.g., 10:00 PM - 6:00 AM)
            else:
                return (
                    current_time >= self.opening_time
                    or current_time <= self.closing_time
                )

        except Exception as e:
            # If timezone calculation fails, default to open
            logger.error(f"Business hours check failed: {e}")
            return True

    class Meta:
        verbose_name = "Global Settings"


class PrinterConfiguration(models.Model):
    """
    Singleton model for storing printer configurations, centralized in the backend.
    """

    receipt_printers = models.JSONField(
        default=list,
        blank=True,
        help_text="List of receipt printer configurations (e.g., [{'name': 'Receipt Printer', 'ip': '192.168.1.100'}])",
    )
    kitchen_printers = models.JSONField(
        default=list,
        blank=True,
        help_text="List of kitchen printer configurations (e.g., [{'name': 'Kitchen Printer', 'ip': '192.168.1.101'}])",
    )
    kitchen_zones = models.JSONField(
        default=list,
        blank=True,
        help_text="Kitchen zone configurations with category filters and QC status (e.g., [{'name': 'Grill Station', 'printer_name': 'Kitchen Printer', 'category_ids': [1, 2], 'is_qc_zone': false}])",
    )

    def clean(self):
        if PrinterConfiguration.objects.exists() and not self.pk:
            raise ValidationError(
                "There can only be one PrinterConfiguration instance."
            )

    def save(self, *args, **kwargs):
        self.pk = 1
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return "Printer & Kitchen Zone Configuration"

    class Meta:
        verbose_name_plural = "Printer Configuration"


class SingletonModel(models.Model):
    """
    An abstract base class that ensures only one instance of a model exists.
    """

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.pk = 1
        super(SingletonModel, self).save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # Deleting the singleton is not allowed

    @classmethod
    def load(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj


class WebOrderSettings(SingletonModel):
    """
    Singleton model for web order specific settings.
    """

    enable_notifications = models.BooleanField(
        default=True, help_text="Enable all notifications for new web orders."
    )
    play_notification_sound = models.BooleanField(
        default=True, help_text="Play a sound for new web orders."
    )
    auto_print_receipt = models.BooleanField(
        default=True, help_text="Automatically print a receipt for new web orders."
    )
    auto_print_kitchen = models.BooleanField(
        default=True,
        help_text="Automatically print kitchen tickets for new web orders.",
    )
    web_receipt_terminals = models.ManyToManyField(
        "TerminalRegistration",
        blank=True,
        help_text="Select terminals that should receive and print web order notifications/receipts.",
        related_name="web_order_notifications",
    )

    def __str__(self):
        return "Web Order Settings"

    class Meta:
        verbose_name = "Web Order Settings"


# === DEVICE & PROVIDER-SPECIFIC MODELS ===


class TerminalRegistration(models.Model):
    """
    Links a physical device to a primary StoreLocation. This is the new standard for device management.
    Replaces the old POSDevice model.
    """

    device_id = models.CharField(max_length=255, unique=True, primary_key=True)
    nickname = models.CharField(
        max_length=100,
        blank=True,
        help_text="A friendly name for the device (e.g., 'Front Counter').",
    )
    store_location = models.ForeignKey(
        "StoreLocation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The primary store location this terminal is physically in.",
    )
    last_seen = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    reader_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="The ID of the Stripe Terminal reader assigned to this device (e.g., tmr_...).",
    )

    def __str__(self):
        location_name = (
            self.store_location.name if self.store_location else "Unassigned"
        )
        return f"{self.nickname or self.device_id} @ {location_name}"

    class Meta:
        verbose_name = "Terminal Registration"
        verbose_name_plural = "Terminal Registrations"


class TerminalLocation(SoftDeleteMixin):
    """
    Represents a Stripe-specific configuration linked to a primary StoreLocation.
    This model acts as a bridge, scoping Stripe API actions (like discovering readers)
    to a specific business location without tying core logic to Stripe.
    """

    store_location = models.OneToOneField(
        StoreLocation,
        on_delete=models.PROTECT,
        null=True,  # Temporarily allow null for migration
        help_text="The primary store this Stripe configuration is for.",
    )
    stripe_id = models.CharField(
        max_length=255,
        unique=True,
        help_text="The ID of the location from Stripe (e.g., tml_...).",
    )

    def __str__(self):
        return f"{self.store_location.name} (Stripe Config: {self.stripe_id})"

    class Meta:
        verbose_name = "Stripe Location Link"
        verbose_name_plural = "Stripe Location Links"


class StockActionReasonConfig(SoftDeleteMixin):
    """
    Configurable reasons for stock actions. Owners can define custom reasons
    while system reasons are built-in and protected from modification.
    """
    
    # Reason categories matching the existing StockHistoryEntry categories
    CATEGORY_CHOICES = [
        ('SYSTEM', 'System'),
        ('MANUAL', 'Manual'),
        ('TRANSFER', 'Transfer'),
        ('CORRECTION', 'Correction'),
        ('INVENTORY', 'Inventory'),
        ('WASTE', 'Waste'),
        ('RESTOCK', 'Restock'),
        ('BULK', 'Bulk'),
        ('OTHER', 'Other'),
    ]
    
    name = models.CharField(
        max_length=100,
        help_text="Name of the stock action reason (e.g., 'Damaged Items', 'Inventory Count')"
    )
    description = models.TextField(
        blank=True,
        help_text="Optional detailed description of when this reason should be used"
    )
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='OTHER',
        help_text="Category this reason belongs to for reporting and organization"
    )
    is_system_reason = models.BooleanField(
        default=False,
        help_text="System reasons are built-in and cannot be modified by users"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive reasons cannot be selected for new stock operations"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Stock Action Reason"
        verbose_name_plural = "Stock Action Reasons"
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['is_active', 'category']),
            models.Index(fields=['is_system_reason']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"
    
    def clean(self):
        """Validate the model before saving"""
        from django.core.exceptions import ValidationError
        
        # Ensure system reasons cannot be deactivated
        if self.is_system_reason and not self.is_active:
            raise ValidationError("System reasons cannot be deactivated")
        
        # Ensure name is unique within active reasons
        existing = StockActionReasonConfig.objects.filter(
            name=self.name,
            is_active=True
        ).exclude(pk=self.pk)
        
        if existing.exists():
            raise ValidationError(f"An active reason with the name '{self.name}' already exists")
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    @property
    def can_be_deleted(self):
        """Check if this reason can be safely deleted (not referenced in stock history)"""
        # Import here to avoid circular imports
        from inventory.models import StockHistoryEntry
        return not StockHistoryEntry.objects.filter(reason_config=self).exists()
    
    @property
    def usage_count(self):
        """Return the number of times this reason has been used"""
        # Import here to avoid circular imports
        from inventory.models import StockHistoryEntry
        return StockHistoryEntry.objects.filter(reason_config=self).count()
