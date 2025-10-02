"""
Management command to fix inconsistent migration state.

This command manually inserts the tenant data migration records into django_migrations
to resolve the inconsistent migration history error.
"""
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Fix inconsistent migration state by fake-applying tenant data migrations'

    def handle(self, *args, **options):
        self.stdout.write('Fixing migration state...\n')

        with connection.cursor() as cursor:
            # Check if migrations are already applied
            cursor.execute(
                "SELECT id, app, name, applied FROM django_migrations "
                "WHERE app = 'tenant' ORDER BY id"
            )
            existing = cursor.fetchall()

            self.stdout.write('Current tenant migrations in database:')
            for row in existing:
                self.stdout.write(f'  {row[1]}.{row[2]} (applied: {row[3]})')

            # Insert tenant.0002 if not exists
            cursor.execute(
                "SELECT COUNT(*) FROM django_migrations "
                "WHERE app = 'tenant' AND name = '0002_assign_existing_data_to_default_tenant'"
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO django_migrations (app, name, applied) "
                    "VALUES ('tenant', '0002_assign_existing_data_to_default_tenant', NOW())"
                )
                self.stdout.write(self.style.SUCCESS('✓ Added tenant.0002_assign_existing_data_to_default_tenant'))
            else:
                self.stdout.write('  tenant.0002 already exists')

            # Insert tenant.0003 if not exists
            cursor.execute(
                "SELECT COUNT(*) FROM django_migrations "
                "WHERE app = 'tenant' AND name = '0003_fix_remaining_null_tenants'"
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO django_migrations (app, name, applied) "
                    "VALUES ('tenant', '0003_fix_remaining_null_tenants', NOW())"
                )
                self.stdout.write(self.style.SUCCESS('✓ Added tenant.0003_fix_remaining_null_tenants'))
            else:
                self.stdout.write('  tenant.0003 already exists')

        self.stdout.write(self.style.SUCCESS('\n✅ Migration state fixed!'))
        self.stdout.write('You can now run: python manage.py migrate')
