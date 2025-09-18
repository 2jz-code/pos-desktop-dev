from django.apps import AppConfig


class KdsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'kds'

    def ready(self):
        # Import the new event handlers
        import kds.events.handlers
        # Note: Old signals are disabled to avoid conflicts
