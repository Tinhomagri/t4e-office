"""GET /cards e /cards/{id} — mapeamentos para o vocabulário do Leonardo."""
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from contexts.agent_api.infrastructure.models import TrackedTimeEntryModel
from contexts.identity.infrastructure.django.models import WorkspaceModel
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    WorkflowStatusModel,
    WorklogModel,
)

URL = "/api/agentes/v1/cards/"
SP = ZoneInfo("America/Sao_Paulo")
CAMPOS = {
    "id", "titulo", "descricao", "tipo", "status", "status_categoria", "prioridade",
    "projeto_id", "sprint_id", "responsavel_id", "origem", "horas_estimadas",
    "horas_gastas", "horas_apontadas", "bloqueado", "motivo_bloqueio", "etiquetas",
    "arquivado", "criado_em", "atualizado_em", "concluido_em",
}


@pytest.fixture
def projeto(ws):
    p = ProjectModel.objects.create(workspace=ws, name="P", key="P")
    WorkflowStatusModel.objects.create(
        project=p, name="Fazendo", slug="doing", category="in_progress", order=1, is_working=True
    )
    WorkflowStatusModel.objects.create(
        project=p, name="Feito", slug="done", category="done", order=2
    )
    return p


def _card(projeto, n, **kw):
    return CardModel.objects.create(project=projeto, number=n, title=f"C{n}", **kw)


def _get(api, query=""):
    return api.get(URL + query).json()["dados"]


def test_campos_e_mapeamentos(api, projeto, ws):
    c = _card(
        projeto, 1, type="debt", priority="urgent", status="doing", assignee=ws.owner,
        labels=["api"], original_estimate_seconds=7200,
    )
    (row,) = _get(api)
    assert set(row) == CAMPOS
    assert row["id"] == str(c.id)
    assert (row["tipo"], row["prioridade"]) == ("melhoria", "critica")
    assert (row["status"], row["status_categoria"]) == ("doing", "em_andamento")
    assert row["horas_estimadas"] == 2.0
    assert row["responsavel_id"] == str(ws.owner.id)
    assert row["etiquetas"] == ["api"]


@pytest.mark.parametrize(
    "tipo_office,tipo_api",
    [("feature", "feature"), ("spike", "feature"), ("bug", "bug"),
     ("support", "suporte"), ("improvement", "melhoria"), ("chore", "melhoria")],
)
def test_tipos(api, projeto, tipo_office, tipo_api):
    _card(projeto, 1, type=tipo_office)
    assert _get(api)[0]["tipo"] == tipo_api


def test_epico_e_marketing_ficam_de_fora(api, projeto):
    _card(projeto, 1, type="epic")
    _card(projeto, 2, type="post")
    assert _get(api) == []


def test_origem_derivada_e_override(api, projeto):
    _card(projeto, 1, source="public_link")
    _card(projeto, 2, source="manual")
    _card(projeto, 3, source="manual", client_request=True)
    _card(projeto, 4, source="public_link", client_request=False)
    origem = {r["titulo"]: r["origem"] for r in _get(api)}
    assert origem == {
        "C1": "pedido_cliente", "C2": "interno", "C3": "pedido_cliente", "C4": "interno",
    }


def test_bloqueio_e_filtro(api, projeto):
    _card(projeto, 1, blocked=True, block_reason="Sem acesso", blocked_at=timezone.now())
    _card(projeto, 2)
    (row,) = _get(api, "?bloqueado=true")
    assert (row["bloqueado"], row["motivo_bloqueio"]) == (True, "Sem acesso")
    assert [r["titulo"] for r in _get(api, "?bloqueado=false")] == ["C2"]


def test_horas_gastas_e_apontadas(api, projeto, ws):
    c = _card(projeto, 1, status="done")
    TrackedTimeEntryModel.objects.create(
        card=c, pessoa=ws.owner, segundos=7200,
        inicio=datetime(2026, 10, 12, 10, tzinfo=SP), fim=datetime(2026, 10, 12, 12, tzinfo=SP),
    )
    WorklogModel.objects.create(card=c, author=ws.owner, time_seconds=5400, started_at=timezone.now())
    (row,) = _get(api)
    assert (row["horas_gastas"], row["horas_apontadas"]) == (2.0, 1.5)


def test_filtros(api, projeto, ws):
    _card(projeto, 1, type="bug", status="doing", assignee=ws.owner)
    _card(projeto, 2, type="feature", status="done", resolution="done", resolved_at=timezone.now())
    assert [r["titulo"] for r in _get(api, "?tipo=bug")] == ["C1"]
    assert [r["titulo"] for r in _get(api, "?status=done")] == ["C2"]
    assert [r["titulo"] for r in _get(api, f"?responsavel={ws.owner.id}")] == ["C1"]
    assert [r["titulo"] for r in _get(api, f"?projeto={projeto.id}")] == ["C1", "C2"]
    hoje = timezone.localdate().isoformat()
    assert [r["titulo"] for r in _get(api, f"?concluido_desde={hoje}T00:00:00-03:00")] == ["C2"]


def test_tipo_invalido_400(api, projeto):
    resp = api.get(URL + "?tipo=xpto")
    assert resp.status_code == 400 and resp.json()["erro"] == "parametro_invalido"


def test_detalhe_e_escopo(api, projeto, ws):
    c = _card(projeto, 1)
    assert api.get(f"{URL}{c.id}/").json()["titulo"] == "C1"
    outro = WorkspaceModel.objects.create(name="X", slug="x", owner=ws.owner)
    alheio = _card(ProjectModel.objects.create(workspace=outro, name="X", key="X"), 1)
    assert api.get(f"{URL}{alheio.id}/").status_code == 404
    assert api.get(f"{URL}{uuid.uuid4()}/").status_code == 404
    assert [r["titulo"] for r in _get(api)] == ["C1"]
