from django.apps import AppConfig


class BusinessHoursConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'business_hours'
    verbose_name = 'Business Hours'
    
    def ready(self):
        """Import signals when app is ready"""
        try:
            import business_hours.signals
        except ImportError:
            pass
