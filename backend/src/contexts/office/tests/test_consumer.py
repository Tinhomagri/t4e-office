"""Testes do OfficeConsumer WebSocket."""
import json

import pytest
from channels.testing import WebsocketCommunicator
from django.test import override_settings
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application
from contexts.identity.infrastructure.django.models import UserModel

CHANNEL_LAYERS_TEST = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
}


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="ws@t4e.com", full_name="WS Dev", password="senha123"
    )


@pytest.fixture
def token(user):
    return str(AccessToken.for_user(user))


@pytest.mark.django_db(transaction=True)
@override_settings(CHANNEL_LAYERS=CHANNEL_LAYERS_TEST)
async def test_connect_with_valid_token_sends_state_sync(user, token):
    communicator = WebsocketCommunicator(application, f"/ws/office/?token={token}")
    connected, _ = await communicator.connect()
    assert connected

    msg = json.loads(await communicator.receive_from())
    assert msg["type"] == "state_sync"
    assert isinstance(msg["users"], list)

    await communicator.disconnect()


@pytest.mark.django_db(transaction=True)
@override_settings(CHANNEL_LAYERS=CHANNEL_LAYERS_TEST)
async def test_connect_without_token_rejects():
    communicator = WebsocketCommunicator(application, "/ws/office/")
    connected, code = await communicator.connect()
    assert not connected


@pytest.mark.django_db(transaction=True)
@override_settings(CHANNEL_LAYERS=CHANNEL_LAYERS_TEST)
async def test_move_broadcasts_to_group(user, token):
    c1 = WebsocketCommunicator(application, f"/ws/office/?token={token}")
    connected, _ = await c1.connect()
    assert connected
    await c1.receive_from()  # consume state_sync
    await c1.receive_from()  # consume user_join broadcast (self)

    await c1.send_to(text_data=json.dumps({"type": "move", "x": 100, "y": 200, "dir": "down"}))
    msg = json.loads(await c1.receive_from())
    assert msg["type"] == "move"
    assert msg["x"] == 100
    assert msg["user_id"] == str(user.id)

    await c1.disconnect()
