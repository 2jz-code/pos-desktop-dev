from django.apps import AppConfig


class OrdersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "orders"

    def ready(self):
        # Implicitly connect signal handlers decorated with @receiver.
        # This is where we will import signals later.
        pass
