"""Testes de constraint do modelo DeskAssignmentModel."""
import pytest
from django.db import IntegrityError

from contexts.identity.infrastructure.django.models import (
    UserModel,
    WorkspaceModel,
)
from contexts.presence.infrastructure.django.models import DeskAssignmentModel


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Ana Owner", is_active=True
    )
    other = UserModel.objects.create_user(
        email="bob@t4e.com", password="x", full_name="Bob Dev", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    return {"owner": owner, "other": other, "ws": ws}


def test_uma_mesa_nao_pode_ter_dois_donos(scenario):
    DeskAssignmentModel.objects.create(
        workspace=scenario["ws"], floor=1, seat_id="ws-9-4", user=scenario["owner"]
    )
    with pytest.raises(IntegrityError):
        DeskAssignmentModel.objects.create(
            workspace=scenario["ws"], floor=1, seat_id="ws-9-4", user=scenario["other"]
        )


def test_uma_pessoa_nao_pode_ter_duas_mesas(scenario):
    DeskAssignmentModel.objects.create(
        workspace=scenario["ws"], floor=1, seat_id="ws-9-4", user=scenario["owner"]
    )
    with pytest.raises(IntegrityError):
        DeskAssignmentModel.objects.create(
            workspace=scenario["ws"], floor=1, seat_id="ws-10-4", user=scenario["owner"]
        )
