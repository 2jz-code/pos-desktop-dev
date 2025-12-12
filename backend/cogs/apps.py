from django.apps import AppConfig


class CogsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cogs'
    verbose_name = 'Cost of Goods Sold'

    def ready(self):
        import cogs.signals  # noqa: F401
