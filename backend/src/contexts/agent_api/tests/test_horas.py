"""GET /horas — tempo rastreado (automático) + worklog (manual), com `fonte`."""
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from contexts.agent_api.infrastructure.models import TrackedTimeEntryModel
from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel, WorklogModel

URL = "/api/agentes/v1/horas/"
SP = ZoneInfo("America/Sao_Paulo")


@pytest.fixture
def dados(ws):
    p = ProjectModel.objects.create(workspace=ws, name="P", key="P")
    card = CardModel.objects.create(project=p, number=1, title="C")
    TrackedTimeEntryModel.objects.create(
        card=card, pessoa=ws.owner, segundos=7200,
        inicio=datetime(2026, 10, 12, 10, tzinfo=SP), fim=datetime(2026, 10, 12, 12, tzinfo=SP),
    )
    bia = UserModel.objects.create_user(email="bia@t4e.com", password="x", full_name="Bia")
    WorklogModel.objects.create(
        card=card, author=bia, time_seconds=5400, comment="reunião",
        started_at=datetime(2026, 10, 13, 15, tzinfo=SP),
    )
    return {"projeto": p, "card": card, "bia": bia}


def test_junta_rastreado_e_manual(api, dados, ws):
    body = api.get(URL).json()
    assert body["meta"]["total"] == 2
    por_fonte = {r["fonte"]: r for r in body["dados"]}
    r, m = por_fonte["rastreado"], por_fonte["manual"]
    assert set(r) == {"id", "pessoa_id", "card_id", "projeto_id", "data", "horas", "descricao", "fonte"}
    assert r["id"].startswith("r_") and m["id"].startswith("m_")
    assert (r["horas"], r["data"], r["pessoa_id"]) == (2.0, "2026-10-12", str(ws.owner.id))
    assert (m["horas"], m["data"], m["descricao"]) == (1.5, "2026-10-13", "reunião")
    assert r["card_id"] == m["card_id"] == str(dados["card"].id)
    assert r["projeto_id"] == str(dados["projeto"].id)


def test_filtros(api, dados):
    assert [r["fonte"] for r in api.get(URL + f"?pessoa={dados['bia'].id}").json()["dados"]] == ["manual"]
    assert [r["fonte"] for r in api.get(URL + "?de=2026-10-13").json()["dados"]] == ["manual"]
    assert [r["fonte"] for r in api.get(URL + "?ate=2026-10-12").json()["dados"]] == ["rastreado"]
    assert api.get(URL + "?projeto=00000000-0000-0000-0000-000000000000").json()["dados"] == []


def test_paginacao(api, dados):
    p1 = api.get(URL + "?limit=1").json()
    p2 = api.get(URL + f"?limit=1&cursor={p1['meta']['proximo_cursor']}").json()
    assert {p1["dados"][0]["fonte"], p2["dados"][0]["fonte"]} == {"rastreado", "manual"}
    assert p2["meta"]["proximo_cursor"] is None


def test_data_invalida_400(api, dados):
    assert api.get(URL + "?de=ontem").status_code == 400


def test_outro_workspace_nao_aparece(api, dados, ws):
    outro = WorkspaceModel.objects.create(name="X", slug="x", owner=ws.owner)
    card = CardModel.objects.create(
        project=ProjectModel.objects.create(workspace=outro, name="X", key="X"), number=1, title="X"
    )
    WorklogModel.objects.create(card=card, author=ws.owner, time_seconds=60, started_at=datetime.now(SP))
    assert api.get(URL).json()["meta"]["total"] == 2
