"""O importador do Jira roda uma vez, contra dados de terceiros, e grava direto
no banco — não dá para conferir "depois". Estes testes prendem o mapeamento com
um Jira falso: se a tradução de tipo, hierarquia, sprint ou responsável mudar,
quebra aqui e não em produção.
"""
import pytest
from django.core.management import call_command

from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    SprintModel,
    WorkflowStatusModel,
)
from contexts.projects.management.commands import import_jira

SPRINT = {
    "id": 785,
    "name": "GES Sprint 1",
    "state": "active",
    "goal": "Fechar o crediário",
}

SPRINT_ENCERRADA = {"id": 786, "name": "GES Sprint 0", "state": "closed", "goal": ""}


def _pessoa(email: str | None, nome: str) -> dict:
    return {"emailAddress": email, "displayName": nome}


def _issue(key, tipo, titulo, status, categoria, **extra) -> dict:
    campos = {
        "summary": titulo,
        "description": "corpo",
        "issuetype": {"name": tipo},
        "status": {"name": status, "statusCategory": {"key": categoria}},
        "priority": {"name": "Medium"},
        "labels": [],
        "assignee": None,
        "reporter": None,
        "duedate": None,
        "resolutiondate": None,
        "timeoriginalestimate": None,
        "parent": None,
        "customfield_10020": None,
        "customfield_10016": None,
    }
    campos.update(extra)
    return {"key": key, "fields": campos}


ISSUES = [
    # Épico com pai: o Jira novo permite (Initiative acima), o nosso domínio não.
    _issue("GES-1", "Epic", "Crediário", "Itens pendentes", "new",
           parent={"key": "GES-99"}),
    _issue("GES-99", "Epic", "Programa", "Itens pendentes", "new"),
    # Resolvida: data e desfecho precisam chegar juntos.
    _issue("GES-50", "Bug", "Erro no boleto", "Concluído", "done",
           resolution={"name": "Concluído"},
           resolutiondate="2026-07-01T10:00:00.000-0300"),
    # Data de resolução sem desfecho declarado — o par tem que ser completado.
    _issue("GES-51", "Bug", "Erro na parcela", "Concluído", "done",
           resolutiondate="2026-07-02T10:00:00.000-0300"),
    _issue(
        "GES-37", "Tarefa", "Vendas e Gestão", "Em andamento", "indeterminate",
        parent={"key": "GES-1"},
        assignee=_pessoa("dev@t4egroup.com.br", "Dev Conhecido"),
        customfield_10020=[SPRINT],
        customfield_10016=5,
    ),
    _issue(
        "GES-38", "Subtarefa", "Emitir carnê", "Concluído", "done",
        parent={"key": "GES-37"},
        assignee=_pessoa("sumiu@outra.com", "Alguém de Fora"),
    ),
    _issue("GES-40", "Bug", "Parcela errada", "Itens pendentes", "new"),
    # Jira sem e-mail no campo (privacidade escondida pela pessoa): só o nome
    # chega, e ele bate exato com uma conta existente.
    _issue(
        "GES-42", "Bug", "Sem e-mail no Jira", "Itens pendentes", "new",
        assignee=_pessoa(None, "Dev Sem Email"),
    ),
    _issue("GES-41", "Tarefa", "Fechar caixa", "Concluído", "done",
           resolution={"name": "Concluído"},
           resolutiondate="2026-06-01T10:00:00.000-0300",
           customfield_10020=[SPRINT_ENCERRADA]),
]


