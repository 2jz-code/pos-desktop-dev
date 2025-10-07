# Assign customers app data to default tenant
# This migration was created after 0002 and 0003 were already applied

from django.db import migrations
from django.conf import settings


def assign_customers_to_default_tenant(apps, schema_editor):
    """
    Assign all existing customers app data (where tenant is NULL) to the default tenant.

    This handles the customers app which was added to tenant isolation after
    migrations 0002 and 0003 were already applied.
    """
    Tenant = apps.get_model('tenant', 'Tenant')

    # Get default tenant slug from settings
    default_tenant_slug = getattr(settings, 'DEFAULT_TENANT_SLUG', 'myrestaurant')

    try:
        default_tenant = Tenant.objects.get(slug=default_tenant_slug)
        print(f"\n✓ Using default tenant: {default_tenant.name} ({default_tenant.slug})")
    except Tenant.DoesNotExist:
        print(f"\n⚠️  Default tenant '{default_tenant_slug}' not found. Skipping customers migration.")
        return

    print(f"\n🔄 Assigning customers data to tenant: {default_tenant.name}")
    print(f"   Tenant ID: {default_tenant.id}\n")

    # Track statistics
    total_updated = 0
    updates_by_model = {}

    # Customers app models (4 models)
    models_to_update = [
        ('customers', 'Customer'),
        ('customers', 'CustomerAddress'),
        ('customers', 'CustomerPasswordResetToken'),
        ('customers', 'CustomerEmailVerificationToken'),
    ]

    # Process each model
    for app_label, model_name in models_to_update:
        try:
            Model = apps.get_model(app_label, model_name)

            # Update all records with NULL tenant
            updated_count = Model.objects.filter(tenant__isnull=True).update(tenant=default_tenant)

            if updated_count > 0:
                updates_by_model[f"{app_label}.{model_name}"] = updated_count
                total_updated += updated_count
                print(f"   ✓ {app_label}.{model_name}: {updated_count} records")

        except LookupError:
            # Model doesn't exist yet (might be in a different migration state)
            print(f"   ⚠ {app_label}.{model_name}: Model not found (skipping)")
            continue

    # Print summary
    print(f"\n✅ Customers migration complete!")
    print(f"   Total records updated: {total_updated}")
    print(f"   Models processed: {len(updates_by_model)}/{len(models_to_update)}")

    if total_updated == 0:
        print(f"\n   ℹ️  No records needed updating (all records already have tenant assigned)")


def reverse_migration(apps, schema_editor):
    """
    Reverse the migration by setting tenant to NULL for customers records.

    WARNING: This will orphan all data! Only use in development.
    """
    Tenant = apps.get_model('tenant', 'Tenant')

    default_tenant_slug = getattr(settings, 'DEFAULT_TENANT_SLUG', 'myrestaurant')

    try:
        default_tenant = Tenant.objects.get(slug=default_tenant_slug)
    except Tenant.DoesNotExist:
        print(f"⚠️  Default tenant '{default_tenant_slug}' not found. Nothing to reverse.")
        return

    print(f"\n⚠️  REVERSING: Setting tenant to NULL for customers records")

    total_reversed = 0

    models_to_update = [
        ('customers', 'Customer'),
        ('customers', 'CustomerAddress'),
        ('customers', 'CustomerPasswordResetToken'),
        ('customers', 'CustomerEmailVerificationToken'),
    ]

    for app_label, model_name in models_to_update:
        try:
            Model = apps.get_model(app_label, model_name)
            reversed_count = Model.objects.filter(tenant=default_tenant).update(tenant=None)

            if reversed_count > 0:
                total_reversed += reversed_count
                print(f"   ✓ {app_label}.{model_name}: {reversed_count} records")

        except LookupError:
            continue

    print(f"\n✅ Reverse complete!")
    print(f"   Total records orphaned: {total_reversed}")


class Migration(migrations.Migration):

    dependencies = [
        ('tenant', '0004_assign_business_hours_to_default_tenant'),
        ('customers', '0003_add_tenant_nullable'),  # Ensure customers tenant FK exists
    ]

    operations = [
        migrations.RunPython(
            assign_customers_to_default_tenant,
            reverse_code=reverse_migration,
        ),
    ]
