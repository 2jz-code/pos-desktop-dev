from django.core.management.base import BaseCommand, CommandError
from django.core.cache import cache


def norm(s: str) -> str:
    return (s or "").strip().lower()


class Command(BaseCommand):
    help = (
        "Clear account-based login locks and failure counters for admin logins.\n"
        "Covers both Django admin (/admin/login/) and web admin API (/api/users/login/web/).\n"
        "Usage: python manage.py clear_admin_locks --email user@example.com [--scope django|web|both]"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            dest="email",
            required=True,
            help="Email/username identifier for the account (case-insensitive)",
        )
        parser.add_argument(
            "--scope",
            dest="scope",
            choices=["django", "web", "both"],
            default="both",
            help="Which lock set to clear: Django admin, web admin API, or both",
        )

    def handle(self, *args, **options):
        email = norm(options["email"])
        scope = options["scope"]
        if not email:
            raise CommandError("--email is required")

        cleared_keys = []

        def delete_keys(prefix_fail: str, prefix_lock: str):
            fk = f"{prefix_fail}:{email}"
            lk = f"{prefix_lock}:{email}"
            cache.delete_many([fk, lk])
            cleared_keys.extend([fk, lk])

        if scope in ("django", "both"):
            delete_keys("admin_login_fail", "admin_login_lock")
        if scope in ("web", "both"):
            delete_keys("web_login_fail", "web_login_lock")

        self.stdout.write(self.style.SUCCESS("Cleared keys:"))
        for k in cleared_keys:
            self.stdout.write(f" - {k}")