@pytest.fixture
def jira_falso(monkeypatch):
    """Substitui só a camada HTTP; todo o resto do comando roda de verdade."""
    def fake_get(self, path, **params):
        if path.endswith("/field"):
            return [
                {"id": "customfield_10020", "name": "Sprint"},
                {"id": "customfield_10016", "name": "Story Points"},
            ]
        if path.endswith("/project/search"):
            return {"values": [{"key": "GES", "name": "Gestum", "description": "ERP"}]}
        if path.endswith("/comment"):
            return {"comments": []}
        # Sem quadro configurado nestes testes — cai no fallback de uma
        # coluna por status, que é o comportamento que eles já verificam.
        if path.endswith("/board"):
            return {"values": []}
        raise AssertionError(f"endpoint inesperado: {path}")

    monkeypatch.setattr(import_jira.Command, "_get", fake_get)
    monkeypatch.setattr(import_jira.Command, "_search", lambda self, jql, fields: ISSUES)
    monkeypatch.setenv("JIRA_URL", "https://exemplo.atlassian.net")
    monkeypatch.setenv("JIRA_EMAIL", "eu@t4egroup.com.br")
    monkeypatch.setenv("JIRA_API_TOKEN", "token")


@pytest.fixture
def workspace(db):
    dono = UserModel.objects.create_user(
        email="dono@t4egroup.com.br", password="x", full_name="Dono", is_active=True
    )
    UserModel.objects.create_user(
        email="dev@t4egroup.com.br", password="x", full_name="Dev Conhecido", is_active=True
    )
    UserModel.objects.create_user(
        email="sememail@t4egroup.com.br", password="x", full_name="Dev Sem Email", is_active=True
    )
    return WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)


