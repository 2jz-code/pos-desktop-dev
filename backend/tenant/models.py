import uuid
from django.db import models


class Tenant(models.Model):
    """
    Root entity for multi-tenancy.
    Each customer (restaurant, business) is a tenant.

    Subdomain structure: {slug}.ajeen.com
    Example: joespizza.ajeen.com, mariascafe.ajeen.com
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(
        max_length=255,
        help_text="Display name for the tenant (e.g., Joe's Pizza)"
    )
    slug = models.SlugField(
        unique=True,
        help_text="URL-safe identifier used in subdomain (e.g., joespizza → joespizza.ajeen.com)"
    )

    # Business details
    business_name = models.CharField(max_length=255)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=50, blank=True)

    # Status
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive tenants cannot access the system"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Ownership & Subscription (Phase 1: Multi-tenant SaaS preparation)
    OWNERSHIP_TYPE_CHOICES = [
        ('system', 'System Owned'),      # Your restaurants - full access
        ('customer', 'Customer Owned'),   # Paying customers - subscription limits
        ('demo', 'Demo/Trial'),          # Prospect demos - limited features
    ]
    ownership_type = models.CharField(
        max_length=20,
        choices=OWNERSHIP_TYPE_CHOICES,
        default='customer',
        help_text="Determines access level and billing requirements"
    )

    # Subscription tier reference (Phase 1: nullable, Phase 2: link to SubscriptionTier model)
    subscription_tier = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Phase 2: basic, pro, enterprise, etc. Phase 1: leave null"
    )

    # Internal notes for tracking
    internal_notes = models.TextField(
        blank=True,
        help_text="Internal notes about this tenant (billing issues, special arrangements, etc.)"
    )

    class Meta:
        db_table = 'tenants'
        ordering = ['name']
        indexes = [
            models.Index(fields=['slug']),  # Fast subdomain lookup
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.name

    def get_subdomain_url(self):
        """Get the full subdomain URL for this tenant."""
        return f"{self.slug}.ajeen.com"

    def is_system_owned(self):
        """Check if this tenant is system-owned (your restaurants)."""
        return self.ownership_type == 'system'

    def get_primary_domain(self):
        """Get the primary custom domain for this tenant, or None."""
        return self.custom_domains.filter(is_primary=True, verified=True).first()

    def get_verified_domains(self):
        """Get all verified custom domains for this tenant."""
        return self.custom_domains.filter(verified=True)


class CustomDomain(models.Model):
    """
    Custom domain for a tenant.

    Phase 1: Manual verification via admin
    Phase 3: Automated DNS verification, SSL provisioning

    Examples:
        order.joespizza.com → Tenant "joespizza"
        shop.mariascafe.com → Tenant "mariascafe"
    """
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='custom_domains',
        help_text="Tenant that owns this domain"
    )
    domain = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Fully qualified domain name (e.g., order.joespizza.com)"
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Primary domain for this tenant (used in emails, links, etc.)"
    )

    # Verification (Phase 1: manual, Phase 3: automated)
    verified = models.BooleanField(
        default=False,
        help_text="Whether domain ownership has been verified"
    )
    verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When domain was verified"
    )
    verification_method = models.CharField(
        max_length=20,
        default='manual',
        choices=[
            ('manual', 'Manual Verification'),
            ('txt', 'DNS TXT Record'),
            ('cname', 'DNS CNAME Record'),
            ('meta', 'HTML Meta Tag'),
            ('file', 'HTML File Upload'),
        ],
        help_text="How domain ownership was verified"
    )

    # SSL/TLS (Phase 3: automated with Let's Encrypt)
    ssl_enabled = models.BooleanField(
        default=False,
        help_text="Whether SSL/TLS is provisioned for this domain"
    )
    ssl_provisioned_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When SSL certificate was provisioned"
    )

    # Metadata
    notes = models.TextField(
        blank=True,
        help_text="Internal notes about this domain (DNS config, special setup, etc.)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'custom_domains'
        ordering = ['-is_primary', 'domain']
        indexes = [
            models.Index(fields=['domain']),  # Fast O(1) lookup in middleware
            models.Index(fields=['tenant', 'verified']),
            models.Index(fields=['verified', 'is_primary']),
        ]
        verbose_name = 'Custom Domain'
        verbose_name_plural = 'Custom Domains'

    def __str__(self):
        verified_mark = '✓' if self.verified else '⏳'
        primary_mark = '★' if self.is_primary else ''
        return f"{verified_mark} {self.domain} → {self.tenant.name} {primary_mark}".strip()

    def save(self, *args, **kwargs):
        """Ensure only one primary domain per tenant."""
        if self.is_primary:
            # Unset any other primary domains for this tenant
            CustomDomain.objects.filter(
                tenant=self.tenant,
                is_primary=True
            ).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)
