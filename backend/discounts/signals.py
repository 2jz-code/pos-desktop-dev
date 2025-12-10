from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.utils import timezone

from .models import Discount


def _bump_discount_updated_at(pk_set):
    """
    Helper to bump updated_at on discounts when applicability M2M changes.
    """
    if not pk_set:
        return
    Discount.objects.filter(id__in=pk_set).update(updated_at=timezone.now())


@receiver(m2m_changed, sender=Discount.applicable_products.through)
def discount_applicable_products_changed(sender, instance, action, reverse, model, pk_set, **kwargs):
    if action in ("post_add", "post_remove", "post_clear"):
        instance.updated_at = timezone.now()
        instance.save(update_fields=["updated_at"])


@receiver(m2m_changed, sender=Discount.applicable_categories.through)
def discount_applicable_categories_changed(sender, instance, action, reverse, model, pk_set, **kwargs):
    if action in ("post_add", "post_remove", "post_clear"):
        instance.updated_at = timezone.now()
        instance.save(update_fields=["updated_at"])
