"""
Management command to migrate customer users to the customers model.

This command provides more control and detailed reporting compared to the 
Django migration, and can be run manually when needed.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.core.exceptions import ValidationError
from users.models import User
from customers.models import Customer
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Migrate users with is_pos_staff=False (customers) to the customers model'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without making changes',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Skip confirmation prompts',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            help='Process records in batches (default: 100)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']
        batch_size = options['batch_size']

        # Find all customer users (non-POS staff)
        customer_users = User.objects.filter(is_pos_staff=False)
        total_users = customer_users.count()

        self.stdout.write(f"Found {total_users} customer users to migrate")

        if total_users == 0:
            self.stdout.write(self.style.SUCCESS("No customer users found to migrate."))
            return

        # Show sample of users to be migrated
        self.stdout.write("\nSample users to migrate:")
        for user in customer_users[:5]:
            status = "ACTIVE" if user.is_active else "INACTIVE"
            self.stdout.write(f"  - {user.email} ({user.first_name} {user.last_name}) [{status}]")
        if total_users > 5:
            self.stdout.write(f"  ... and {total_users - 5} more")

        # Check for potential conflicts
        existing_customers = Customer.objects.filter(
            legacy_id__in=customer_users.values_list('id', flat=True)
        ).count()
        
        email_conflicts = Customer.objects.filter(
            email__in=customer_users.values_list('email', flat=True)
        ).count()

        if existing_customers > 0:
            self.stdout.write(
                self.style.WARNING(f"Found {existing_customers} users already migrated")
            )

        if email_conflicts > 0:
            self.stdout.write(
                self.style.ERROR(f"Found {email_conflicts} email conflicts in customers table")
            )

        # Confirmation
        if not dry_run and not force:
            confirm = input(f"\nMigrate {total_users} users to customers model? [y/N]: ")
            if confirm.lower() != 'y':
                self.stdout.write("Migration cancelled.")
                return

        if dry_run:
            self.stdout.write(self.style.WARNING("\n=== DRY RUN MODE - NO CHANGES WILL BE MADE ==="))

        # Perform migration
        migrated_count = 0
        errors_count = 0
        skipped_count = 0

        # Process in batches
        for i in range(0, total_users, batch_size):
            batch_users = customer_users[i:i + batch_size]
            self.stdout.write(f"\nProcessing batch {i//batch_size + 1} ({len(batch_users)} users)...")

            for user in batch_users:
                try:
                    # Check if customer already exists
                    existing_customer = Customer.objects.filter(legacy_id=user.id).first()
                    if existing_customer:
                        self.stdout.write(f"  SKIP: Customer already exists for {user.email}")
                        skipped_count += 1
                        continue

                    # Check for email conflicts
                    if Customer.objects.filter(email=user.email).exists():
                        self.stdout.write(
                            self.style.ERROR(f"  ERROR: Email {user.email} already exists in customers")
                        )
                        errors_count += 1
                        continue

                    if not dry_run:
                        # Create customer record
                        with transaction.atomic():
                            customer = Customer.objects.create(
                                email=user.email,
                                password=user.password,  # Already hashed
                                first_name=user.first_name or '',
                                last_name=user.last_name or '',
                                phone_number=user.phone_number or '',
                                is_active=user.is_active,
                                date_joined=user.date_joined,
                                legacy_id=user.id,
                                # Customer defaults
                                email_verified=False,
                                phone_verified=False,
                                marketing_opt_in=False,
                                newsletter_subscribed=False,
                                preferred_contact_method='email',
                            )
                            # Copy updated_at manually after creation
                            Customer.objects.filter(id=customer.id).update(
                                updated_at=user.updated_at
                            )

                    self.stdout.write(f"  OK: Migrated {user.email}")
                    migrated_count += 1

                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"  ERROR: Failed to migrate {user.email}: {str(e)}")
                    )
                    errors_count += 1
                    continue

        # Summary
        self.stdout.write("\n" + "="*50)
        self.stdout.write("MIGRATION SUMMARY:")
        self.stdout.write(f"  Total users found: {total_users}")
        self.stdout.write(f"  Successfully migrated: {migrated_count}")
        self.stdout.write(f"  Skipped (already exist): {skipped_count}")
        self.stdout.write(f"  Errors: {errors_count}")

        if dry_run:
            self.stdout.write("\nThis was a dry run. No changes were made.")
        else:
            if errors_count == 0:
                self.stdout.write(self.style.SUCCESS(f"\nMigration completed successfully!"))
            else:
                self.stdout.write(
                    self.style.WARNING(f"\nMigration completed with {errors_count} errors.")
                )

        # Additional recommendations
        if migrated_count > 0:
            self.stdout.write("\nRECOMMENDATIONS:")
            self.stdout.write("1. Run tests to verify customer functionality")
            self.stdout.write("2. Update any order relationships if needed")
            self.stdout.write("3. Notify customers about password reset if needed")
            self.stdout.write("4. Consider archiving old user records after verification")