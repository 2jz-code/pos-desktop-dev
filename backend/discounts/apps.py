from django.apps import AppConfig


class DiscountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "discounts"

    def ready(self):
        # Import signals when the app is ready.
        import discounts.signals
        # Import approval handlers to register signal receivers
        import discounts.approval_handlers
