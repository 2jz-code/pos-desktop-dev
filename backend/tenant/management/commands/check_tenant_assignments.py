"""
Management command to check tenant assignments across all models.
"""
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Check tenant assignments across all models'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n📊 Tenant Assignment Report\n'))

        with connection.cursor() as cursor:
            # List all tenants
            cursor.execute("SELECT id, slug, name, is_active FROM tenants ORDER BY name")
            tenants = cursor.fetchall()

            self.stdout.write('Available Tenants:')
            for tenant in tenants:
                active = '✓' if tenant[3] else '✗'
                self.stdout.write(f'  {active} {tenant[1]} - {tenant[2]} (ID: {str(tenant[0])[:8]}...)')

            self.stdout.write('\n')

            # Check each table for NULL tenant_id
            tables_with_tenant = [
                'users_user',
                'products_category',
                'products_tax',
                'products_producttype',
                'products_product',
                'products_modifierset',
                'products_modifieroption',
                'products_productspecificoption',
                'products_productmodifierset',
                'discounts_discount',
                'inventory_location',
                'inventory_inventorystock',
                'inventory_recipe',
                'inventory_recipeitem',
                'inventory_stockhistoryentry',
                'orders_order',
                'orders_orderitem',
                'orders_orderdiscount',
                'orders_orderitemmodifier',
                'payments_payment',
                'payments_paymenttransaction',
                'payments_giftcard',
                'reports_reportcache',
                'reports_savedreport',
                'reports_reporttemplate',
                'reports_reportexecution',
                'settings_globalsettings',
                'settings_printerconfiguration',
                'settings_webordersettings',
                'settings_storelocation',
                'settings_terminallocation',
                'settings_terminalregistration',
                'settings_stockactionreasonconfig',
            ]

            has_issues = False
            total_records = 0
            null_records = 0

            self.stdout.write('Checking tables for NULL tenant_id:\n')

            for table in tables_with_tenant:
                try:
                    # Count total records
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    total = cursor.fetchone()[0]
                    total_records += total

                    # Count NULL tenant_id
                    cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE tenant_id IS NULL")
                    nulls = cursor.fetchone()[0]
                    null_records += nulls

                    if nulls > 0:
                        has_issues = True
                        self.stdout.write(self.style.ERROR(
                            f'  ❌ {table}: {nulls} records with NULL tenant_id (out of {total})'
                        ))
                    elif total > 0:
                        self.stdout.write(self.style.SUCCESS(
                            f'  ✓ {table}: All {total} records have tenant assigned'
                        ))
                except Exception as e:
                    self.stdout.write(f'  ⚠ {table}: {str(e)[:50]}')

            self.stdout.write('\n' + '='*60)
            if has_issues:
                self.stdout.write(self.style.ERROR(
                    f'\n⚠️  Found {null_records} records with NULL tenant_id!'
                ))
                self.stdout.write('\nRun this command to fix:')
                self.stdout.write('  python manage.py assign_tenants_to_data\n')
            else:
                self.stdout.write(self.style.SUCCESS(
                    f'\n✅ All {total_records} records have tenant assigned!\n'
                ))
