import os
import django
from zoneinfo import ZoneInfo

# Set the Django settings module first
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core_backend.settings")

# Setup Django explicitly before any models are imported
django.setup()

# Now import Django-related modules
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.core.asgi import get_asgi_application

import orders.routing
import notifications.routing

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core_backend.settings")

# Initialize Django ASGI application early to ensure AppRegistry is populated
# before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

# Combine WebSocket URL patterns from all apps
websocket_urlpatterns = (
    orders.routing.websocket_urlpatterns + notifications.routing.websocket_urlpatterns
)

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    }
)
