from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "inventory"
    
    def ready(self):
        """Import signal handlers when the app is ready"""
        import inventory.signals
