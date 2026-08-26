"""Acesso à sala de poker: multi-tenancy e assento na hora de votar."""
import pytest
from rest_framework.test import APIClient

from contexts.estimation.infrastructure.django.models import (
    PokerParticipantModel,
    PokerSessionModel,
    PokerVoteModel,
)
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel

CARD_ID = "11111111-1111-1111-1111-111111111111"


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def sala(db):
    host = UserModel.objects.create_user(
        email="host@t4e.com", password="x", full_name="Host Um", is_active=True
    )
    colega = UserModel.objects.create_user(
        email="colega@t4e.com", password="x", full_name="Colega Dois", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=host)
    for u in (host, colega):
        MembershipModel.objects.create(workspace=ws, user=u, role="member")
    project = ProjectModel.objects.create(workspace=ws, name="P", key="PRJ")
    parent = CardModel.objects.create(project=project, number=90, title="Card pai", status="todo")
    CardModel.objects.create(
        id=CARD_ID,
        project=project,
        number=91,
        title="Subtarefa ativa",
        status="todo",
        parent=parent,
    )
    session = PokerSessionModel.objects.create(
        workspace=ws,
        project=project,
        created_by=host,
        name="Sala",
        status="voting",
        current_card_id=CARD_ID,
        card_ids=[CARD_ID],
    )
    PokerParticipantModel.objects.create(session=session, user=host, is_host=True)
    return {"host": host, "colega": colega, "session": session}


@pytest.fixture
def estranho(db):
    """Usuário autenticado de outro workspace — só tem o link da sala."""
    return UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="De Fora", is_active=True
    )


# ── Multi-tenancy ────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "method,suffix,payload",
    [
        ("get", "", None),
        ("post", "join/", {}),
        ("post", "vote/", {"value": "5"}),
        ("post", "heartbeat/", {}),
        ("post", "reactions/", {"to_user_id": "x", "emoji": "👏"}),
    ],
)
def test_estranho_nao_alcanca_a_sala(sala, estranho, method, suffix, payload):
    # Só o link não basta: a sala pertence ao workspace de um projeto.
    client = _client(estranho)
    url = f"/api/poker/{sala['session'].id}/{suffix}"
    resp = getattr(client, method)(url, payload, format="json") if payload is not None \
        else client.get(url)
    assert resp.status_code == 403


# ── Assento na hora de votar ─────────────────────────────────────────────────

def test_membro_vota_mesmo_sem_ter_passado_pelo_join(sala):
    # O cliente dispara o join num efeito; votar antes dele terminar estourava
    # DoesNotExist dentro do repositório e devolvia 500.
    resp = _client(sala["colega"]).post(
        f"/api/poker/{sala['session'].id}/vote/", {"value": "5"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["value"] == "5"
    assert PokerVoteModel.objects.filter(session=sala["session"]).count() == 1


def test_voto_sem_join_senta_a_pessoa_na_mesa(sala):
    _client(sala["colega"]).post(
        f"/api/poker/{sala['session'].id}/vote/", {"value": "3"}, format="json"
    )
    assert PokerParticipantModel.objects.filter(
        session=sala["session"], user=sala["colega"]
    ).exists()


def test_detalhe_da_sala_entrega_card_ativo_para_todo_participante(sala):
    """A mesa não pode depender da fila/busca local de quem está assistindo."""
    response = _client(sala["host"]).get(f"/api/poker/{sala['session'].id}/")

    assert response.status_code == 200
    card = response.data["current_card"]
    assert card["id"] == CARD_ID
    assert card["ref"] == "PRJ-91"
    assert card["title"] == "Subtarefa ativa"
    assert card["parent_ref"] == "PRJ-90"
    assert card["parent_title"] == "Card pai"


def test_quem_entra_pelo_voto_nao_vira_host(sala):
    _client(sala["colega"]).post(
        f"/api/poker/{sala['session'].id}/vote/", {"value": "3"}, format="json"
    )
    seat = PokerParticipantModel.objects.get(
        session=sala["session"], user=sala["colega"]
    )
    assert seat.is_host is False


def test_heartbeat_de_sala_inexistente_devolve_404(sala):
    missing = "22222222-2222-2222-2222-222222222222"
    resp = _client(sala["host"]).post(f"/api/poker/{missing}/heartbeat/")
    assert resp.status_code == 404


# ── Sair da sala ──────────────────────────────────────────────────────────────

def test_participante_sai_da_sala(sala):
    resp = _client(sala["host"]).post(f"/api/poker/{sala['session'].id}/leave/")
    assert resp.status_code == 204
    assert not PokerParticipantModel.objects.filter(
        session=sala["session"], user=sala["host"]
    ).exists()


def test_estranho_nao_sai_de_sala_de_outro_workspace(sala, estranho):
    resp = _client(estranho).post(f"/api/poker/{sala['session'].id}/leave/")
    assert resp.status_code == 403


def test_sair_de_sala_inexistente_devolve_404(sala):
    missing = "22222222-2222-2222-2222-222222222222"
    resp = _client(sala["host"]).post(f"/api/poker/{missing}/leave/")
    assert resp.status_code == 404


# ── Filtro de projeto na fila de cards ───────────────────────────────────────

def test_filtro_project_restringe_cards_ao_projeto(sala):
    outro_projeto = ProjectModel.objects.create(
        workspace=sala["session"].workspace, name="Outro", key="OUT"
    )
    CardModel.objects.create(project=sala["session"].project, number=1, title="do projeto da sala")
    CardModel.objects.create(project=outro_projeto, number=1, title="do outro projeto")

    resp = _client(sala["host"]).get(
        f"/api/poker/{sala['session'].id}/cards/", {"project": str(outro_projeto.id)}
    )
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.data]
    assert titles == ["do outro projeto"]
