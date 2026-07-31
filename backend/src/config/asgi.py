"""Entrypoint ASGI.

Roda sob Daphne (channels em INSTALLED_APPS). Não há consumidores WebSocket
registrados hoje — quando Presença/Poker ganharem um, o ProtocolTypeRouter
entra aqui com o URLRouter deles.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
application = get_asgi_application()
