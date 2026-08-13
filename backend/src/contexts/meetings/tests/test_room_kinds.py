"""Escritório e Planning Poker usam o mesmo SFU e a mesma tabela de salas.

Sem separar por tipo, cada andar visitado e cada sessão de poker viravam uma
linha na lista de Reuniões — salas que ninguém marcou, ninguém reconhece e
ninguém sabe encerrar.
"""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

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
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)
    MembershipModel.objects.create(workspace=ws, user=dono, role="owner")

    MeetingRoomModel.objects.create(
        workspace=ws, slug="ws-abc-1", name="Daily", created_by=dono.id, kind="meeting"
    )
    MeetingRoomModel.objects.create(
        workspace=ws, slug="office-abc-floor-1", name="Escritório · andar 1",
        created_by=dono.id, kind="office",
    )
    MeetingRoomModel.objects.create(
        workspace=ws, slug="poker-xyz", name="Planning Poker · X",
        created_by=dono.id, kind="poker",
    )
    return {"ws": ws, "dono": dono}


def _cli(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_lista_so_traz_reuniao_marcada_por_alguem(cenario):
    r = _cli(cenario["dono"]).get(
        reverse("meeting-rooms"), {"workspace_id": str(cenario["ws"].id)}
    )
    assert r.status_code == 200
    nomes = [sala["name"] for sala in r.json()]
    assert nomes == ["Daily"]


@pytest.mark.django_db
def test_historico_tambem_ignora_as_automaticas(cenario):
    from django.utils import timezone

    MeetingRoomModel.objects.filter(workspace=cenario["ws"]).update(
        closed_at=timezone.now()
    )

    r = _cli(cenario["dono"]).get(
        reverse("meeting-rooms"), {"workspace_id": str(cenario["ws"].id), "closed": "1"}
    )
    assert [sala["name"] for sala in r.json()] == ["Daily"]


@pytest.mark.django_db
def test_sala_criada_pela_pagina_de_reunioes_nasce_como_reuniao(cenario):
    r = _cli(cenario["dono"]).post(
        reverse("meeting-rooms"),
        {"workspace_id": str(cenario["ws"].id), "name": "Retro"},
        format="json",
    )
    assert r.status_code == 201
    assert MeetingRoomModel.objects.get(name="Retro").kind == "meeting"


@pytest.mark.django_db
def test_entrar_no_escritorio_nao_cria_reuniao_na_lista(cenario):
    cli = _cli(cenario["dono"])
    cli.post(
        reverse("office-meeting-join"),
        {"workspace_id": str(cenario["ws"].id), "floor": 2},
        format="json",
    )

    r = cli.get(reverse("meeting-rooms"), {"workspace_id": str(cenario["ws"].id)})
    assert [sala["name"] for sala in r.json()] == ["Daily"]
    # A sala existe (é ela que roteia a mídia), só não é uma reunião.
    assert MeetingRoomModel.objects.filter(kind="office").count() == 2
