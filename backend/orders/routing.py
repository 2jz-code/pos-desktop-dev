from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/cart/(?P<order_id>[\w-]+)/$", consumers.OrderConsumer.as_asgi()),
]
