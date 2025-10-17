# Generated manually for Phase 5 multi-location implementation

from django.db import migrations, models
import django.db.models.deletion


def backfill_payment_store_location(apps, schema_editor):
    """
    Backfill store_location for existing payments from their associated orders.
    Payment.store_location is denormalized from Order for performance.
    """
    Payment = apps.get_model('payments', 'Payment')

    # Get all payments without a store_location
    payments_to_update = Payment.objects.filter(store_location__isnull=True).select_related('order')

    updated_count = 0
    skipped_count = 0

    for payment in payments_to_update:
        if payment.order and payment.order.store_location:
            payment.store_location = payment.order.store_location
            payment.save(update_fields=['store_location'])
            updated_count += 1
        else:
            print(f"⚠ Warning: Payment {payment.id} has no order.store_location to backfill from")
            skipped_count += 1

    print(f"✓ Backfilled store_location for {updated_count} payments")
    if skipped_count > 0:
        print(f"⚠ Skipped {skipped_count} payments (no order.store_location)")


def reverse_backfill(apps, schema_editor):
    """
    Reverse operation: set store_location back to NULL.
    """
    Payment = apps.get_model('payments', 'Payment')
    Payment.objects.all().update(store_location=None)


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0015_alter_giftcard_tenant_alter_payment_tenant_and_more'),
        ('orders', '0025_add_store_location_with_backfill'),  # Must run after orders migration
        ('settings', '0023_storelocation_default_inventory_location'),
    ]

    operations = [
        # Step 1: Add nullable FK
        migrations.AddField(
            model_name='payment',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Denormalized from Order for fast location-based queries',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='payments',
                to='settings.storelocation'
            ),
        ),
        # Step 2: Add indexes for location-based queries
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['tenant', 'store_location', 'status'], name='payment_tenant_loc_status_idx'),
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['tenant', 'store_location', 'created_at'], name='payment_tenant_loc_created_idx'),
        ),
        # Step 3: Backfill data from orders
        migrations.RunPython(backfill_payment_store_location, reverse_backfill),
        # Step 4: Make FK required (non-nullable)
        migrations.AlterField(
            model_name='payment',
            name='store_location',
            field=models.ForeignKey(
                help_text='Denormalized from Order for fast location-based queries',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='payments',
                to='settings.storelocation'
            ),
        ),
    ]
