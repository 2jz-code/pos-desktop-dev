from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal


class TerminalProvider(models.TextChoices):
    STRIPE_TERMINAL = "STRIPE_TERMINAL", "Stripe Terminal"
    CLOVER_TERMINAL = "CLOVER_TERMINAL", "Clover Terminal"


class GlobalSettings(models.Model):
    """
    A singleton model to store globally accessible settings for the application.
    These settings affect ALL terminals and should be managed centrally.
    """

    # === TAX & FINANCIAL SETTINGS ===
    tax_rate = models.DecimalField(
        max_digits=8,
        decimal_places=6,
        default=Decimal("0.08"),
        help_text="The default sales tax rate as a decimal (e.g., 0.08 for 8%).",
    )
    surcharge_percentage = models.DecimalField(
        max_digits=8,
        decimal_places=6,
        default=Decimal("0.00"),
        help_text="A percentage-based surcharge applied to the subtotal (e.g., 0.02 for 2%).",
    )
    currency = models.CharField(
        max_length=3,
        default="USD",
        help_text="Three-letter currency code (ISO 4217).",
    )

    # === STORE INFORMATION ===
    store_name = models.CharField(
        max_length=255,
        default="",
        help_text="Business name displayed on receipts and reports.",
    )
    store_address = models.TextField(
        blank=True,
        help_text="Full business address for receipts.",
    )
    store_phone = models.CharField(
        max_length=20,
        blank=True,
        help_text="Business phone number.",
    )
    store_email = models.EmailField(
        blank=True,
        help_text="Business email address.",
    )

    # === RECEIPT CONFIGURATION ===
    receipt_header = models.TextField(
        blank=True,
        help_text="Custom text to appear at the top of receipts.",
    )
    receipt_footer = models.TextField(
        default="Thank you for your business!",
        help_text="Custom text to appear at the bottom of receipts.",
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
        null=True,
        blank=True,
        help_text="Business opening time (used for reporting).",
    )
    closing_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Business closing time (used for reporting).",
    )
    timezone = models.CharField(
        max_length=50,
        default="UTC",
        help_text="Business timezone (e.g., 'America/New_York').",
    )

    # === INVENTORY SETTINGS ===
    default_inventory_location = models.ForeignKey(
        "inventory.Location",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Default location for inventory operations and sales.",
        related_name="default_for_settings",
    )

    def clean(self):
        """
        Ensures that a new instance cannot be created if one already exists.
        """
        if GlobalSettings.objects.exists() and not self.pk:
            raise ValidationError("There can only be one GlobalSettings instance.")

    def save(self, *args, **kwargs):
        """
        Overrides the save method to run the clean method first.
        """
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Global Settings - {self.store_name or 'Unnamed Store'}"

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
            print(f"Business hours check failed: {e}")
            return True

    class Meta:
        verbose_name_plural = "Global Settings"


class POSDevice(models.Model):
    """
    Represents a physical Point of Sale station and its permanent configuration.
    This model links a unique device ID (generated and stored by the client)
    to a specific Stripe Terminal reader ID.
    """

    device_id = models.CharField(
        max_length=255,
        unique=True,
        primary_key=True,
        help_text="Unique identifier for the POS device, generated by the client application.",
    )
    reader_id = models.CharField(
        max_length=255,
        help_text="The ID of the Stripe Terminal reader assigned to this device (e.g., tmr_...).",
    )
    nickname = models.CharField(
        max_length=100,
        blank=True,
        help_text="An optional friendly name for the POS station (e.g., 'Front Counter').",
    )

    def __str__(self):
        return f"{self.nickname or self.device_id} -> {self.reader_id}"

    class Meta:
        verbose_name = "POS Device Pairing"
        verbose_name_plural = "POS Device Pairings"


class TerminalLocation(models.Model):
    """
    Represents a physical store location that has been synced from Stripe.
    This allows for scoping terminal actions (like discovering readers) to a specific
    location. There can be only one default location at a time.
    """

    name = models.CharField(
        max_length=255, help_text="The user-friendly name of the location."
    )
    stripe_id = models.CharField(
        max_length=255,
        unique=True,
        help_text="The ID of the location from Stripe (e.g., tml_...).",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Whether this is the default location for transactions.",
    )

    def __str__(self):
        return f"{self.name} ({'Default' if self.is_default else 'Not Default'})"

    def save(self, *args, **kwargs):
        """
        Overrides the save method to ensure that if this location is being set as
        the default, any other location that is currently the default is unset.
        """
        if self.is_default:
            # Unset any other default location.
            TerminalLocation.objects.filter(is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = "Terminal Location"
        verbose_name_plural = "Terminal Locations"
        ordering = ["name"]
