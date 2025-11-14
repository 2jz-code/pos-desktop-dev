"""
Management command to create approval policies for existing store locations.

This is useful for backfilling policies for locations that were created
before the approval system was added.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal
from settings.models import StoreLocation
from approvals.models import ApprovalPolicy


class Command(BaseCommand):
    help = 'Create approval policies for all store locations that don\'t have one'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without actually creating anything',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        # Get all store locations
        locations = StoreLocation.objects.all()
        total_locations = locations.count()

        self.stdout.write(f'Found {total_locations} store locations')

        created_count = 0
        existing_count = 0

        for location in locations:
            # Check if policy already exists
            existing_policy = ApprovalPolicy.objects.filter(
                tenant=location.tenant,
                store_location=location
            ).first()

            if existing_policy:
                existing_count += 1
                self.stdout.write(
                    f'  ✓ Location "{location.name}" already has a policy'
                )
            else:
                if not dry_run:
                    with transaction.atomic():
                        policy = ApprovalPolicy.objects.create(
                            tenant=location.tenant,
                            store_location=location,
                            max_discount_percent=Decimal('15.00'),
                            max_refund_amount=Decimal('50.00'),
                            max_price_override_amount=Decimal('50.00'),
                            max_void_order_amount=Decimal('100.00'),
                            approval_expiry_minutes=30,
                            allow_self_approval=False,
                            purge_after_days=90,
                        )
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'  ✓ Created policy for location "{location.name}" (ID: {policy.id})'
                            )
                        )
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f'  → Would create policy for location "{location.name}"'
                        )
                    )
                created_count += 1

        # Summary
        self.stdout.write('\n' + '='*60)
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN SUMMARY:'))
            self.stdout.write(f'  Would create: {created_count} policies')
        else:
            self.stdout.write(self.style.SUCCESS('SUMMARY:'))
            self.stdout.write(self.style.SUCCESS(f'  Created: {created_count} policies'))
        self.stdout.write(f'  Already existed: {existing_count} policies')
        self.stdout.write(f'  Total locations: {total_locations}')