@pytest.mark.django_db
def test_importa_projeto_e_cards(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    projeto = ProjectModel.objects.get(external_key="GES")
    assert projeto.name == "Gestum"
    assert projeto.workspace_id == workspace.id
    assert projeto.cards.count() == len(ISSUES)


@pytest.mark.django_db
def test_preserva_numeracao_e_traduz_tipo(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    # A referência da origem continua legível: GES-37 vira o card 37.
    tarefa = CardModel.objects.get(external_key="GES-37")
    assert tarefa.number == 37
    assert tarefa.type == "chore"
    assert tarefa.points == 5
    assert CardModel.objects.get(external_key="GES-40").type == "bug"
    assert CardModel.objects.get(external_key="GES-1").type == "epic"


@pytest.mark.django_db
def test_liga_hierarquia_mesmo_com_pai_fora_de_ordem(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    tarefa = CardModel.objects.get(external_key="GES-37")
    subtarefa = CardModel.objects.get(external_key="GES-38")
    # Pai do tipo épico vira `epic`; pai comum vira `parent`. Confundir os dois
    # jogaria a subtarefa para a raiz do board.
    assert tarefa.epic and tarefa.epic.external_key == "GES-1"
    assert tarefa.parent is None
    assert subtarefa.parent and subtarefa.parent.external_key == "GES-37"
    assert subtarefa.epic is None


@pytest.mark.django_db
def test_responsavel_sem_conta_nao_some(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    conhecido = CardModel.objects.get(external_key="GES-37")
    assert conhecido.assignee and conhecido.assignee.email == "dev@t4egroup.com.br"
    assert conhecido.external_assignee == ""

    # Sem conta aqui: o card fica sem responsável, mas o nome é preservado —
    # senão a informação de quem cuidava do card se perderia na migração.
    de_fora = CardModel.objects.get(external_key="GES-38")
    assert de_fora.assignee is None
    assert de_fora.external_assignee == "Alguém de Fora"


@pytest.mark.django_db
def test_responsavel_sem_email_casa_por_nome_exato(jira_falso, workspace):
    """Jira Cloud some com o e-mail do assignee quando a pessoa marca "esconder
    e-mail" nas preferências — mesmo tendo conta aqui, o casamento por e-mail
    nunca bateria. O nome exato é o único sinal que sobra."""
    call_command("import_jira", workspace="t4e")

    card = CardModel.objects.get(external_key="GES-42")
    assert card.assignee and card.assignee.email == "sememail@t4egroup.com.br"
    assert card.external_assignee == ""


@pytest.mark.django_db
def test_cria_status_do_projeto_pela_categoria(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    projeto = ProjectModel.objects.get(external_key="GES")
    categorias = dict(
        WorkflowStatusModel.objects.filter(project=projeto).values_list("slug", "category")
    )
    # Nome de status é livre em cada projeto; a categoria é o que se traduz.
    assert categorias["itens-pendentes"] == "todo"
    assert categorias["em-andamento"] == "doing"
    assert categorias["concluído"] == "done"


@pytest.mark.django_db
def test_importa_sprint_uma_vez_so(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    sprints = SprintModel.objects.filter(external_key="785")
    assert sprints.count() == 1
    assert sprints.first().status == "active"
    assert CardModel.objects.get(external_key="GES-37").sprint_id == sprints.first().id


@pytest.mark.django_db
def test_reimportar_atualiza_em_vez_de_duplicar(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")
    call_command("import_jira", workspace="t4e")

    # É o que permite rodar de novo depois de ajustar o mapeamento, sem limpar
    # o banco no meio.
    assert ProjectModel.objects.filter(external_key="GES").count() == 1
    assert CardModel.objects.filter(external_key="GES-37").count() == 1
    assert CardModel.objects.count() == len(ISSUES)


@pytest.mark.django_db
def test_dry_run_nao_grava(jira_falso, workspace):
    call_command("import_jira", workspace="t4e", dry_run=True)

    assert ProjectModel.objects.count() == 0
    assert CardModel.objects.count() == 0


class TestAdfParaTexto:
    """O corpo do card vem em ADF (JSON aninhado). Sem conversão, o card
    chegaria com um dicionário no lugar da descrição."""

    def test_paragrafo_e_marcas(self):
        doc = {"type": "doc", "content": [
            {"type": "paragraph", "content": [
                {"type": "text", "text": "Fluxo "},
                {"type": "text", "text": "urgente", "marks": [{"type": "strong"}]},
                {"type": "text", "text": " no "},
                {"type": "text", "text": "checkout", "marks": [{"type": "code"}]},
            ]},
        ]}
        assert import_jira.adf_to_text(doc).strip() == "Fluxo **urgente** no `checkout`"

    def test_lista_titulo_e_codigo(self):
        doc = {"type": "doc", "content": [
            {"type": "heading", "attrs": {"level": 2},
             "content": [{"type": "text", "text": "Critérios"}]},
            {"type": "bulletList", "content": [
                {"type": "listItem", "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "emitir carnê"}]}]},
                {"type": "listItem", "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "gerar boleto"}]}]},
            ]},
            {"type": "codeBlock", "content": [{"type": "text", "text": "npm run build"}]},
        ]}
        saida = import_jira.adf_to_text(doc)
        assert "## Critérios" in saida
        assert "- emitir carnê" in saida and "- gerar boleto" in saida
        assert "```\nnpm run build\n```" in saida

    def test_link_e_anexo(self):
        doc = {"type": "doc", "content": [
            {"type": "paragraph", "content": [
                {"type": "text", "text": "spec",
                 "marks": [{"type": "link", "attrs": {"href": "https://x.com/a"}}]}]},
            {"type": "mediaSingle", "content": [{"type": "media", "attrs": {}}]},
        ]}
        saida = import_jira.adf_to_text(doc)
        assert "[spec](https://x.com/a)" in saida
        # O anexo não vem junto, mas some sem deixar rastro seria pior.
        assert "[anexo no Jira]" in saida

    def test_vazio_nao_quebra(self):
        assert import_jira.adf_to_text(None) == ""
        assert import_jira.adf_to_text({"type": "doc", "content": []}) == ""


@pytest.mark.django_db
def test_resolucao_e_data_andam_juntas(jira_falso, workspace):
    """`resolution` sem `resolved_at` (ou o contrário) derruba a validação do
    card — e, com ela, a listagem inteira do board."""
    call_command("import_jira", workspace="t4e")

    resolvido = CardModel.objects.get(external_key="GES-50")
    assert resolvido.resolution == "done"
    assert resolvido.resolved_at is not None

    # Só a data veio do Jira: o desfecho é completado, senão o card fica inválido.
    meio = CardModel.objects.get(external_key="GES-51")
    assert meio.resolution == "done"
    assert meio.resolved_at is not None

    aberto = CardModel.objects.get(external_key="GES-40")
    assert aberto.resolution == ""
    assert aberto.resolved_at is None


@pytest.mark.django_db
def test_epico_nao_recebe_pai(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    epico = CardModel.objects.get(external_key="GES-1")
    assert epico.parent is None and epico.epic is None


@pytest.mark.django_db
def test_tudo_que_foi_importado_passa_na_validacao_do_dominio(jira_falso, workspace):
    """Rede de segurança, e ela precisa cobrir TODAS as entidades.

    Gravar direto no banco pula as validações do domínio: `choices` do Django
    não barra valor inválido no save(), o erro só aparece na leitura — e aí
    derruba o endpoint inteiro, não só a linha ruim. Primeiro foi card com data
    de resolução sem desfecho; depois sprint com status fora do enum. Cobrir só
    card deixaria a próxima passar igual.
    """
    from contexts.projects.infrastructure.django.repositories_impl import (
        _card_to_entity,
        _sprint_to_entity,
        _to_entity,
    )

    call_command("import_jira", workspace="t4e")

    # A validação roda no __post_init__: construir a entidade já é o teste.
    for projeto in ProjectModel.objects.all():
        _to_entity(projeto)
    for sprint in SprintModel.objects.all():
        _sprint_to_entity(sprint)
    for card in CardModel.objects.all():
        _card_to_entity(card)


@pytest.mark.django_db
def test_sprint_encerrada_usa_o_estado_do_enum(jira_falso, workspace):
    call_command("import_jira", workspace="t4e")

    assert SprintModel.objects.get(external_key="786").status == "closed"
    assert SprintModel.objects.get(external_key="785").status == "active"


@pytest.mark.django_db
def test_reimportar_corrige_dado_gravado_errado(jira_falso, workspace):
    """Idempotência não é só "não duplicar": tem que consertar o que já entrou
    torto, senão um bug de mapeamento fica preso no banco para sempre."""
    call_command("import_jira", workspace="t4e")

    sprint = SprintModel.objects.get(external_key="786")
    SprintModel.objects.filter(pk=sprint.pk).update(status="planned", name="Errado")

    call_command("import_jira", workspace="t4e")

    sprint.refresh_from_db()
    assert sprint.status == "closed"
    assert sprint.name == "GES Sprint 0"


# ── Colunas espelhando o quadro do Jira ──────────────────────────────────────

def _board_issue(key: str, titulo: str, status_id: str, status_nome: str, categoria: str) -> dict:
    """Igual a `_issue`, mas com `id` no status — é por `id` que o import
    resolve a coluna do quadro (o nome sozinho não é confiável no Jira)."""
    issue = _issue(key, "Tarefa", titulo, status_nome, categoria)
    issue["fields"]["status"]["id"] = status_id
    return issue


BOARD_ISSUES = [
    _board_issue("PIT-1", "Primeiro da fila", "1", "A Fazer", "new"),
    _board_issue("PIT-2", "Segundo da fila", "1", "A Fazer", "new"),
    _board_issue("PIT-3", "Trabalhando nisso", "2", "Em andamento", "indeterminate"),
    _board_issue("PIT-4", "Revisando", "3", "Code Review", "indeterminate"),
]


@pytest.fixture
def jira_falso_com_board(monkeypatch):
    def fake_get(self, path, **params):
        if path.endswith("/field"):
            return []
        if path.endswith("/project/search"):
            return {"values": [{"key": "PIT", "name": "PitStopRH", "description": ""}]}
        if path.endswith("/project/PIT/statuses"):
            return [
                {"statuses": [
                    {"id": "1", "statusCategory": {"key": "new"}},
                    {"id": "2", "statusCategory": {"key": "indeterminate"}},
                    {"id": "3", "statusCategory": {"key": "indeterminate"}},
                ]},
            ]
        if path.endswith("/board"):
            return {"values": [{"id": 42}]}
        if path.endswith("/board/42/configuration"):
            return {
                "columnConfig": {
                    "columns": [
                        {"name": "Fila", "statuses": [{"id": "1"}]},
                        {"name": "Em andamento", "statuses": [{"id": "2"}]},
                        {"name": "Code Review", "statuses": [{"id": "3"}]},
                    ]
                }
            }
        raise AssertionError(f"endpoint inesperado: {path}")

    monkeypatch.setattr(import_jira.Command, "_get", fake_get)
    monkeypatch.setattr(import_jira.Command, "_search", lambda self, jql, fields: BOARD_ISSUES)
    monkeypatch.setenv("JIRA_URL", "https://exemplo.atlassian.net")
    monkeypatch.setenv("JIRA_EMAIL", "eu@t4egroup.com.br")
    monkeypatch.setenv("JIRA_API_TOKEN", "token")


@pytest.mark.django_db
def test_colunas_espelham_nome_e_ordem_do_quadro_jira(jira_falso_com_board, workspace):
    call_command("import_jira", workspace="t4e")

    colunas = list(WorkflowStatusModel.objects.filter(project__external_key="PIT").order_by("order"))
    assert [c.name for c in colunas] == ["Fila", "Em andamento", "Code Review"]
    assert [c.order for c in colunas] == [0, 1, 2]


@pytest.mark.django_db
def test_is_working_liga_so_na_coluna_de_andamento_nao_em_review(jira_falso_com_board, workspace):
    call_command("import_jira", workspace="t4e")

    por_nome = {
        c.name: c.is_working
        for c in WorkflowStatusModel.objects.filter(project__external_key="PIT")
    }
    assert por_nome["Em andamento"] is True
    assert por_nome["Fila"] is False
    assert por_nome["Code Review"] is False


@pytest.mark.django_db
def test_cards_mantem_a_ordem_do_rank_do_jira_dentro_da_coluna(jira_falso_com_board, workspace):
    call_command("import_jira", workspace="t4e")

    fila = list(
        CardModel.objects.filter(project__external_key="PIT", status="fila").order_by("order")
    )
    assert [c.external_key for c in fila] == ["PIT-1", "PIT-2"]
    assert [c.order for c in fila] == [0, 1]


@pytest.mark.django_db
def test_coluna_orfa_sem_card_nenhum_e_removida(jira_falso_com_board, workspace):
    """Quadro do Jira mudou de coluna (ou a gente passou a espelhar ele agora
    pela primeira vez): a coluna antiga, sem card nenhum apontando pra ela,
    não pode sobrar fantasma no board."""
    call_command("import_jira", workspace="t4e")
    projeto = ProjectModel.objects.get(external_key="PIT")
    WorkflowStatusModel.objects.create(
        project=projeto, name="Coluna Antiga", slug="coluna-antiga",
        category="doing", order=99,
    )

    call_command("import_jira", workspace="t4e")

    assert not WorkflowStatusModel.objects.filter(project=projeto, slug="coluna-antiga").exists()


@pytest.mark.django_db
def test_coluna_com_card_manual_nao_e_apagada(jira_falso_com_board, workspace):
    """Card criado direto no T4E Office (fora do Jira) fica numa coluna que o
    quadro do Jira não conhece — reimportar não pode apagar essa coluna e
    deixar o card sem lugar nenhum pra aparecer."""
    call_command("import_jira", workspace="t4e")
    projeto = ProjectModel.objects.get(external_key="PIT")
    WorkflowStatusModel.objects.create(
        project=projeto, name="Ideias", slug="ideias", category="todo", order=99,
    )
    CardModel.objects.create(project=projeto, number=500, title="Card manual", status="ideias")

    call_command("import_jira", workspace="t4e")

    assert WorkflowStatusModel.objects.filter(project=projeto, slug="ideias").exists()
