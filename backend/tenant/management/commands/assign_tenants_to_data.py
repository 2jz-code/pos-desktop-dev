"""
Management command to assign default tenant to all existing data.

This manually runs the logic from tenant.0002 and tenant.0003 migrations.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.conf import settings


class Command(BaseCommand):
    help = 'Assign default tenant to all existing data'

    def handle(self, *args, **options):
        from tenant.models import Tenant
        from users.models import User
        from products.models import Category, Tax, ProductType, Product, ModifierSet, ModifierOption, ProductSpecificOption, ProductModifierSet
        from discounts.models import Discount
        from inventory.models import Location, InventoryStock, Recipe, RecipeItem, StockHistoryEntry
        from orders.models import Order, OrderItem, OrderDiscount, OrderItemModifier
        from payments.models import Payment, PaymentTransaction, GiftCard
        from reports.models import ReportCache, SavedReport, ReportTemplate, ReportExecution
        from settings.models import GlobalSettings, PrinterConfiguration, WebOrderSettings, StoreLocation, TerminalLocation, TerminalRegistration, StockActionReasonConfig

        # Get default tenant slug from settings
        default_tenant_slug = getattr(settings, 'DEFAULT_TENANT_SLUG', 'myrestaurant')

        try:
            default_tenant = Tenant.objects.get(slug=default_tenant_slug)
        except Tenant.DoesNotExist:
            self.stdout.write(self.style.ERROR(
                f"Default tenant '{default_tenant_slug}' not found. "
                f"Available tenants: {', '.join(Tenant.objects.values_list('slug', flat=True))}"
            ))
            return

        self.stdout.write(f"\n🔄 Assigning existing data to tenant: {default_tenant.name} ({default_tenant.slug})")
        self.stdout.write(f"   Tenant ID: {default_tenant.id}\n")

        total_updated = 0
        updates_by_model = {}

        # Define all models that need tenant assignment
        models_to_update = [
            # users app (1 model)
            ('users', User),

            # products app (8 models)
            ('products', Category),
            ('products', Tax),
            ('products', ProductType),
            ('products', Product),
            ('products', ModifierSet),
            ('products', ModifierOption),
            ('products', ProductSpecificOption),
            ('products', ProductModifierSet),

            # discounts app (1 model)
            ('discounts', Discount),

            # inventory app (5 models)
            ('inventory', Location),
            ('inventory', InventoryStock),
            ('inventory', Recipe),
            ('inventory', RecipeItem),
            ('inventory', StockHistoryEntry),

            # orders app (4 models)
            ('orders', Order),
            ('orders', OrderItem),
            ('orders', OrderDiscount),
            ('orders', OrderItemModifier),

            # payments app (3 models)
            ('payments', Payment),
            ('payments', PaymentTransaction),
            ('payments', GiftCard),

            # reports app (4 models)
            ('reports', ReportCache),
            ('reports', SavedReport),
            ('reports', ReportTemplate),
            ('reports', ReportExecution),

            # settings app (7 models)
            ('settings', GlobalSettings),
            ('settings', PrinterConfiguration),
            ('settings', WebOrderSettings),
            ('settings', StoreLocation),
            ('settings', TerminalLocation),
            ('settings', TerminalRegistration),
            ('settings', StockActionReasonConfig),
        ]

        # Process each model
        for app_label, Model in models_to_update:
            model_name = Model.__name__

            try:
                # Special handling for User model to deal with duplicate usernames
                if app_label == 'users' and model_name == 'User':
                    # Get users without tenant
                    users_without_tenant = Model.objects.filter(tenant__isnull=True)

                    # Update them one by one to handle constraint violations
                    updated_count = 0
                    skipped_count = 0

                    for user in users_without_tenant:
                        try:
                            # Use savepoint to isolate this update
                            with transaction.atomic():
                                Model.objects.filter(pk=user.pk, tenant__isnull=True).update(tenant=default_tenant)
                                updated_count += 1
                        except Exception as e:
                            # Skip users that would violate constraints (likely duplicates)
                            skipped_count += 1
                            self.stdout.write(f"      ⚠ Skipped user {user.email} (username: {user.username}): {str(e)[:50]}")

                    if updated_count > 0:
                        updates_by_model[f"{app_label}.{model_name}"] = updated_count
                        total_updated += updated_count
                        self.stdout.write(f"   ✓ {app_label}.{model_name}: {updated_count} records")
                        if skipped_count > 0:
                            self.stdout.write(f"      (skipped {skipped_count} duplicates)")
                else:
                    # For all other models, use bulk update (with error handling)
                    try:
                        updated_count = Model.objects.filter(tenant__isnull=True).update(tenant=default_tenant)

                        if updated_count > 0:
                            updates_by_model[f"{app_label}.{model_name}"] = updated_count
                            total_updated += updated_count
                            self.stdout.write(f"   ✓ {app_label}.{model_name}: {updated_count} records")
                    except Exception as e:
                        # If bulk update fails (e.g., duplicate constraints), process one by one
                        self.stdout.write(f"   ⚠ {app_label}.{model_name}: Bulk update failed, trying one-by-one...")

                        records_without_tenant = Model.objects.filter(tenant__isnull=True)
                        updated_count = 0
                        skipped_count = 0

                        for record in records_without_tenant:
                            try:
                                with transaction.atomic():
                                    Model.objects.filter(pk=record.pk, tenant__isnull=True).update(tenant=default_tenant)
                                    updated_count += 1
                            except Exception:
                                skipped_count += 1

                        if updated_count > 0:
                            updates_by_model[f"{app_label}.{model_name}"] = updated_count
                            total_updated += updated_count
                            self.stdout.write(f"   ✓ {app_label}.{model_name}: {updated_count} records")
                            if skipped_count > 0:
                                self.stdout.write(f"      (skipped {skipped_count} duplicates)")

            except Exception as e:
                self.stdout.write(self.style.WARNING(
                    f"   ⚠ {app_label}.{model_name}: Error - {str(e)[:100]}"
                ))
                continue

        # Print summary
        self.stdout.write(self.style.SUCCESS(f"\n✅ Data assignment complete!"))
        self.stdout.write(f"   Total records updated: {total_updated}")
        self.stdout.write(f"   Models processed: {len(updates_by_model)}/{len(models_to_update)}")

        if total_updated == 0:
            self.stdout.write(f"\n   ℹ️  No records needed updating (all records already have tenant assigned)")
