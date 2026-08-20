"""Admin encerra a chamada de todo mundo numa sala fixa (daily, recorrente)
sem apagar o registro da sala — só a sessão ao vivo no SFU."""
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.meetings.infrastructure.django.models import (
    MeetingParticipantModel,
    MeetingRoomModel,
)


@pytest.fixture
def cenario(db):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    membro = UserModel.objects.create_user(
        email="membro@t4e.com", password="x", full_name="Membro", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)
    MembershipModel.objects.create(workspace=ws, user=dono, role="owner")
    MembershipModel.objects.create(workspace=ws, user=membro, role="member")

    sala = MeetingRoomModel.objects.create(
        workspace=ws, slug="ws-daily-1", name="Daily Tech", created_by=dono.id, kind="meeting"
    )
    MeetingParticipantModel.objects.create(room=sala, user=membro)

    dono_client = APIClient()
    dono_client.force_authenticate(user=dono)
    membro_client = APIClient()
    membro_client.force_authenticate(user=membro)
    return {"ws": ws, "dono": dono, "membro": membro, "sala": sala,
            "dono_client": dono_client, "membro_client": membro_client}


def test_admin_encerra_a_chamada_sem_apagar_a_sala(cenario):
    sala = cenario["sala"]
    with patch("contexts.meetings.infrastructure.livekit_token.httpx.post") as mock_post:
        mock_post.return_value.status_code = 200
        resp = cenario["dono_client"].post(f"/api/meetings/rooms/{sala.id}/end-call/")

    assert resp.status_code == 200
    sala.refresh_from_db()
    assert sala.closed_at is None  # sala continua existindo pra amanhã

    # chamou o SFU pedindo a sala certa
    called_url, = mock_post.call_args.args
    assert "DeleteRoom" in called_url
    assert mock_post.call_args.kwargs["json"] == {"room": "ws-daily-1"}

    # participante que estava na sala foi marcado como saído
    participante = MeetingParticipantModel.objects.get(room=sala, user=cenario["membro"])
    assert participante.left_at is not None


def test_membro_comum_nao_encerra_a_chamada_de_todo_mundo(cenario):
    sala = cenario["sala"]
    resp = cenario["membro_client"].post(f"/api/meetings/rooms/{sala.id}/end-call/")
    assert resp.status_code == 403
    sala.refresh_from_db()
    assert sala.closed_at is None


def test_sala_sem_ninguem_ao_vivo_nao_da_erro(cenario):
    """SFU responde 404 (sala já não tinha sessão ao vivo) — não é falha."""
    sala = cenario["sala"]
    with patch("contexts.meetings.infrastructure.livekit_token.httpx.post") as mock_post:
        mock_post.return_value.status_code = 404
        resp = cenario["dono_client"].post(f"/api/meetings/rooms/{sala.id}/end-call/")
    assert resp.status_code == 200
