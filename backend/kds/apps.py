from django.apps import AppConfig


class KdsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'kds'

    def ready(self):
        import kds.signals
