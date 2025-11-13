from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal
from core_backend.utils.archiving import SoftDeleteMixin
from tenant.managers import TenantManager, TenantSoftDeleteManager
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
    PRIMARY source of truth for all location-specific operations and settings.

    This model is the central hub for:
    - Contact information (address, phone, email)
    - Operational settings (timezone, tax rate)
    - Business hours (via BusinessHoursProfile relationship)
    - Web order configuration
    - Receipt customization
    - Inventory defaults

    Location context is REQUIRED for all operational data (orders, payments, inventory).

    Architecture: Tenant (Isolation) → StoreLocation (Operations) → Data
    """

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='store_locations'
    )
    name = models.CharField(
        max_length=100,
        help_text="Location name (e.g., 'Downtown NYC', 'LAX Airport')"
    )

    # === STRUCTURED ADDRESS (Phase 5) ===
    address_line1 = models.CharField(
        max_length=255,
        blank=True,
        help_text="Street address (e.g., '123 Main St')"
    )
    address_line2 = models.CharField(
        max_length=255,
        blank=True,
        help_text="Apartment, suite, unit, building, floor, etc."
    )
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(
        max_length=100,
        blank=True,
        help_text="State, province, or region"
    )
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(
        max_length=2,
        default='US',
        help_text="Two-letter country code (ISO 3166-1 alpha-2)"
    )

    # === LEGACY ADDRESS (Deprecated - use structured fields) ===
    address = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use structured address fields instead. Kept for backwards compatibility."
    )

    # === CONTACT INFORMATION ===
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)

    # === LOCATION-SPECIFIC SETTINGS ===
    slug = models.SlugField(
        max_length=100,
        blank=True,
        help_text="URL-friendly identifier for this location (e.g., 'downtown', 'airport')"
    )
    timezone = models.CharField(
        max_length=50,
        choices=TimezoneChoices.choices,
        default=TimezoneChoices.US_CENTRAL,
        help_text="This location's timezone. Used for business hours, reports, and timestamps."
    )
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="This location's tax rate (e.g., 0.08 for 8% sales tax). REQUIRED for operations."
    )

    # === WEB ORDER CONFIGURATION (Phase 5) ===
    accepts_web_orders = models.BooleanField(
        default=True,
        help_text="Whether this location accepts online orders for pickup/delivery"
    )
    web_order_lead_time_minutes = models.PositiveIntegerField(
        default=30,
        help_text="Minimum lead time for web orders in minutes"
    )

    # === WEB ORDER NOTIFICATION OVERRIDES (Phase 5) ===
    # These override tenant-wide defaults from WebOrderSettings
    enable_web_notifications = models.BooleanField(
        null=True,
        blank=True,
        help_text="Location-specific override for web order notifications. If null, uses tenant default."
    )
    play_web_notification_sound = models.BooleanField(
        null=True,
        blank=True,
        help_text="Location-specific override for notification sound. If null, uses tenant default."
    )
    auto_print_web_receipt = models.BooleanField(
        null=True,
        blank=True,
        help_text="Location-specific override for auto-printing receipts. If null, uses tenant default."
    )
    auto_print_web_kitchen = models.BooleanField(
        null=True,
        blank=True,
        help_text="Location-specific override for auto-printing kitchen tickets. If null, uses tenant default."
    )
    web_notification_terminals = models.ManyToManyField(
        'terminals.TerminalRegistration',
        blank=True,
        related_name='web_notification_locations',
        help_text="Terminals at this location that receive web order notifications and auto-print."
    )

    # === RECEIPT CUSTOMIZATION (Phase 5) ===
    receipt_header = models.TextField(
        blank=True,
        help_text="Custom receipt header for this location. If blank, uses brand template."
    )
    receipt_footer = models.TextField(
        blank=True,
        help_text="Custom receipt footer for this location. If blank, uses brand template."
    )

    # === INVENTORY DEFAULTS (Phase 5) ===
    low_stock_threshold = models.PositiveIntegerField(
        default=10,
        help_text="Default low stock threshold for this location's inventory. Used when storage location or individual stock doesn't specify."
    )
    expiration_threshold = models.PositiveIntegerField(
        default=7,
        help_text="Default days before expiration to warn for this location's inventory. Used when storage location or individual stock doesn't specify."
    )
    default_inventory_location = models.ForeignKey(
        "inventory.Location",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_for_store_location",
        help_text="Default inventory location for stock operations at this store."
    )

    # === GOOGLE INTEGRATIONS ===
    google_place_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Google Place ID for this location (reviews, maps, directions). Set by POS company staff only.",
    )

    # === COORDINATES (Optional - for distance calculation) ===
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Latitude coordinate for distance calculation and map display",
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Longitude coordinate for distance calculation and map display",
    )

    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'name']),
            models.Index(fields=['tenant', 'slug']),  # For URL lookups
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'slug'],
                condition=models.Q(slug__isnull=False) & ~models.Q(slug=''),
                name='unique_slug_per_tenant'
            )
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """Auto-generate slug from name if not provided"""
        if not self.slug and self.name:
            from django.utils.text import slugify
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1

            # Ensure slug is unique within tenant
            while StoreLocation.objects.filter(tenant=self.tenant, slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1

            self.slug = slug

        super().save(*args, **kwargs)

    @property
    def formatted_address(self):
        """Return formatted address using structured fields, fallback to legacy field"""
        if self.address_line1:
            parts = [self.address_line1]
            if self.address_line2:
                parts.append(self.address_line2)
            if self.city:
                city_state = self.city
                if self.state:
                    city_state += f", {self.state}"
                if self.postal_code:
                    city_state += f" {self.postal_code}"
                parts.append(city_state)
            if self.country and self.country != 'US':
                parts.append(self.country)
            return "\n".join(parts)
        return self.address  # Fallback to legacy field

    def get_effective_tax_rate(self):
        """
        Get tax rate for this location.

        Returns:
            Decimal: This location's tax rate, or 0.00 if not set

        Note: Each location must have its own tax rate.
        """
        return self.tax_rate if self.tax_rate is not None else Decimal('0.00')

    def get_effective_receipt_header(self):
        """
        Get receipt header for this location.

        Returns:
            str: Location-specific header or brand template as fallback
        """
        if self.receipt_header:
            return self.receipt_header
        # Fallback to brand template
        try:
            return self.tenant.global_settings.brand_receipt_header
        except AttributeError:
            return ""

    def get_effective_receipt_footer(self):
        """
        Get receipt footer for this location.

        Returns:
            str: Location-specific footer or brand template as fallback
        """
        if self.receipt_footer:
            return self.receipt_footer
        # Fallback to brand template
        try:
            return self.tenant.global_settings.brand_receipt_footer
        except AttributeError:
            return "Thank you for your business!"

    def get_effective_web_order_settings(self):
        """
        Get effective web order notification settings for this location.

        3-tier hierarchy:
        1. Location-specific override (if set)
        2. Tenant-wide default from GlobalSettings
        3. Hardcoded fallback (True)

        Returns:
            dict: Effective web order settings with keys:
                - enable_notifications (bool)
                - play_notification_sound (bool)
                - auto_print_receipt (bool)
                - auto_print_kitchen (bool)
                - terminals (QuerySet): Terminal registrations for this location
        """
        # Get tenant defaults from GlobalSettings
        try:
            global_settings = self.tenant.global_settings
            tenant_defaults = {
                'enable_notifications': global_settings.default_enable_web_notifications,
                'play_notification_sound': global_settings.default_play_web_notification_sound,
                'auto_print_receipt': global_settings.default_auto_print_web_receipt,
                'auto_print_kitchen': global_settings.default_auto_print_web_kitchen,
            }
        except GlobalSettings.DoesNotExist:
            # Fallback to hardcoded defaults if GlobalSettings doesn't exist yet
            tenant_defaults = {
                'enable_notifications': True,
                'play_notification_sound': True,
                'auto_print_receipt': True,
                'auto_print_kitchen': True,
            }

        return {
            'enable_notifications': (
                self.enable_web_notifications
                if self.enable_web_notifications is not None
                else tenant_defaults['enable_notifications']
            ),
            'play_notification_sound': (
                self.play_web_notification_sound
                if self.play_web_notification_sound is not None
                else tenant_defaults['play_notification_sound']
            ),
            'auto_print_receipt': (
                self.auto_print_web_receipt
                if self.auto_print_web_receipt is not None
                else tenant_defaults['auto_print_receipt']
            ),
            'auto_print_kitchen': (
                self.auto_print_web_kitchen
                if self.auto_print_web_kitchen is not None
                else tenant_defaults['auto_print_kitchen']
            ),
            'terminals': self.web_notification_terminals.filter(
                tenant=self.tenant,
                store_location=self
            )
        }


# === SINGLETON CONFIGURATION MODELS ===


class GlobalSettings(models.Model):
    """
    Tenant-wide settings that apply across ALL locations within a tenant.

    This model contains ONLY:
    - Brand identity (logo, colors, name)
    - Business rules (discount stacking, payment provider)
    - Currency and financial rules
    - Receipt templates (used as fallbacks for locations)

    Location-specific settings (address, phone, tax rate, timezone, hours)
    are stored on StoreLocation model.
    """

    tenant = models.OneToOneField(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='global_settings'
    )

    # === BRAND IDENTITY (Same across all locations) ===
    brand_name = models.CharField(
        max_length=100,
        default="Ajeen POS",
        help_text="The tenant's brand name (e.g., 'Pizza Palace Inc'). Used for branding, not store names."
    )
    brand_logo = models.ImageField(
        upload_to='brand_logos/',
        null=True,
        blank=True,
        help_text="Brand logo used across all locations"
    )
    brand_primary_color = models.CharField(
        max_length=7,
        default="#000000",
        help_text="Primary brand color in hex format (e.g., #FF5733)"
    )
    brand_secondary_color = models.CharField(
        max_length=7,
        default="#FFFFFF",
        help_text="Secondary brand color in hex format (e.g., #FFFFFF)"
    )

    # === FINANCIAL RULES (Same across all locations) ===
    currency = models.CharField(
        max_length=3,
        default="USD",
        help_text="Three-letter currency code (ISO 4217). Same for all locations within tenant."
    )
    surcharge_percentage = models.DecimalField(
        max_digits=8,
        decimal_places=6,
        default=Decimal("0.00"),
        help_text="Tenant-wide surcharge percentage applied to subtotal (e.g., 0.02 for 2%).",
    )
    allow_discount_stacking = models.BooleanField(
        default=False,
        help_text="If true, multiple discounts can be applied to a single order. Same rule for all locations.",
    )

    # === PAYMENT PROCESSING (Same across all locations) ===
    active_terminal_provider = models.CharField(
        max_length=50,
        choices=TerminalProvider.choices,
        default=TerminalProvider.STRIPE_TERMINAL,
        help_text="The currently active payment terminal provider for all locations.",
    )

    # === RECEIPT TEMPLATES (Used as fallback by locations) ===
    brand_receipt_header = models.TextField(
        blank=True,
        help_text="Default receipt header template for all locations. Locations can override."
    )
    brand_receipt_footer = models.TextField(
        default="Thank you for your business!",
        help_text="Default receipt footer template for all locations. Locations can override.",
    )

    # === WEB ORDER NOTIFICATION DEFAULTS (Tenant-wide defaults) ===
    default_enable_web_notifications = models.BooleanField(
        default=True,
        help_text="Tenant-wide default for web order notifications. Locations can override."
    )
    default_play_web_notification_sound = models.BooleanField(
        default=True,
        help_text="Tenant-wide default for notification sound. Locations can override."
    )
    default_auto_print_web_receipt = models.BooleanField(
        default=True,
        help_text="Tenant-wide default for auto-printing receipts. Locations can override."
    )
    default_auto_print_web_kitchen = models.BooleanField(
        default=True,
        help_text="Tenant-wide default for auto-printing kitchen tickets. Locations can override."
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = "Global Settings"

    def clean(self):
        # Ensure only one instance per tenant
        if self.tenant and GlobalSettings.objects.filter(tenant=self.tenant).exclude(pk=self.pk).exists():
            raise ValidationError(f"There can only be one GlobalSettings instance per tenant.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        tenant_name = self.tenant.name if self.tenant else "System"
        return f"Global Settings ({tenant_name})"


class Printer(models.Model):
    """
    Network printer configuration for a specific location.
    Replaces JSON-based printer storage with proper relational model.
    """

    PRINTER_TYPE_CHOICES = [
        ('receipt', 'Receipt Printer'),
        ('kitchen', 'Kitchen Printer'),
    ]

    # Tenant isolation
    tenant = models.ForeignKey('tenant.Tenant', on_delete=models.CASCADE)

    # Location scoping
    location = models.ForeignKey(
        'StoreLocation',
        on_delete=models.CASCADE,
        related_name='printers',
        help_text="Store location where this printer is installed"
    )

    # Printer details
    name = models.CharField(
        max_length=100,
        help_text="Display name (e.g., 'Front Counter Receipt Printer')"
    )
    printer_type = models.CharField(
        max_length=20,
        choices=PRINTER_TYPE_CHOICES,
        help_text="Type of printer: receipt or kitchen"
    )

    # Network configuration
    ip_address = models.GenericIPAddressField(
        help_text="IP address of the network printer"
    )
    port = models.IntegerField(
        default=9100,
        help_text="Port number for printer communication"
    )

    # Status
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this printer is currently active"
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['location', 'printer_type', 'name']
        unique_together = [['location', 'name']]
        indexes = [
            models.Index(fields=['tenant', 'location', 'is_active']),
            models.Index(fields=['tenant', 'printer_type']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_printer_type_display()}) - {self.location.name}"


class KitchenZone(models.Model):
    """
    Kitchen zone with category-based routing for a specific location.
    Replaces JSON-based kitchen zone storage with proper relational model.
    """

    # Tenant isolation
    tenant = models.ForeignKey('tenant.Tenant', on_delete=models.CASCADE)

    # Location scoping
    location = models.ForeignKey(
        'StoreLocation',
        on_delete=models.CASCADE,
        related_name='kitchen_zones',
        help_text="Store location where this kitchen zone is configured"
    )

    # Zone details
    name = models.CharField(
        max_length=100,
        help_text="Display name for this kitchen zone (e.g., 'Grill Station', 'Bakery')"
    )

    # Printer assignment
    printer = models.ForeignKey(
        'Printer',
        on_delete=models.CASCADE,
        related_name='kitchen_zones',
        limit_choices_to={'printer_type': 'kitchen'},
        help_text="Kitchen printer assigned to this zone"
    )

    # Category filtering
    categories = models.ManyToManyField(
        'products.Category',
        related_name='kitchen_zones',
        blank=True,
        help_text="Product categories that should print to this kitchen zone"
    )

    # Print all items flag
    print_all_items = models.BooleanField(
        default=False,
        help_text="If true, print all order items regardless of category filters"
    )

    # Settings
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this kitchen zone is currently active"
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['location', 'name']
        unique_together = [['location', 'name']]
        indexes = [
            models.Index(fields=['tenant', 'location', 'is_active']),
            models.Index(fields=['printer', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} - {self.location.name}"


class PrinterConfiguration(models.Model):
    """
    DEPRECATED: Use Printer and KitchenZone models instead.

    Legacy singleton model for storing printer configurations.
    Kept for backward compatibility during migration.
    """

    tenant = models.OneToOneField(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='printer_configuration'
    )

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
        help_text="Kitchen zone configurations with category filters (e.g., [{'name': 'Grill Station', 'printer_name': 'Kitchen Printer', 'category_ids': [1, 2]}])",
    )

    objects = TenantManager()
    all_objects = models.Manager()

    def clean(self):
        # Ensure only one instance per tenant
        if self.tenant and PrinterConfiguration.objects.filter(tenant=self.tenant).exclude(pk=self.pk).exists():
            raise ValidationError(
                "There can only be one PrinterConfiguration instance per tenant."
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        tenant_name = self.tenant.name if self.tenant else "System"
        return f"Printer & Kitchen Zone Configuration ({tenant_name})"

    class Meta:
        verbose_name_plural = "Printer Configuration"


# WebOrderSettings model REMOVED
# Web order notification settings architecture:
# 1. Location-specific overrides: StoreLocation.enable_web_notifications, etc. (nullable)
# 2. Tenant-wide defaults: GlobalSettings.default_enable_web_notifications, etc. (boolean, default True)
# 3. Hardcoded fallback: All True (if GlobalSettings doesn't exist)
# See StoreLocation.get_effective_web_order_settings() for hierarchy logic


# === DEVICE & PROVIDER-SPECIFIC MODELS ===


class TerminalLocation(SoftDeleteMixin):
    """
    Represents a Stripe-specific configuration linked to a primary StoreLocation.
    This model acts as a bridge, scoping Stripe API actions (like discovering readers)
    to a specific business location without tying core logic to Stripe.
    """

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='terminal_locations'
    )
    store_location = models.OneToOneField(
        StoreLocation,
        on_delete=models.PROTECT,
        null=True,  # Temporarily allow null for migration
        help_text="The primary store this Stripe configuration is for.",
    )
    stripe_id = models.CharField(
        max_length=255,
        help_text="The ID of the location from Stripe (e.g., tml_...).",
    )

    objects = TenantSoftDeleteManager()
    all_objects = models.Manager()

    def __str__(self):
        return f"{self.store_location.name} (Stripe Config: {self.stripe_id})"

    class Meta:
        verbose_name = "Stripe Location Link"
        verbose_name_plural = "Stripe Location Links"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "stripe_id"],
                name="unique_stripe_id_per_tenant",
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'store_location']),
        ]


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

    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='stock_action_reason_configs',
        null=True,
        blank=True,
        help_text="Tenant this reason belongs to. NULL for global system reasons shared across all tenants."
    )
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

    # Custom manager that returns both global (tenant=NULL) and tenant-specific reasons
    objects = models.Manager()
    all_objects = models.Manager()

    @classmethod
    def get_available_for_tenant(cls, tenant):
        """Get all reasons available for a specific tenant (global + tenant-specific)"""
        from django.db.models import Q
        return cls.objects.filter(
            Q(tenant__isnull=True) | Q(tenant=tenant)
        )

    class Meta:
        verbose_name = "Stock Action Reason"
        verbose_name_plural = "Stock Action Reasons"
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['tenant', 'is_active', 'category']),
            models.Index(fields=['tenant', 'is_system_reason']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"
    
    def clean(self):
        """Validate the model before saving"""
        from django.core.exceptions import ValidationError

        # Ensure system reasons cannot be deactivated
        if self.is_system_reason and not self.is_active:
            raise ValidationError("System reasons cannot be deactivated")

        # System reasons must be global (tenant=NULL)
        if self.is_system_reason and self.tenant is not None:
            raise ValidationError("System reasons must be global (tenant should be NULL)")

        # Custom reasons must have a tenant
        if not self.is_system_reason and self.tenant is None:
            raise ValidationError("Custom reasons must belong to a specific tenant")

        # Ensure name is unique within active reasons
        # For system reasons: unique globally
        # For custom reasons: unique per tenant
        if self.is_system_reason:
            existing = StockActionReasonConfig.objects.filter(
                name=self.name,
                is_active=True,
                is_system_reason=True
            ).exclude(pk=self.pk)
        else:
            existing = StockActionReasonConfig.objects.filter(
                tenant=self.tenant,
                name=self.name,
                is_active=True
            ).exclude(pk=self.pk)

        if existing.exists():
            scope = "globally" if self.is_system_reason else "for this tenant"
            raise ValidationError(f"An active reason with the name '{self.name}' already exists {scope}")
    
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
