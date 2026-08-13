"""O comando reescreve o quadro de projetos que já têm cards dentro.

Se um card cair numa coluna que não existe mais, ele some do board — some de
verdade, porque o quadro desenha por coluna. Estes testes prendem o remapeamento
antes que isso aconteça em cima dos 2463 cards importados.
"""
import pytest
from django.core.management import call_command

from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    WorkflowStatusModel,
)
from contexts.projects.interface.api.extra_views import DEFAULT_STATUSES
from contexts.projects.management.commands.normalize_board_columns import destino_de

PADRAO = [d["slug"] for d in DEFAULT_STATUSES]


@pytest.fixture
def projeto(db):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)
    p = ProjectModel.objects.create(workspace=ws, name="Gestum", key="GES", external_key="GES")

    # Colunas como vieram do Jira: nomes livres, categorias corretas.
    colunas = [
        ("Itens pendentes", "itens-pendentes", "todo", 0),
        ("ITENS INICIADOS", "itens-iniciados", "in_progress", 1),
        ("Testes", "testes", "in_progress", 2),
        ("Integração backend", "integracao-backend", "in_progress", 3),
        ("Concluído", "concluido", "done", 4),
    ]
    for nome, slug, cat, ordem in colunas:
        WorkflowStatusModel.objects.create(
            project=p, name=nome, slug=slug, category=cat, order=ordem
        )

    n = 0
    for slug in ("itens-pendentes", "itens-iniciados", "testes", "integracao-backend", "concluido"):
        n += 1
        CardModel.objects.create(project=p, number=n, title=f"card {slug}", status=slug)
    return p


@pytest.mark.django_db
def test_cria_as_cinco_colunas_padrao(projeto):
    call_command("normalize_board_columns")

    colunas = list(
        WorkflowStatusModel.objects.filter(project=projeto).order_by("order").values_list("slug", "name")
    )
    assert [c[0] for c in colunas] == PADRAO
    assert [c[1] for c in colunas] == [
        "Itens pendentes",
        "Em andamento",
        "Backend / integrar",
        "Code Review",
        "Concluídos",
    ]


@pytest.mark.django_db
def test_nenhum_card_fica_orfao(projeto):
    call_command("normalize_board_columns")

    # Card apontando para coluna inexistente não aparece no quadro — é o pior
    # desfecho possível desta operação.
    validos = set(
        WorkflowStatusModel.objects.filter(project=projeto).values_list("slug", flat=True)
    )
    for card in CardModel.objects.filter(project=projeto):
        assert card.status in validos


@pytest.mark.django_db
def test_leva_cada_card_para_a_coluna_equivalente(projeto):
    call_command("normalize_board_columns")

    por_titulo = {c.title: c.status for c in CardModel.objects.filter(project=projeto)}
    assert por_titulo["card itens-pendentes"] == "todo"
    assert por_titulo["card itens-iniciados"] == "doing"
    # O nome é mais específico que a categoria: "Testes" e "Integração backend"
    # eram ambos in_progress, mas viram colunas diferentes.
    assert por_titulo["card testes"] == "review"
    assert por_titulo["card integracao-backend"] == "backend"
    assert por_titulo["card concluido"] == "done"


@pytest.mark.django_db
def test_dry_run_nao_altera_nada(projeto):
    antes_colunas = set(
        WorkflowStatusModel.objects.filter(project=projeto).values_list("slug", flat=True)
    )
    antes_status = sorted(CardModel.objects.filter(project=projeto).values_list("status", flat=True))

    call_command("normalize_board_columns", dry_run=True)

    assert set(
        WorkflowStatusModel.objects.filter(project=projeto).values_list("slug", flat=True)
    ) == antes_colunas
    assert sorted(
        CardModel.objects.filter(project=projeto).values_list("status", flat=True)
    ) == antes_status


@pytest.mark.django_db
def test_rodar_duas_vezes_nao_duplica(projeto):
    call_command("normalize_board_columns")
    call_command("normalize_board_columns")

    assert WorkflowStatusModel.objects.filter(project=projeto).count() == len(PADRAO)


class TestDestino:
    """A regra de para onde cada coluna antiga aponta."""

    def test_nome_vence_a_categoria_no_meio_do_fluxo(self):
        assert destino_de("Code Review", "in_progress") == "review"
        assert destino_de("Em teste", "in_progress") == "review"
        assert destino_de("Integração backend", "in_progress") == "backend"

    def test_coluna_concluida_continua_conclusao(self):
        # "Testes concluídos" tem a pista "teste", mas é fim de fluxo: mandar
        # para Code Review ressuscitaria card entregue.
        assert destino_de("Testes concluídos", "done") == "done"

    def test_sem_pista_manda_pela_categoria(self):
        assert destino_de("Itens pendentes", "todo") == "todo"
        assert destino_de("ITENS INICIADOS", "in_progress") == "doing"
        assert destino_de("Pronto", "done") == "done"


@pytest.mark.django_db
def test_card_em_status_sem_coluna_tambem_e_resgatado(projeto):
    """Cards antigos carregam status que nunca teve coluna ("backlog").

    Eles não aparecem em nenhuma rota de coluna, então passavam batido pela
    migração e ficavam apontando para o nada — sumindo do quadro.
    """
    CardModel.objects.create(project=projeto, number=99, title="antigo", status="backlog")

    call_command("normalize_board_columns")

    validos = set(
        WorkflowStatusModel.objects.filter(project=projeto).values_list("slug", flat=True)
    )
    resgatado = CardModel.objects.get(title="antigo")
    assert resgatado.status in validos
    assert resgatado.status == "todo"
