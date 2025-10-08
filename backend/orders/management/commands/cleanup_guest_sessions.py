from django.core.management.base import BaseCommand
from orders.services import GuestSessionService


class Command(BaseCommand):
    help = "Clean up old guest sessions and orders (processes all tenants)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be cleaned up without making changes",
        )

    def handle(self, *args, **options):
        from tenant.models import Tenant
        from tenant.managers import set_current_tenant

        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE - No changes will be made")
            )

        total_cleaned = 0
        tenants_processed = 0

        try:
            # Process each tenant separately
            for tenant in Tenant.objects.filter(is_active=True):
                try:
                    # Set tenant context
                    set_current_tenant(tenant)

                    if not dry_run:
                        count = GuestSessionService.cleanup_completed_guest_orders()
                        if count > 0:
                            self.stdout.write(f"Tenant {tenant.slug}: Cleaned up {count} guest orders")
                        total_cleaned += count
                    else:
                        # For dry run, just count what would be cleaned
                        from datetime import datetime, timedelta
                        from orders.models import Order

                        cutoff_time = datetime.now() - timedelta(hours=24)
                        count = Order.objects.filter(
                            guest_id__isnull=False,
                            status=Order.OrderStatus.PENDING,
                            created_at__lt=cutoff_time,
                        ).count()

                        if count > 0:
                            self.stdout.write(f"Tenant {tenant.slug}: Would clean up {count} guest orders")
                        total_cleaned += count

                    tenants_processed += 1

                except Exception as tenant_exc:
                    self.stdout.write(
                        self.style.ERROR(f"Error processing tenant {tenant.slug}: {str(tenant_exc)}")
                    )
                    continue
                finally:
                    # Clear tenant context after each tenant
                    set_current_tenant(None)

            # Summary
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f"DRY RUN: Would clean up {total_cleaned} guest orders across {tenants_processed} tenants"
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Successfully cleaned up {total_cleaned} guest orders across {tenants_processed} tenants"
                    )
                )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error during cleanup: {str(e)}"))
