from django.core.management.base import BaseCommand
from orders.services import GuestSessionService


class Command(BaseCommand):
    help = "Clean up old guest sessions and orders"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be cleaned up without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE - No changes will be made")
            )

        try:
            if not dry_run:
                count = GuestSessionService.cleanup_completed_guest_orders()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Successfully cleaned up {count} old guest orders"
                    )
                )
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

                self.stdout.write(
                    self.style.WARNING(f"Would clean up {count} old guest orders")
                )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error during cleanup: {str(e)}"))
