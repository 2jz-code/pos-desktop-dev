from django.apps import AppConfig


class KdsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'kds'

    def ready(self):
        # Import the new event handlers
        import kds.events.handlers
        # Keep backward compatibility with old signals for now
        try:
            import kds.signals
        except ImportError:
            pass
