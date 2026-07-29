"""Testes do caso de uso active_card: card doing mais recente, has-not-card,
e a checagem de dono na hora de editar a observação."""
import pytest

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.presence.application.active_card import (
    get_active_card,
    update_working_note,
)
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    ProjectModel,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Ana Owner", is_active=True
    )
    dev = UserModel.objects.create_user(
        email="bob@t4e.com", password="x", full_name="Bob Dev", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=dev, role="member")
    project = ProjectModel.objects.create(workspace=ws, name="Mia", key="MIA")
    return {"owner": owner, "dev": dev, "ws": ws, "project": project}


def _move_to_doing(card, author):
    card.status = "doing"
    card.save(update_fields=["status"])
    CardHistoryModel.objects.create(
        card=card, author=author, field="status", old_value="todo", new_value="doing"
    )


def test_sem_card_doing_retorna_none(scenario):
    assert get_active_card(workspace_id=str(scenario["ws"].id), user_id=str(scenario["dev"].id)) is None


def test_card_doing_mais_recente_vence(scenario):
    dev = scenario["dev"]
    project = scenario["project"]
    card_antigo = CardModel.objects.create(project=project, number=1, title="Antigo", assignee=dev)
    _move_to_doing(card_antigo, dev)
    card_novo = CardModel.objects.create(project=project, number=2, title="Novo", assignee=dev)
    _move_to_doing(card_novo, dev)

    result = get_active_card(workspace_id=str(scenario["ws"].id), user_id=str(dev.id))

    assert result is not None
    assert result["active"] is True
    assert result["card"]["title"] == "Novo"
    assert result["card"]["number"] == 2
    assert result["card"]["project"] == "MIA"
    assert result["working_note"] == ""
    assert "doing_since" in result


def test_ordem_de_transicao_vence_mesmo_com_ordem_de_criacao_invertida(scenario):
    """Prova que o código lê CardHistoryModel transition timestamps,
    não ordem de criação ou card id. Cria cards em uma ordem (a, b)
    mas transiciona para doing em ordem reversa (b primeiro, a segundo).
    Card a deve vencer porque sua transição para doing é mais recente."""
    dev = scenario["dev"]
    project = scenario["project"]
    card_a = CardModel.objects.create(project=project, number=1, title="Card A", assignee=dev)
    card_b = CardModel.objects.create(project=project, number=2, title="Card B", assignee=dev)
    # Transicionar em ordem reversa: b primeiro, depois a
    _move_to_doing(card_b, dev)
    _move_to_doing(card_a, dev)

    result = get_active_card(workspace_id=str(scenario["ws"].id), user_id=str(dev.id))

    assert result is not None
    assert result["active"] is True
    assert result["card"]["title"] == "Card A"
    assert result["card"]["number"] == 1
    assert result["card"]["project"] == "MIA"
    assert result["working_note"] == ""
    assert "doing_since" in result


def test_working_note_aparece_no_resultado(scenario):
    dev = scenario["dev"]
    card = CardModel.objects.create(
        project=scenario["project"], number=1, title="X", assignee=dev,
        working_note="travado esperando review",
    )
    _move_to_doing(card, dev)

    result = get_active_card(workspace_id=str(scenario["ws"].id), user_id=str(dev.id))

    assert result["working_note"] == "travado esperando review"


def test_update_working_note_pelo_assignee_funciona(scenario):
    dev = scenario["dev"]
    card = CardModel.objects.create(project=scenario["project"], number=1, title="X", assignee=dev)

    update_working_note(card_id=str(card.id), user_id=str(dev.id), note="quase lá")

    card.refresh_from_db()
    assert card.working_note == "quase lá"


def test_update_working_note_por_outro_usuario_falha(scenario):
    card = CardModel.objects.create(
        project=scenario["project"], number=1, title="X", assignee=scenario["dev"]
    )

    with pytest.raises(PermissionDeniedError):
        update_working_note(card_id=str(card.id), user_id=str(scenario["owner"].id), note="x")


def test_update_working_note_por_ex_membro_falha(scenario):
    """Assignee que foi REMOVIDO do workspace (membership apagada) não pode
    mais editar a observação, mesmo continuando como responsável do card."""
    dev = scenario["dev"]
    card = CardModel.objects.create(
        project=scenario["project"], number=1, title="X", assignee=dev
    )
    MembershipModel.objects.filter(workspace=scenario["ws"], user=dev).delete()

    with pytest.raises(PermissionDeniedError):
        update_working_note(card_id=str(card.id), user_id=str(dev.id), note="ainda edito?")

    card.refresh_from_db()
    assert card.working_note == ""


def test_update_working_note_card_inexistente_falha(scenario):
    with pytest.raises(NotFoundError):
        update_working_note(
            card_id="00000000-0000-0000-0000-000000000000",
            user_id=str(scenario["dev"].id),
            note="x",
        )


def test_card_ativo_de_outro_workspace_nao_vaza(scenario):
    """Dev é membro dos workspaces A (scenario['ws']) e B. Ele tem um card
    'doing' só no workspace B. Consultar get_active_card com o workspace A
    não deve retornar o card de B — prova que a query é escopada por
    workspace e não vaza dados entre workspaces do mesmo usuário."""
    dev = scenario["dev"]
    owner = scenario["owner"]
    ws_a = scenario["ws"]
    ws_b = WorkspaceModel.objects.create(name="WS B", slug="ws-b", owner=owner)
    project_b = ProjectModel.objects.create(workspace=ws_b, name="Nia", key="NIA")
    card_b = CardModel.objects.create(
        project=project_b, number=1, title="Card em B", assignee=dev
    )
    _move_to_doing(card_b, dev)

    result = get_active_card(workspace_id=str(ws_a.id), user_id=str(dev.id))

    assert result is None
