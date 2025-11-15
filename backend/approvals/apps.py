from django.apps import AppConfig


class ApprovalsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'approvals'

    def ready(self):
        """Import signal handlers when app is ready"""
        import approvals.signals  # noqa
        import approvals.handlers  # noqa - Register approval signal handlers
