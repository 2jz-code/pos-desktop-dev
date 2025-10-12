# Manual fix for any remaining NULL tenant values

from django.db import migrations
from django.conf import settings
from django.core.exceptions import FieldError


def fix_null_tenants(apps, schema_editor):
    """Assign default tenant to any records that still have NULL tenant."""
    Tenant = apps.get_model('tenant', 'Tenant')

    default_tenant_slug = getattr(settings, 'DEFAULT_TENANT_SLUG', 'myrestaurant')

    try:
        default_tenant = Tenant.objects.get(slug=default_tenant_slug)
    except Tenant.DoesNotExist:
        print(f"⚠️  Default tenant '{default_tenant_slug}' not found. Skipping.")
        return

    print(f"\n🔍 Checking for remaining NULL tenant values...")

    # List of all models with tenant FK
    models_to_check = [
        ('users', 'User'),
        ('products', 'Category'),
        ('products', 'Tax'),
        ('products', 'ProductType'),
        ('products', 'Product'),
        ('products', 'ModifierSet'),
        ('products', 'ModifierOption'),
        ('products', 'ProductSpecificOption'),
        ('products', 'ProductModifierSet'),
        ('discounts', 'Discount'),
        ('inventory', 'Location'),
        ('inventory', 'InventoryStock'),
        ('inventory', 'Recipe'),
        ('inventory', 'RecipeItem'),
        ('inventory', 'StockHistoryEntry'),
        ('orders', 'Order'),
        ('orders', 'OrderItem'),
        ('orders', 'OrderDiscount'),
        ('orders', 'OrderItemModifier'),
        ('payments', 'Payment'),
        ('payments', 'PaymentTransaction'),
        ('payments', 'GiftCard'),
        ('reports', 'ReportCache'),
        ('reports', 'SavedReport'),
        ('reports', 'ReportTemplate'),
        ('reports', 'ReportExecution'),
        ('settings', 'GlobalSettings'),
        ('settings', 'PrinterConfiguration'),
        ('settings', 'WebOrderSettings'),
        ('settings', 'StoreLocation'),
        ('settings', 'TerminalLocation'),
        ('settings', 'TerminalRegistration'),
        ('settings', 'StockActionReasonConfig'),
        ('business_hours', 'BusinessHoursProfile'),
        ('business_hours', 'RegularHours'),
        ('business_hours', 'TimeSlot'),
        ('business_hours', 'SpecialHours'),
        ('business_hours', 'SpecialHoursTimeSlot'),
        ('business_hours', 'Holiday'),
        ('customers', 'Customer'),
        ('customers', 'CustomerAddress'),
        ('customers', 'CustomerPasswordResetToken'),
        ('customers', 'CustomerEmailVerificationToken'),
    ]

    total_fixed = 0

    for app_label, model_name in models_to_check:
        try:
            Model = apps.get_model(app_label, model_name)

            try:
                null_count = Model.objects.filter(tenant__isnull=True).count()
            except FieldError:
                # Model doesn't have tenant field yet (will be added in later migrations)
                print(f"   ⚠ {app_label}.{model_name}: No tenant field yet (skipping)")
                continue

            if null_count > 0:
                # Force assign to default tenant (ignoring duplicates)
                records = Model.objects.filter(tenant__isnull=True)
                for record in records:
                    try:
                        record.tenant = default_tenant
                        record.save(update_fields=['tenant'])
                        total_fixed += 1
                    except Exception as e:
                        # Skip records that cause constraint violations
                        print(f"      ⚠ Skipped {app_label}.{model_name} record {record.pk}: {str(e)[:80]}")

                print(f"   ✓ Fixed {app_label}.{model_name}: {null_count} records checked")

        except LookupError:
            continue

    if total_fixed == 0:
        print(f"   ✅ No NULL tenants found - all good!")
    else:
        print(f"\n✅ Fixed {total_fixed} records with NULL tenant")


class Migration(migrations.Migration):

    dependencies = [
        ('tenant', '0002_assign_existing_data_to_default_tenant'),
    ]

    operations = [
        migrations.RunPython(fix_null_tenants, reverse_code=migrations.RunPython.noop),
    ]
