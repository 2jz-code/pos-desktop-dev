from django.apps import AppConfig


class DiscountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "discounts"

    def ready(self):
        # Import signals when the app is ready.
        import discounts.signals  # noqa: F401
        # Note: Approval handlers are now registered in approvals/apps.py
