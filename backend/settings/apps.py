from django.apps import AppConfig


class SettingsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "settings"

    def ready(self):
        """
        Import signals when the app is ready to ensure they are registered.
        """
        import settings.signals
