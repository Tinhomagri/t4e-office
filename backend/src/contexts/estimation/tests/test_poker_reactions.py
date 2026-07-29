"""Testes das reações efêmeras da sala de Planning Poker."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from contexts.estimation.infrastructure.django.models import (
    PokerParticipantModel,
    PokerReactionModel,
    PokerSessionModel,
)
from contexts.estimation.interface.api import views
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.presence.infrastructure.django.models import UserAvatarModel
from contexts.projects.infrastructure.django.models import ProjectModel


@pytest.fixture
def room(db):
    host = UserModel.objects.create_user(
        email="host@t4e.com", password="x", full_name="Host Um", is_active=True
    )
    guest = UserModel.objects.create_user(
        email="guest@t4e.com", password="x", full_name="Guest Dois", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=host)
    for u in (host, guest):
        MembershipModel.objects.create(workspace=ws, user=u, role="member")
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")
    session = PokerSessionModel.objects.create(
        workspace=ws, project=project, created_by=host, name="Sala"
    )
    for u in (host, guest):
        PokerParticipantModel.objects.create(
            session=session, user=u, is_host=(u == host)
        )

    def client_for(user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    return {
        "host": host,
        "guest": guest,
        "session": session,
        "client": client_for(host),
        "guest_client": client_for(guest),
    }


def _url(session):
    return f"/api/poker/{session.id}/reactions/"


def test_envia_reacao_para_outro_participante(room):
    resp = room["client"].post(
        _url(room["session"]),
        {"to_user_id": str(room["guest"].id), "emoji": "🔥"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["emoji"] == "🔥"
    assert resp.data["from_user_id"] == str(room["host"].id)
    assert PokerReactionModel.objects.count() == 1


def test_rejeita_emoji_fora_do_catalogo(room):
    # Texto livre aqui viraria um canal de mensagem renderizado na tela de
    # todo mundo na sala.
    resp = room["client"].post(
        _url(room["session"]),
        {"to_user_id": str(room["guest"].id), "emoji": "<script>"},
        format="json",
    )
    assert resp.status_code == 400
    assert PokerReactionModel.objects.count() == 0


def test_rejeita_destinatario_fora_da_sala(room, db):
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    resp = room["client"].post(
        _url(room["session"]),
        {"to_user_id": str(outsider.id), "emoji": "👏"},
        format="json",
    )
    assert resp.status_code == 400


def test_rejeita_remetente_que_nao_entrou_na_sala(room, db):
    outsider = UserModel.objects.create_user(
        email="fora2@t4e.com", password="x", full_name="Fora Dois", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=outsider)
    resp = client.post(
        _url(room["session"]),
        {"to_user_id": str(room["guest"].id), "emoji": "👏"},
        format="json",
    )
    assert resp.status_code == 403


def test_detalhe_da_sessao_devolve_reacoes_recentes(room):
    room["client"].post(
        _url(room["session"]),
        {"to_user_id": str(room["guest"].id), "emoji": "🎯"},
        format="json",
    )
    resp = room["guest_client"].get(f"/api/poker/{room['session'].id}/")
    assert resp.status_code == 200
    assert [r["emoji"] for r in resp.data["reactions"]] == ["🎯"]


def test_detalhe_ignora_reacao_velha(room):
    reaction = PokerReactionModel.objects.create(
        session=room["session"],
        from_user=room["host"],
        to_user=room["guest"],
        emoji="👏",
    )
    # `created_at` é auto_now_add; empurrar para fora da janela exige update
    # direto no banco.
    PokerReactionModel.objects.filter(id=reaction.id).update(
        created_at=timezone.now() - views.REACTION_WINDOW - timedelta(seconds=1)
    )
    resp = room["client"].get(f"/api/poker/{room['session'].id}/")
    assert resp.data["reactions"] == []


def test_envio_limpa_reacoes_expiradas(room):
    velha = PokerReactionModel.objects.create(
        session=room["session"],
        from_user=room["host"],
        to_user=room["guest"],
        emoji="👏",
    )
    PokerReactionModel.objects.filter(id=velha.id).update(
        created_at=timezone.now() - views.REACTION_TTL - timedelta(seconds=1)
    )
    room["client"].post(
        _url(room["session"]),
        {"to_user_id": str(room["guest"].id), "emoji": "❤️"},
        format="json",
    )
    # A varredura acontece no POST justamente para não precisar de um job.
    assert not PokerReactionModel.objects.filter(id=velha.id).exists()
    assert PokerReactionModel.objects.count() == 1


def test_detalhe_devolve_avatar_de_quem_tem_e_none_de_quem_nao_tem(room):
    UserAvatarModel.objects.create(user=room["host"], config={"hair": 3})
    resp = room["client"].get(f"/api/poker/{room['session'].id}/")
    by_user = {p["user_id"]: p["avatar_config"] for p in resp.data["participants"]}
    assert by_user[str(room["host"].id)] == {"hair": 3}
    # Quem nunca criou avatar vem como None — é o que faz a mesa cair nas
    # iniciais em vez de sentar um "Funcionário" genérico.
    assert by_user[str(room["guest"].id)] is None
