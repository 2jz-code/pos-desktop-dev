"""
Customer models - Clean implementation without AbstractUser inheritance.
"""
from django.db import models
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from django.core.validators import EmailValidator
from core_backend.utils.pii import PIIProtection
import uuid
import secrets
from datetime import timedelta


class CustomerManager(models.Manager):
    """Custom manager for Customer model"""
    
    def create_customer(self, email, password=None, **extra_fields):
        """Create and return a customer with email and password"""
        if not email:
            raise ValueError('Email is required')
        
        email = self.normalize_email(email)
        customer = self.model(email=email, **extra_fields)
        if password:
            customer.set_password(password)
        customer.save(using=self._db)
        return customer
    
    def normalize_email(self, email):
        """Normalize email address"""
        if email:
            email = email.strip().lower()
        return email
    
    def get_by_email(self, email):
        """Get customer by email address"""
        normalized_email = self.normalize_email(email)
        return self.get(email=normalized_email)


class Customer(models.Model):
    """
    Clean customer model for e-commerce customers.
    Separate from staff users with customer-specific features.
    No AbstractUser inheritance to avoid Django auth complexity.
    """
    
    class ContactPreference(models.TextChoices):
        EMAIL = 'email', 'Email'
        SMS = 'sms', 'SMS'
        PHONE = 'phone', 'Phone Call'
        NONE = 'none', 'No Contact'
    
    # Primary fields
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(
        unique=True, 
        validators=[EmailValidator()],
        help_text="Customer's primary email address"
    )
    password = models.CharField(
        max_length=128,
        help_text="Customer's hashed password"
    )
    
    # Personal information
    first_name = models.CharField(
        max_length=150,
        help_text="Customer's first name"
    )
    last_name = models.CharField(
        max_length=150,
        help_text="Customer's last name"
    )
    phone_number = models.CharField(
        max_length=20, 
        blank=True, 
        help_text="Customer's phone number"
    )
    
    # Customer Preferences
    preferred_contact_method = models.CharField(
        max_length=10,
        choices=ContactPreference.choices,
        default=ContactPreference.EMAIL,
        help_text="Preferred method of communication"
    )
    marketing_opt_in = models.BooleanField(
        default=False,
        help_text="Customer opted in to marketing communications"
    )
    newsletter_subscribed = models.BooleanField(
        default=False,
        help_text="Subscribed to newsletter"
    )
    
    # Customer Profile
    birth_date = models.DateField(
        null=True, 
        blank=True,
        help_text="Customer's birth date"
    )
    
    # Account Status
    is_active = models.BooleanField(
        default=True,
        help_text="Whether the customer account is active"
    )
    email_verified = models.BooleanField(
        default=False,
        help_text="Whether customer's email is verified"
    )
    phone_verified = models.BooleanField(
        default=False,
        help_text="Whether customer's phone is verified"
    )
    
    # Authentication tracking
    last_login = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time customer logged in"
    )
    
    # Legacy migration support
    legacy_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        unique=True,
        help_text="Original User ID before migration"
    )
    
    # Timestamps
    date_joined = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    objects = CustomerManager()
    
    class Meta:
        db_table = 'customers_customer'
        verbose_name = 'Customer'
        verbose_name_plural = 'Customers'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['phone_number']),
            models.Index(fields=['is_active']),
            models.Index(fields=['date_joined']),
            models.Index(fields=['last_login']),
            models.Index(fields=['legacy_id']),
        ]
    
    def __str__(self):
        """PII-safe string representation"""
        return PIIProtection.safe_str_representation(
            self, 
            email_field='email',
            name_fields=['first_name', 'last_name']
        )
    
    def set_password(self, raw_password):
        """Hash and set customer password"""
        self.password = make_password(raw_password)
    
    def check_password(self, raw_password):
        """Check if provided password matches stored hash"""
        return check_password(raw_password, self.password)
    
    @property
    def full_name(self):
        """Return customer's full name"""
        return self.get_full_name()
    
    def get_full_name(self):
        """Return first_name plus last_name, with space in between"""
        full_name = f'{self.first_name} {self.last_name}'.strip()
        return full_name if full_name else self.email.split('@')[0]
    
    def get_short_name(self):
        """Return the short name for the customer"""
        return self.first_name or self.email.split('@')[0]
    
    def update_last_login(self):
        """Update last login timestamp"""
        self.last_login = timezone.now()
        self.save(update_fields=['last_login'])
    
    # Analytics properties (calculated on demand, not stored)
    @property
    def total_orders(self):
        """Calculate total number of orders"""
        from orders.models import Order
        return Order.objects.filter(customer=self).count()
    
    @property
    def total_spent(self):
        """Calculate total amount spent"""
        from orders.models import Order
        from django.db.models import Sum
        result = Order.objects.filter(customer=self).aggregate(
            total=Sum('grand_total')
        )
        return result['total'] or 0
    
    @property
    def average_order_value(self):
        """Calculate average order value"""
        total_orders = self.total_orders
        if total_orders == 0:
            return 0
        return self.total_spent / total_orders
    
    @property
    def last_order_date(self):
        """Get date of most recent order"""
        from orders.models import Order
        last_order = Order.objects.filter(customer=self).order_by('-created_at').first()
        return last_order.created_at if last_order else None
    
    @property
    def days_since_last_order(self):
        """Calculate days since last order"""
        if self.last_order_date:
            return (timezone.now() - self.last_order_date).days
        return None
    
    @property
    def is_active_customer(self):
        """Check if customer has ordered in last 90 days"""
        if self.last_order_date:
            return (timezone.now() - self.last_order_date).days <= 90
        return False
    
    # Compatibility properties for orders permissions
    @property
    def is_pos_staff(self):
        """Customers are never POS staff"""
        return False


