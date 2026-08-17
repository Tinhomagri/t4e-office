"""Testes do registry multi-domínio do Copiloto.

Cobrem o que o registry garante e nenhum provider sozinho garante: catálogo
único sem colisão, roteamento por nome, escrita só de ação conhecida e
isolamento por workspace.
"""
import pytest

from contexts.copilot.infrastructure import ai_prompt
from contexts.copilot.infrastructure.agent.registry import AgentTools
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import ProjectModel
from contexts.sales.infrastructure.django.models import (
    CustomerModel,
    DealModel,
    PipelineStageModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="reg@t4e.com", password="x", full_name="Reg", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-reg", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")
    stage = PipelineStageModel.objects.create(
        workspace=ws, name="Qualificação", slug="qualificacao", order=0,
        probability_default=20, kind="open",
    )
    customer = CustomerModel.objects.create(workspace=ws, name="ACME", kind="company")
    return {
        "owner": owner,
        "ws": ws,
        "project": project,
        "stage": stage,
        "customer": customer,
    }


def tools_for(scenario) -> AgentTools:
    return AgentTools(
        workspace_id=str(scenario["ws"].id), actor_id=str(scenario["owner"].id)
    )


def test_catalogo_cobre_todos_os_dominios_sem_colisao(scenario):
    tools = tools_for(scenario)
    names = [t["name"] for t in tools.read_tools()]

    assert len(names) == len(set(names)), "nomes de ferramenta duplicados"
    # Um representante por domínio — se algum provider sumir do registry, cai aqui.
    for expected in (
        "list_projects",
        "sales_pipeline_summary",
        "mkt_editorial_calendar",
        "cal_upcoming_events",
        "drive_search_files",
        "gh_list_pull_requests",
        "dlv_delivery_metrics",
    ):
        assert expected in names
    assert tools.domains == ["projects", "sales", "mkt", "cal", "drive", "gh", "dlv"]


def test_nomes_de_ferramenta_sao_validos_para_os_provedores(scenario):
    """Anthropic/OpenAI exigem ^[a-zA-Z0-9_-]{1,64}$ — ponto quebraria a chamada."""
    import re

    pattern = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
    for spec in tools_for(scenario).all_tools():
        assert pattern.match(spec["name"]), spec["name"]
        assert spec["description"].strip()
        assert spec["input_schema"]["type"] == "object"


def test_propose_tool_agrega_acoes_de_todos_os_dominios(scenario):
    propose = tools_for(scenario).propose_tool()
    enum = propose["input_schema"]["properties"]["actions"]["items"]["properties"][
        "action"
    ]["enum"]

    assert "create_card" in enum  # entrega
    assert "win_deal" in enum  # comercial
    # Publicar em rede social sai da empresa: não é ação do agente.
    assert not any("publish" in a for a in enum)


def test_leitura_roteia_para_o_dominio_certo(scenario):
    tools = tools_for(scenario)

    projects = tools.execute_read("list_projects", {})
    assert projects["projects"][0]["key"] == "PRJ"

    pipeline = tools.execute_read("sales_pipeline_summary", {})
    assert pipeline["by_stage"][0]["stage_name"] == "Qualificação"
    assert pipeline["open_count"] == 0


def test_pipeline_summary_ve_negocio_criado(scenario):
    DealModel.objects.create(
        workspace=scenario["ws"],
        title="Projeto novo",
        customer=scenario["customer"],
        stage=scenario["stage"],
        amount="1000",
        probability=50,
    )
    summary = tools_for(scenario).execute_read("sales_pipeline_summary", {})

    assert summary["open_count"] == 1
    assert summary["by_stage"][0]["count"] == 1
    # 1000 * 50% — o ponderado é o número que embasa previsão de receita.
    assert summary["open_weighted_amount"].startswith("500")


def test_ferramenta_desconhecida_vira_contexto_e_nao_excecao(scenario):
    out = tools_for(scenario).execute_read("nao_existe", {})
    assert "error" in out


def test_escrita_recusa_acao_fora_do_catalogo(scenario):
    out = tools_for(scenario).execute_write({"action": "drop_database"})
    assert out["ok"] is False
    assert "inválida" in out["error"]


def test_nao_membro_nao_le_nada(scenario):
    intruder = UserModel.objects.create_user(
        email="intruso@t4e.com", password="x", full_name="Intruso", is_active=True
    )
    tools = AgentTools(
        workspace_id=str(scenario["ws"].id), actor_id=str(intruder.id)
    )
    out = tools.execute_read("list_projects", {})
    assert "error" in out
    assert "acesso" in out["error"].lower()


def test_escrita_comercial_cria_negocio(scenario):
    tools = tools_for(scenario)
    out = tools.execute_write(
        {
            "action": "create_deal",
            "reason": "Pedido do usuário no chat.",
            "deal_title": "Implantação ACME",
            "customer_id": str(scenario["customer"].id),
            "amount": 5000,
        }
    )
    assert out["ok"] is True, out
    deal = DealModel.objects.get(id=out["id"])
    assert deal.title == "Implantação ACME"
    # Sem stage informado, entra na primeira coluna e herda a probabilidade dela.
    assert str(deal.stage_id) == str(scenario["stage"].id)
    assert deal.probability == 20


def test_prompt_muda_com_o_space():
    comercial = ai_prompt.build_agent_system(space="comercial")
    boards = ai_prompt.build_agent_system(space="boards")

    assert "Comercial" in comercial
    assert comercial != boards
    # Space desconhecido não estoura — cai no padrão.
    assert ai_prompt.build_agent_system(space="inexistente") == boards
