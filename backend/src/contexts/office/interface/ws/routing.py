"""URL routing para WebSockets do contexto Office."""
from django.urls import re_path

from .consumer import OfficeConsumer

websocket_urlpatterns = [
    re_path(r"^ws/office/$", OfficeConsumer.as_asgi()),
]
