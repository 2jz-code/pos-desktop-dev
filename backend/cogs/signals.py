"""
Signal handlers for the COGS system.

Phase 1: Minimal signals - mainly for future expansion.
Phase 2+: Will add handlers for order completion, inventory movements, etc.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from tenant.models import Tenant


@receiver(post_save, sender=Tenant)
def seed_default_units_for_tenant(sender, instance, created, **kwargs):
    """
    Seed default units when a new tenant is created.
    """
    if created:
        from cogs.services.unit_seeding import seed_default_units
        seed_default_units(instance)
