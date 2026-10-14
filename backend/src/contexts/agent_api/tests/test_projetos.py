"""GET /projetos — envelope, filtros, escopo por workspace e paginação."""
from datetime import date

from django.utils import timezone

from contexts.estimation.infrastructure.django.models import SquadModel
from contexts.identity.infrastructure.django.models import WorkspaceModel
from contexts.projects.infrastructure.django.models import ProjectModel, SprintModel

URL = "/api/agentes/v1/projetos/"
CAMPOS = {
    "id", "nome", "squad", "status", "cliente_id", "contrato_id",
    "inicio", "fim_previsto", "atualizado_em",
}


def test_campos_e_mapeamento(api, ws):
    squad = SquadModel.objects.create(workspace=ws, name="Squad A")
    p = ProjectModel.objects.create(
        workspace=ws, name="Mia", key="MIA", squad=squad, status="paused",
        manager_client_id="CLI-1", manager_contract_id="C-9", deadline=date(2026, 12, 1),
    )
    SprintModel.objects.create(project=p, name="S1", start_date=date(2026, 9, 1))
    body = api.get(URL).json()
    (row,) = body["dados"]
    assert set(row) == CAMPOS
    assert row["squad"] == "Squad A"
    assert row["status"] == "pausado"
    assert (row["cliente_id"], row["contrato_id"]) == ("CLI-1", "C-9")
    assert (row["inicio"], row["fim_previsto"]) == ("2026-09-01", "2026-12-01")
    assert row["atualizado_em"].endswith("-03:00")
    assert body["meta"] == {"proximo_cursor": None, "total": 1}


def test_arquivado_sai_como_encerrado(api, ws):
    ProjectModel.objects.create(workspace=ws, name="Velho", key="V", archived_at=timezone.now())
    assert api.get(URL).json()["dados"][0]["status"] == "encerrado"


def test_so_projetos_dos_workspaces_do_token(api, ws):
    outro = WorkspaceModel.objects.create(name="Outro", slug="outro", owner=ws.owner)
    ProjectModel.objects.create(workspace=outro, name="Alheio", key="A")
    ProjectModel.objects.create(workspace=ws, name="Nosso", key="N")
    assert [r["nome"] for r in api.get(URL).json()["dados"]] == ["Nosso"]


def test_filtros_status_e_squad(api, ws):
    squad = SquadModel.objects.create(workspace=ws, name="Squad A")
    ProjectModel.objects.create(workspace=ws, name="A", key="A", squad=squad)
    ProjectModel.objects.create(workspace=ws, name="B", key="B", status="closed")
    assert [r["nome"] for r in api.get(URL + "?status=encerrado").json()["dados"]] == ["B"]
    assert [r["nome"] for r in api.get(URL + "?squad=Squad A").json()["dados"]] == ["A"]
    assert [r["nome"] for r in api.get(URL + f"?squad={squad.id}").json()["dados"]] == ["A"]


def test_paginacao_por_cursor_e_updated_since(api, ws):
    for i in range(3):
        ProjectModel.objects.create(workspace=ws, name=f"P{i}", key=f"P{i}")
    primeira = api.get(URL + "?limit=2").json()
    assert len(primeira["dados"]) == 2 and primeira["meta"]["total"] == 3
    segunda = api.get(URL + f"?limit=2&cursor={primeira['meta']['proximo_cursor']}").json()
    nomes = [r["nome"] for r in primeira["dados"] + segunda["dados"]]
    assert sorted(nomes) == ["P0", "P1", "P2"]
    assert segunda["meta"]["proximo_cursor"] is None

    futuro = (timezone.now() + timezone.timedelta(minutes=1)).isoformat()
    assert api.get(URL, {"updated_since": futuro}).json()["dados"] == []
