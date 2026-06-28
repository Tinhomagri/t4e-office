"""Caso de uso: atualização de card (editar, mover de coluna, atribuir)."""
from contexts.projects.domain.entities.card import (
    Card,
    CardPriority,
    CardStatus,
    CardType,
)
from contexts.projects.domain.entities.history import CardHistoryEntry
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.history_repository import HistoryRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError

# Sentinela para distinguir "campo ausente" de "campo definido como None".
_UNSET = object()

# Campos rastreados no histórico de atividade (linha do tempo estilo Jira).
_TRACKED = [
    "title",
    "status",
    "type",
    "priority",
    "points",
    "assignee_id",
    "reporter_id",
    "sprint_id",
    "start_date",
    "due_date",
    "parent_id",
    "labels",
]


def _repr(card: Card) -> dict[str, str]:
    """Representação textual dos campos rastreados (para diff de histórico)."""
    return {
        "title": card.title,
        "status": card.status.value,
        "type": card.type.value,
        "priority": card.priority.value,
        "points": "" if card.points is None else str(card.points),
        "assignee_id": card.assignee_id or "",
        "reporter_id": card.reporter_id or "",
        "sprint_id": card.sprint_id or "",
        "start_date": "" if card.start_date is None else str(card.start_date),
        "due_date": "" if card.due_date is None else str(card.due_date),
        "parent_id": card.parent_id or "",
        "labels": ", ".join(card.labels),
    }


class UpdateCard:
    """Atualiza campos de um card; só altera o que for informado.

    Registra cada campo alterado no histórico de atividade.
    """

    def __init__(
        self,
        project_repository: ProjectRepository,
        card_repository: CardRepository,
        workspace_access: WorkspaceAccess,
        history_repository: HistoryRepository,
    ):
        self.project_repository = project_repository
        self.card_repository = card_repository
        self.workspace_access = workspace_access
        self.history_repository = history_repository

    def execute(
        self,
        *,
        card_id: str,
        actor_id: str,
        title=_UNSET,
        description=_UNSET,
        status=_UNSET,
        type=_UNSET,
        priority=_UNSET,
        points=_UNSET,
        assignee_id=_UNSET,
        reporter_id=_UNSET,
        sprint_id=_UNSET,
        start_date=_UNSET,
        due_date=_UNSET,
        order=_UNSET,
        parent_id=_UNSET,
        labels=_UNSET,
    ) -> Card:
        card = self.card_repository.get(card_id=card_id)
        if card is None:
            raise NotFoundError("Card não encontrado.")
        project = self.project_repository.get(project_id=card.project_id)
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=project.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este card.")

        before = _repr(card)

        if title is not _UNSET:
            card.title = title
        if description is not _UNSET:
            card.description = description
        if status is not _UNSET:
            card.status = CardStatus(status)
        if type is not _UNSET:
            card.type = CardType(type)
        if priority is not _UNSET:
            card.priority = CardPriority(priority)
        if points is not _UNSET:
            card.points = points
        if assignee_id is not _UNSET:
            card.assignee_id = assignee_id
        if reporter_id is not _UNSET:
            card.reporter_id = reporter_id
        if sprint_id is not _UNSET:
            card.sprint_id = sprint_id
        if start_date is not _UNSET:
            card.start_date = start_date
        if due_date is not _UNSET:
            card.due_date = due_date
        if order is not _UNSET:
            card.order = order
        if parent_id is not _UNSET:
            card.parent_id = parent_id
        if labels is not _UNSET:
            card.labels = labels

        # Revalida invariantes do domínio após a mutação.
        card.__post_init__()
        updated = self.card_repository.update(card=card)

        # Diff e registro de histórico para campos rastreados.
        after = _repr(updated)
        for field in _TRACKED:
            if before[field] != after[field]:
                self.history_repository.add(
                    entry=CardHistoryEntry(
                        id=None,
                        card_id=card_id,
                        author_id=actor_id,
                        field=field,
                        old_value=before[field],
                        new_value=after[field],
                    )
                )

        return updated
