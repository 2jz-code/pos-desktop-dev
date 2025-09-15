from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/kds/(?P<zone_id>[^/]+)/$', consumers.KDSConsumer.as_asgi()),
]