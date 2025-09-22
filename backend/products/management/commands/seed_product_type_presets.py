from django.core.management.base import BaseCommand
from django.db import transaction

from products.models import ProductType


PRESETS = [
    {
        "name": "Restaurant Food",
        "description": "Made-to-order items; no inventory tracking (always available).",
        "inventory_behavior": ProductType.InventoryBehavior.NONE,
        "stock_enforcement": ProductType.StockEnforcement.IGNORE,
        "allow_negative_stock": False,
        "tax_inclusive": False,
        "available_online": True,
        "available_pos": True,
        "standard_prep_minutes": 10,
    },
    {
        "name": "Retail Product",
        "description": "Physical item tracked by quantity; blocks when out of stock.",
        "inventory_behavior": ProductType.InventoryBehavior.QUANTITY,
        "stock_enforcement": ProductType.StockEnforcement.BLOCK,
        "allow_negative_stock": False,
        "tax_inclusive": False,
        "available_online": True,
        "available_pos": True,
        "standard_prep_minutes": 0,
    },
    {
        "name": "Beverage",
        "description": "No inventory tracking; always available.",
        "inventory_behavior": ProductType.InventoryBehavior.NONE,
        "stock_enforcement": ProductType.StockEnforcement.IGNORE,
        "allow_negative_stock": False,
        "tax_inclusive": False,
        "available_online": True,
        "available_pos": True,
        "standard_prep_minutes": 0,
    },
    {
        "name": "Service",
        "description": "Non-inventory service item.",
        "inventory_behavior": ProductType.InventoryBehavior.NONE,
        "stock_enforcement": ProductType.StockEnforcement.IGNORE,
        "allow_negative_stock": False,
        "tax_inclusive": False,
        "available_online": True,
        "available_pos": True,
        "standard_prep_minutes": 0,
    },
]


class Command(BaseCommand):
    help = "Seed default Product Type presets"

    @transaction.atomic
    def handle(self, *args, **options):
        created = 0
        updated = 0
        for data in PRESETS:
            obj, was_created = ProductType.objects.update_or_create(
                name=data["name"], defaults=data
            )
            if was_created:
                created += 1
            else:
                updated += 1
        self.stdout.write(self.style.SUCCESS(
            f"Product Type presets processed. Created: {created}, Updated: {updated}"
        ))
