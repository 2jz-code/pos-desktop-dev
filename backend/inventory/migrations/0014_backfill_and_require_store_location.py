# Generated manually for Phase 5 multi-location implementation

from django.db import migrations, models
import django.db.models.deletion


def backfill_inventory_store_locations(apps, schema_editor):
    """
    Backfill store_location for inventory.Location, InventoryStock, and StockHistoryEntry.
    Uses the tenant's first store location since this is a single-location setup.
    """
    Location = apps.get_model('inventory', 'Location')
    InventoryStock = apps.get_model('inventory', 'InventoryStock')
    StockHistoryEntry = apps.get_model('inventory', 'StockHistoryEntry')
    StoreLocation = apps.get_model('settings', 'StoreLocation')

    # Step 1: Backfill inventory.Location
    locations_to_update = Location.objects.filter(store_location__isnull=True)
    tenants = locations_to_update.values_list('tenant_id', flat=True).distinct()

    for tenant_id in tenants:
        default_store_location = StoreLocation.objects.filter(tenant_id=tenant_id).first()

        if default_store_location:
            updated = Location.objects.filter(
                tenant_id=tenant_id,
                store_location__isnull=True
            ).update(store_location=default_store_location)
            print(f"✓ Backfilled store_location for {updated} inventory.Location records in tenant {tenant_id}")
        else:
            print(f"⚠ Warning: No store location found for tenant {tenant_id}")

    # Step 2: Backfill InventoryStock from location.store_location
    stock_to_update = InventoryStock.objects.filter(store_location__isnull=True).select_related('location')
    updated_count = 0

    for stock in stock_to_update:
        if stock.location and stock.location.store_location:
            stock.store_location = stock.location.store_location
            stock.save(update_fields=['store_location'])
            updated_count += 1

    print(f"✓ Backfilled store_location for {updated_count} InventoryStock records")

    # Step 3: Backfill StockHistoryEntry from location.store_location
    history_to_update = StockHistoryEntry.objects.filter(store_location__isnull=True).select_related('location')
    updated_count = 0

    for entry in history_to_update:
        if entry.location and entry.location.store_location:
            entry.store_location = entry.location.store_location
            entry.save(update_fields=['store_location'])
            updated_count += 1

    print(f"✓ Backfilled store_location for {updated_count} StockHistoryEntry records")


def reverse_backfill(apps, schema_editor):
    """
    Reverse operation: set store_location back to NULL for all models.
    """
    Location = apps.get_model('inventory', 'Location')
    InventoryStock = apps.get_model('inventory', 'InventoryStock')
    StockHistoryEntry = apps.get_model('inventory', 'StockHistoryEntry')

    Location.objects.all().update(store_location=None)
    InventoryStock.objects.all().update(store_location=None)
    StockHistoryEntry.objects.all().update(store_location=None)


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0013_location_store_location'),
        ('settings', '0023_storelocation_default_inventory_location'),
    ]

    operations = [
        # === INVENTORYSTOCK: Add store_location FK ===
        migrations.AddField(
            model_name='inventorystock',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Denormalized from location.store_location for fast queries',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='inventory_stocks',
                to='settings.storelocation'
            ),
        ),

        # === STOCKHISTORYENTRY: Add store_location FK ===
        migrations.AddField(
            model_name='stockhistoryentry',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Denormalized from location.store_location for fast audit queries',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='stock_history_entries',
                to='settings.storelocation'
            ),
        ),

        # === ADD INDEXES ===
        # Location indexes
        migrations.AddIndex(
            model_name='location',
            index=models.Index(fields=['tenant', 'store_location'], name='inventory_loc_tenant_store_idx'),
        ),
        # InventoryStock indexes
        migrations.AddIndex(
            model_name='inventorystock',
            index=models.Index(fields=['tenant', 'store_location'], name='invstock_ten_store_idx'),
        ),
        migrations.AddIndex(
            model_name='inventorystock',
            index=models.Index(fields=['tenant', 'store_location', 'product'], name='invstock_ten_store_prod_idx'),
        ),
        # StockHistoryEntry indexes
        migrations.AddIndex(
            model_name='stockhistoryentry',
            index=models.Index(fields=['tenant', 'store_location', 'timestamp'], name='stock_hist_ten_store_time_idx'),
        ),
        migrations.AddIndex(
            model_name='stockhistoryentry',
            index=models.Index(fields=['tenant', 'store_location', 'operation_type'], name='stock_hist_ten_store_op_idx'),
        ),

        # === BACKFILL DATA ===
        migrations.RunPython(backfill_inventory_store_locations, reverse_backfill),

        # === MAKE FKS REQUIRED (NON-NULLABLE) ===
        # Location
        migrations.AlterField(
            model_name='location',
            name='store_location',
            field=models.ForeignKey(
                help_text='The store this storage location belongs to.',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='inventory_storage_locations',
                to='settings.storelocation'
            ),
        ),
        # InventoryStock
        migrations.AlterField(
            model_name='inventorystock',
            name='store_location',
            field=models.ForeignKey(
                help_text='Denormalized from location.store_location for fast queries',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='inventory_stocks',
                to='settings.storelocation'
            ),
        ),
        # StockHistoryEntry
        migrations.AlterField(
            model_name='stockhistoryentry',
            name='store_location',
            field=models.ForeignKey(
                help_text='Denormalized from location.store_location for fast audit queries',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='stock_history_entries',
                to='settings.storelocation'
            ),
        ),
    ]