class CustomerAddress(models.Model):
    """Customer shipping/billing addresses"""
    
    class AddressType(models.TextChoices):
        SHIPPING = 'shipping', 'Shipping'
        BILLING = 'billing', 'Billing'
        BOTH = 'both', 'Shipping & Billing'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer, 
        on_delete=models.CASCADE, 
        related_name='addresses'
    )
    
    # Address fields
    address_type = models.CharField(
        max_length=10,
        choices=AddressType.choices,
        default=AddressType.SHIPPING
    )
    is_default = models.BooleanField(default=False)
    
    # Address details
    street_address = models.CharField(max_length=255)
    apartment = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=50)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=50, default='United States')
    
    # Special instructions
    delivery_instructions = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'customers_customer_address'
        verbose_name = 'Customer Address'
        verbose_name_plural = 'Customer Addresses'
        unique_together = ['customer', 'address_type', 'is_default']
    
    def __str__(self):
        """PII-safe string representation"""
        customer_name = PIIProtection.mask_name(self.customer.get_short_name())
        return f"{customer_name}'s {self.get_address_type_display()} Address"


class CustomerPasswordResetToken(models.Model):
    """
    Secure password reset tokens for customers.
    Single-use tokens with 24-hour expiry.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer, 
        on_delete=models.CASCADE, 
        related_name='password_reset_tokens'
    )
    token = models.CharField(max_length=40, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'customers_password_reset_token'
        verbose_name = 'Password Reset Token'
        verbose_name_plural = 'Password Reset Tokens'
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['customer', 'used_at']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-generate token and expiry on creation"""
        if not self.token:
            self.token = secrets.token_urlsafe(30)  # 40-char URL-safe token
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)
    
    @property
    def is_expired(self):
        """Check if token has expired"""
        return timezone.now() > self.expires_at
    
    @property
    def is_used(self):
        """Check if token has been used"""
        return self.used_at is not None
    
    @property
    def is_valid(self):
        """Check if token is valid (not expired and not used)"""
        return not self.is_expired and not self.is_used
    
    def mark_as_used(self):
        """Mark token as used"""
        self.used_at = timezone.now()
        self.save(update_fields=['used_at'])
    
    def __str__(self):
        """PII-safe string representation"""
        customer_name = PIIProtection.mask_name(self.customer.get_short_name())
        status = "used" if self.is_used else ("expired" if self.is_expired else "active")
        return f"Password reset token for {customer_name} ({status})"


class CustomerEmailVerificationToken(models.Model):
    """
    Email verification tokens for customers.
    Single-use tokens with 24-hour expiry.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer, 
        on_delete=models.CASCADE, 
        related_name='email_verification_tokens'
    )
    token = models.CharField(max_length=40, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'customers_email_verification_token'
        verbose_name = 'Email Verification Token'
        verbose_name_plural = 'Email Verification Tokens'
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['customer', 'used_at']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-generate token and expiry on creation"""
        if not self.token:
            self.token = secrets.token_urlsafe(30)  # 40-char URL-safe token
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)
    
    @property
    def is_expired(self):
        """Check if token has expired"""
        return timezone.now() > self.expires_at
    
    @property
    def is_used(self):
        """Check if token has been used"""
        return self.used_at is not None
    
    @property
    def is_valid(self):
        """Check if token is valid (not expired and not used)"""
        return not self.is_expired and not self.is_used
    
    def mark_as_used(self):
        """Mark token as used"""
        self.used_at = timezone.now()
        self.save(update_fields=['used_at'])
    
    def __str__(self):
        """PII-safe string representation"""
        customer_name = PIIProtection.mask_name(self.customer.get_short_name())
        status = "used" if self.is_used else ("expired" if self.is_expired else "active")
        return f"Email verification token for {customer_name} ({status})"