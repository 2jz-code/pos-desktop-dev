# Generated manually for Phase 5 multi-location implementation

from django.db import migrations, models
import django.db.models.deletion


def backfill_store_location(apps, schema_editor):
    """
    Backfill store_location for existing orders using the tenant's first store location.
    Since this is a single-location setup, we use .first() to get the default location.
    """
    Order = apps.get_model('orders', 'Order')
    StoreLocation = apps.get_model('settings', 'StoreLocation')

    # Get all orders without a store_location
    orders_to_update = Order.objects.filter(store_location__isnull=True)

    # Group by tenant
    tenants = orders_to_update.values_list('tenant_id', flat=True).distinct()

    for tenant_id in tenants:
        # Get the first (default) store location for this tenant
        default_location = StoreLocation.objects.filter(tenant_id=tenant_id).first()

        if default_location:
            # Update all orders for this tenant
            Order.objects.filter(
                tenant_id=tenant_id,
                store_location__isnull=True
            ).update(store_location=default_location)
            print(f"✓ Backfilled store_location for tenant {tenant_id} orders using location: {default_location.name}")
        else:
            print(f"⚠ Warning: No store location found for tenant {tenant_id}")


def reverse_backfill(apps, schema_editor):
    """
    Reverse operation: set store_location back to NULL.
    """
    Order = apps.get_model('orders', 'Order')
    Order.objects.all().update(store_location=None)


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0024_alter_order_tenant_alter_orderdiscount_tenant_and_more'),
        ('settings', '0023_storelocation_default_inventory_location'),
    ]

    operations = [
        # Step 1: Add nullable FK
        migrations.AddField(
            model_name='order',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Store location where this order was placed',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='orders',
                to='settings.storelocation'
            ),
        ),
        # Step 2: Backfill data
        migrations.RunPython(backfill_store_location, reverse_backfill),
        # Step 3: Make FK required (non-nullable)
        migrations.AlterField(
            model_name='order',
            name='store_location',
            field=models.ForeignKey(
                help_text='Store location where this order was placed',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='orders',
                to='settings.storelocation'
            ),
        ),
    ]
