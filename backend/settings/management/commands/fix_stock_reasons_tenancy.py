"""
Management command to fix system stock reasons to be global (tenant=NULL).

System reasons should be shared across all tenants, but may have been
incorrectly created with a specific tenant assignment.

Usage:
    python manage.py fix_stock_reasons_tenancy
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from settings.models import StockActionReasonConfig


class Command(BaseCommand):
    help = 'Fix system stock reasons to be global (tenant=NULL) across all tenants'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('=' * 70))
        self.stdout.write(self.style.WARNING('Fixing System Stock Reasons Tenancy'))
        self.stdout.write(self.style.WARNING('=' * 70))
        self.stdout.write('')

        # Find all system reasons that have a tenant assigned
        system_reasons_with_tenant = StockActionReasonConfig.all_objects.filter(
            is_system_reason=True
        ).exclude(tenant__isnull=True)

        count = system_reasons_with_tenant.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS('✓ No fixes needed - all system reasons are already global'))
            self.stdout.write('')
            self.stdout.write(self.style.WARNING('=' * 70))
            return

        self.stdout.write(f'Found {count} system reason(s) with tenant assigned')
        self.stdout.write('')
        self.stdout.write('The following reasons will be updated to tenant=NULL:')

        for reason in system_reasons_with_tenant:
            self.stdout.write(f'  • {reason.name} (current tenant: {reason.tenant})')

        self.stdout.write('')

        # Fix the tenancy
        with transaction.atomic():
            updated = 0
            for reason in system_reasons_with_tenant:
                reason.tenant = None
                reason.save(update_fields=['tenant'])
                updated += 1

            self.stdout.write(self.style.SUCCESS(f'✓ Successfully updated {updated} system reason(s) to be global'))

        # Verify the fix
        remaining = StockActionReasonConfig.all_objects.filter(
            is_system_reason=True
        ).exclude(tenant__isnull=True).count()

        self.stdout.write('')
        if remaining == 0:
            self.stdout.write(self.style.SUCCESS('✓ Verification passed: All system reasons are now global'))
        else:
            self.stdout.write(self.style.ERROR(f'✗ Warning: {remaining} system reason(s) still have tenant assigned'))

        self.stdout.write('')
        self.stdout.write(self.style.WARNING('=' * 70))
        self.stdout.write('')

        # Summary
        total_system = StockActionReasonConfig.all_objects.filter(is_system_reason=True).count()
        self.stdout.write(f'Total system reasons in database: {total_system}')
        self.stdout.write('These reasons are now available to all tenants.')
