"""Etapa 2: GET /cards/{id}/historico, /sprints e /pessoas."""
import json
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from contexts.estimation.infrastructure.django.models import SquadMemberModel, SquadModel
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    ProjectModel,
    SprintModel,
)

BASE = "/api/agentes/v1"
SP = ZoneInfo("America/Sao_Paulo")


@pytest.fixture
def projeto(ws):
    return ProjectModel.objects.create(workspace=ws, name="P", key="P")


def _hist(card, field, old, new, when, author=None):
    entry = CardHistoryModel.objects.create(
        card=card, field=field, old_value=old, new_value=new, author=author
    )
    CardHistoryModel.objects.filter(pk=entry.pk).update(created_at=when)


# ── /cards/{id}/historico ─────────────────────────────────────────────────────

def test_historico_so_campos_de_fluxo_com_nomes_em_portugues(api, projeto, ws):
    card = CardModel.objects.create(project=projeto, number=1, title="C")
    _hist(card, "status", "todo", "doing", datetime(2026, 10, 12, 10, tzinfo=SP), ws.owner)
    _hist(card, "title", "a", "b", datetime(2026, 10, 12, 11, tzinfo=SP))
    _hist(card, "blocked", "", "1", datetime(2026, 10, 12, 12, tzinfo=SP))
    _hist(card, "paused", "", "1", datetime(2026, 10, 12, 13, tzinfo=SP))
    body = api.get(f"{BASE}/cards/{card.id}/historico/").json()
    assert [r["campo"] for r in body["dados"]] == ["status", "bloqueado", "pausado"]
    first = body["dados"][0]
    assert set(first) == {"id", "campo", "de", "para", "quando", "quem"}
    assert (first["de"], first["para"], first["quem"]) == ("todo", "doing", str(ws.owner.id))
    assert first["quando"] == "2026-10-12T10:00:00-03:00"
    assert body["dados"][1]["para"] is True


def test_historico_de_card_alheio_404(api, ws):
    outro = WorkspaceModel.objects.create(name="X", slug="x", owner=ws.owner)
    card = CardModel.objects.create(
        project=ProjectModel.objects.create(workspace=outro, name="X", key="X"), number=1, title="X"
    )
    assert api.get(f"{BASE}/cards/{card.id}/historico/").status_code == 404
    assert api.get(f"{BASE}/cards/{uuid.uuid4()}/historico/").status_code == 404


# ── /sprints ──────────────────────────────────────────────────────────────────

def test_sprint_planejados_no_inicio_e_concluidos(api, projeto):
    inicio = datetime(2026, 10, 12, 9, tzinfo=SP)
    sprint = SprintModel.objects.create(
        project=projeto, name="S1", status="closed",
        start_date=date(2026, 10, 12), end_date=date(2026, 10, 23),
        started_at=inicio, completed_at=datetime(2026, 10, 23, 18, tzinfo=SP),
    )
    sid = str(sprint.id)
    # Planejado e entregue.
    feito = CardModel.objects.create(
        project=projeto, number=1, title="Feito", sprint=sprint,
        resolution="done", resolved_at=datetime(2026, 10, 20, tzinfo=SP),
    )
    _hist(feito, "sprint_id", "", sid, datetime(2026, 10, 10, tzinfo=SP))
    # Planejado, não entregue, devolvido ao backlog no fechamento.
    sobrou = CardModel.objects.create(project=projeto, number=2, title="Sobrou")
    _hist(sobrou, "sprint_id", "", sid, datetime(2026, 10, 10, tzinfo=SP))
    _hist(sobrou, "sprint_id", sid, "", datetime(2026, 10, 23, 18, tzinfo=SP))
    # Entrou depois do início: não conta como planejado.
    tarde = CardModel.objects.create(project=projeto, number=3, title="Tarde", sprint=sprint)
    _hist(tarde, "sprint_id", "", sid, datetime(2026, 10, 15, tzinfo=SP))

    (row,) = api.get(f"{BASE}/sprints/").json()["dados"]
    assert set(row) == {
        "id", "projeto_id", "nome", "inicio", "fim", "status",
        "cards_planejados", "cards_concluidos", "atualizado_em",
    }
    assert row["status"] == "encerrada"
    assert (row["inicio"], row["fim"]) == ("2026-10-12", "2026-10-23")
    assert sorted(row["cards_planejados"]) == sorted([str(feito.id), str(sobrou.id)])
    assert row["cards_concluidos"] == [str(feito.id)]


def test_sprint_planejada_usa_cards_atuais_e_filtros(api, projeto):
    s = SprintModel.objects.create(project=projeto, name="S2", status="planned")
    c = CardModel.objects.create(project=projeto, number=1, title="C", sprint=s)
    SprintModel.objects.create(project=projeto, name="S0", status="active")
    rows = api.get(f"{BASE}/sprints/?status=planejada").json()["dados"]
    assert [r["nome"] for r in rows] == ["S2"]
    assert rows[0]["cards_planejados"] == [str(c.id)]
    assert api.get(f"{BASE}/sprints/?projeto={projeto.id}").json()["meta"]["total"] == 2
    assert api.get(f"{BASE}/sprints/?status=xpto").status_code == 400


# ── /pessoas ──────────────────────────────────────────────────────────────────

def test_pessoas_sem_dados_pessoais(api, ws):
    bia = UserModel.objects.create_user(
        email="bia@t4e.com", password="x", full_name="Bia Dev", is_active=True, phone="11999"
    )
    MembershipModel.objects.create(workspace=ws, user=bia, role="member")
    squad = SquadModel.objects.create(workspace=ws, name="Squad A")
    SquadMemberModel.objects.create(squad=squad, user=bia)
    # Membro de outro workspace não aparece.
    outro = WorkspaceModel.objects.create(name="X", slug="x", owner=ws.owner)
    estranho = UserModel.objects.create_user(email="z@x.com", password="x", full_name="Zé")
    MembershipModel.objects.create(workspace=outro, user=estranho, role="member")

    body = api.get(f"{BASE}/pessoas/").json()
    por_nome = {r["nome"]: r for r in body["dados"]}
    assert set(por_nome) == {"Owner", "Bia Dev"}
    assert por_nome["Bia Dev"] == {
        "id": str(bia.id), "nome": "Bia Dev", "squad": "Squad A",
        "papel": "membro", "ativo": True, "atualizado_em": por_nome["Bia Dev"]["atualizado_em"],
    }
    assert por_nome["Owner"]["papel"] == "dono"
    texto = json.dumps(body)
    assert "@" not in texto and "11999" not in texto


def test_pessoas_updated_since(api, ws):
    futuro = (timezone.now() + timezone.timedelta(hours=1)).isoformat()
    assert api.get(f"{BASE}/pessoas/", {"updated_since": futuro}).json()["dados"] == []
