"""Sala ad-hoc fecha sozinha quando o último participante sai — sala fixa da
squad, não: precisa sobreviver a todo mundo saindo, é o andar dela."""
import pytest
from rest_framework.test import APIClient

from contexts.estimation.infrastructure.django.models import SquadModel
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
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e-autoclose", owner=dono)
    MembershipModel.objects.create(workspace=ws, user=dono, role="owner")
    MembershipModel.objects.create(workspace=ws, user=membro, role="member")

    def _cli(user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    return {"ws": ws, "dono": dono, "membro": membro, "cli": _cli}


def test_sala_comum_fecha_quando_o_ultimo_sai(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"], slug="ac-1", name="Daily improvisada", created_by=cenario["dono"].id
    )
    MeetingParticipantModel.objects.create(room=sala, user=cenario["dono"])
    MeetingParticipantModel.objects.create(room=sala, user=cenario["membro"])

    resp = cenario["cli"](cenario["dono"]).post(f"/api/meetings/rooms/{sala.id}/leave/")
    assert resp.status_code == 200
    sala.refresh_from_db()
    assert sala.closed_at is None  # ainda tem o membro ao vivo

    resp = cenario["cli"](cenario["membro"]).post(f"/api/meetings/rooms/{sala.id}/leave/")
    assert resp.status_code == 200
    sala.refresh_from_db()
    assert sala.closed_at is not None  # último saiu, sala fecha sozinha


def test_sala_permanente_nao_fecha_quando_o_ultimo_sai(cenario):
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="ac-2",
        name="Squad Alfa",
        created_by=cenario["dono"].id,
        squad=squad,
        is_permanent=True,
    )
    MeetingParticipantModel.objects.create(room=sala, user=cenario["dono"])

    resp = cenario["cli"](cenario["dono"]).post(f"/api/meetings/rooms/{sala.id}/leave/")
    assert resp.status_code == 200
    sala.refresh_from_db()
    assert sala.closed_at is None


def test_sair_de_sala_que_ja_nao_existe_nao_da_erro(cenario, db):
    import uuid

    resp = cenario["cli"](cenario["dono"]).post(f"/api/meetings/rooms/{uuid.uuid4()}/leave/")
    assert resp.status_code == 200
