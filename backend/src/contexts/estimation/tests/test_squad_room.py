"""Toda squad tem uma sala de reunião fixa e sempre visível pra quem é do
time — criada junto com a squad, fechada quando a squad é apagada, e
backfillada pra squads que já existiam antes desta feature."""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from contexts.estimation.infrastructure.django.models import SquadMemberModel, SquadModel
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.meetings.infrastructure.django.models import MeetingRoomModel


@pytest.fixture
def cenario(db):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    membro = UserModel.objects.create_user(
        email="membro@t4e.com", password="x", full_name="Membro", is_active=True
    )
    de_fora = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="De Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e-squadroom", owner=dono)
    MembershipModel.objects.create(workspace=ws, user=dono, role="owner")
    MembershipModel.objects.create(workspace=ws, user=membro, role="member")
    MembershipModel.objects.create(workspace=ws, user=de_fora, role="member")

    def _cli(user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    return {"ws": ws, "dono": dono, "membro": membro, "de_fora": de_fora, "cli": _cli}


def test_criar_squad_ganha_sala_fixa(cenario):
    resp = cenario["cli"](cenario["dono"]).post(
        f"/api/workspaces/{cenario['ws'].id}/squads/",
        {"name": "Squad Alfa", "member_ids": [str(cenario["membro"].id)]},
        format="json",
    )
    assert resp.status_code == 201
    squad_id = resp.data["id"]

    sala = MeetingRoomModel.objects.get(squad_id=squad_id)
    assert sala.is_permanent is True
    assert str(sala.squad_id) == squad_id
    assert sala.kind == "meeting"

    # visível pro membro da squad, não pra quem é de fora
    url = f"/api/meetings/rooms/?workspace_id={cenario['ws'].id}"
    assert len(cenario["cli"](cenario["membro"]).get(url).data) == 1
    assert len(cenario["cli"](cenario["de_fora"]).get(url).data) == 0


def test_apagar_squad_fecha_a_sala_fixa(cenario):
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Beta")
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="squad-beta-room",
        name="Squad Beta",
        created_by=cenario["dono"].id,
        squad=squad,
        is_permanent=True,
    )

    resp = cenario["cli"](cenario["dono"]).delete(f"/api/squads/{squad.id}/")
    assert resp.status_code == 204

    sala.refresh_from_db()
    assert sala.closed_at is not None


# ── Backfill (migração 0005) ──────────────────────────────────────────────────


def test_backfill_cria_sala_fixa_para_squad_antiga(cenario):
    """Simula dado que já existia antes da feature: squad criada direto no
    model, sem passar pela view (que já cria a sala)."""
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Legada")
    assert not MeetingRoomModel.objects.filter(squad_id=squad.id).exists()

    backfill_module = importlib.import_module(
        "contexts.meetings.migrations.0005_backfill_squad_rooms"
    )
    backfill_module.backfill(apps, None)

    salas = MeetingRoomModel.objects.filter(squad_id=squad.id, is_permanent=True)
    assert salas.count() == 1
    assert salas.first().created_by == cenario["ws"].owner_id

    # idempotente: rodar de novo não duplica
    backfill_module.backfill(apps, None)
    assert MeetingRoomModel.objects.filter(squad_id=squad.id, is_permanent=True).count() == 1
