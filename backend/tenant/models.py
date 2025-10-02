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

    # Future: Subscription/billing fields
    # subscription_status = models.CharField(...)
    # subscription_plan = models.ForeignKey(...)
    # trial_ends_at = models.DateTimeField(...)

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
