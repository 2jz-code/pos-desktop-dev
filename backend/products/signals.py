from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.utils import timezone

from products.models import ProductType


@receiver(m2m_changed, sender=ProductType.default_taxes.through)
def producttype_default_taxes_changed(sender, instance, action, **kwargs):
    """
    Bump ProductType.updated_at when default taxes change so sync picks it up.
    """
    if action in ("post_add", "post_remove", "post_clear"):
        instance.updated_at = timezone.now()
        instance.save(update_fields=["updated_at"])
