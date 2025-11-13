"""
Management command to ensure system tenant exists.

This is an idempotent bootstrap command that should be run after migrations
in your deployment process (entrypoint.sh, CI/CD, etc.).

The system tenant is used for:
- Admin site access (admin.ajeen.com, localhost admin)
- API documentation endpoints
- System-level operations

Usage:
    python manage.py ensure_system_tenant
    python manage.py ensure_system_tenant --slug=custom-system
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from tenant.models import Tenant


class Command(BaseCommand):
    help = "Ensure system tenant exists (idempotent bootstrap command)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--slug",
            type=str,
            default=None,
            help="System tenant slug (defaults to SYSTEM_TENANT_SLUG setting)",
        )
        parser.add_argument(
            "--name",
            type=str,
            default="System",
            help="System tenant display name",
        )
        parser.add_argument(
            "--email",
            type=str,
            default="admin@example.com",
            help="System tenant contact email",
        )

    def handle(self, *args, **options):
        # Get slug from argument or setting
        slug = options["slug"] or getattr(settings, "SYSTEM_TENANT_SLUG", "system")
        name = options["name"]
        email = options["email"]

        # Create or get system tenant (idempotent)
        tenant, created = Tenant.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "business_name": "System Administration",
                "contact_email": email,
                "is_active": True,
            },
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Created system tenant: {tenant.slug} ({tenant.id})"
                )
            )
            self.stdout.write(
                self.style.WARNING(
                    f"  Make sure SYSTEM_TENANT_SLUG={tenant.slug} is set in your environment"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f"✓ System tenant already exists: {tenant.slug}")
            )

        # Show tenant info
        self.stdout.write(f"  ID: {tenant.id}")
        self.stdout.write(f"  Slug: {tenant.slug}")
        self.stdout.write(f"  Name: {tenant.name}")
        self.stdout.write(f"  Active: {tenant.is_active}")

        # Also ensure DEFAULT_TENANT_SLUG exists if it's different from SYSTEM_TENANT_SLUG
        default_slug = getattr(settings, "DEFAULT_TENANT_SLUG", None)
        if default_slug and default_slug != slug:
            self.stdout.write("")
            self.stdout.write("Checking DEFAULT_TENANT_SLUG...")
            default_tenant, default_created = Tenant.objects.get_or_create(
                slug=default_slug,
                defaults={
                    "name": "Development",
                    "business_name": "Local Development",
                    "contact_email": email,
                    "is_active": True,
                },
            )

            if default_created:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Created default tenant: {default_tenant.slug} ({default_tenant.id})"
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(f"✓ Default tenant already exists: {default_tenant.slug}")
                )
