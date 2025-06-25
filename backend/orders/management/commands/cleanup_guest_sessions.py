from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
from orders.models import Order
from payments.models import Payment


class Command(BaseCommand):
    help = "Clean up old guest sessions and orders"

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=7,
            help="Delete guest data older than this many days (default: 7)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without actually deleting",
        )

    def handle(self, *args, **options):
        days = options["days"]
        dry_run = options["dry_run"]
        cutoff_date = timezone.now() - timedelta(days=days)

        self.stdout.write(
            self.style.SUCCESS(
                f"Cleaning up guest data older than {days} days "
                f'(before {cutoff_date.strftime("%Y-%m-%d %H:%M:%S")})'
            )
        )

        # Find old guest orders that are not completed
        old_guest_orders = Order.objects.filter(
            guest_id__isnull=False,
            customer__isnull=True,
            created_at__lt=cutoff_date,
            status__in=[Order.OrderStatus.PENDING, Order.OrderStatus.CANCELLED],
        )

        order_count = old_guest_orders.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN: Would delete {order_count} old guest orders"
                )
            )
            if order_count > 0:
                self.stdout.write("Orders that would be deleted:")
                for order in old_guest_orders[:10]:  # Show first 10
                    self.stdout.write(
                        f"  - Order {order.order_number or order.id} "
                        f"({order.status}) from {order.created_at}"
                    )
                if order_count > 10:
                    self.stdout.write(f"  ... and {order_count - 10} more")
        else:
            with transaction.atomic():
                # Delete the orders (this will cascade to order items and payments)
                deleted_count, deleted_details = old_guest_orders.delete()

                self.stdout.write(
                    self.style.SUCCESS(
                        f"Successfully deleted {order_count} old guest orders"
                    )
                )

                if deleted_details:
                    self.stdout.write("Deleted objects:")
                    for model, count in deleted_details.items():
                        if count > 0:
                            self.stdout.write(f"  - {model}: {count}")

        # Also clean up old Django sessions
        from django.contrib.sessions.models import Session

        old_sessions = Session.objects.filter(expire_date__lt=timezone.now())
        session_count = old_sessions.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN: Would delete {session_count} expired sessions"
                )
            )
        else:
            if session_count > 0:
                old_sessions.delete()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Successfully deleted {session_count} expired sessions"
                    )
                )
            else:
                self.stdout.write("No expired sessions to delete")

        self.stdout.write(self.style.SUCCESS("Cleanup completed!"))
