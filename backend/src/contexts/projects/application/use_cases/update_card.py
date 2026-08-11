"""Caso de uso: atualização de card (editar, mover de coluna, atribuir)."""
from datetime import UTC, datetime

from contexts.projects.domain.entities.card import (
    Card,
    CardPriority,
    CardResolution,
    CardType,
)
from contexts.projects.domain.entities.history import CardHistoryEntry
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.history_repository import HistoryRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from contexts.projects.domain.repositories.workflow_status_repository import (
    StatusCategoryResolver,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError, ValidationError

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
    "epic_id",
    "labels",
    "channel",
    "publish_date",
    "resolution",
    "original_estimate_seconds",
    "remaining_estimate_seconds",
    "archived_at",
]


def _repr(card: Card) -> dict[str, str]:
    """Representação textual dos campos rastreados (para diff de histórico)."""
    return {
        "title": card.title,
        "status": card.status,
        "type": card.type.value,
        "priority": card.priority.value,
        "points": "" if card.points is None else str(card.points),
        "assignee_id": card.assignee_id or "",
        "reporter_id": card.reporter_id or "",
        "sprint_id": card.sprint_id or "",
        "start_date": "" if card.start_date is None else str(card.start_date),
        "due_date": "" if card.due_date is None else str(card.due_date),
        "parent_id": card.parent_id or "",
        "epic_id": card.epic_id or "",
        "labels": ", ".join(card.labels),
        "channel": card.channel,
        "publish_date": "" if card.publish_date is None else str(card.publish_date),
        "resolution": card.resolution.value if card.resolution else "",
        "original_estimate_seconds": (
            "" if card.original_estimate_seconds is None else str(card.original_estimate_seconds)
        ),
        "remaining_estimate_seconds": (
            "" if card.remaining_estimate_seconds is None else str(card.remaining_estimate_seconds)
        ),
        "archived_at": "" if card.archived_at is None else str(card.archived_at),
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
        status_category_resolver: StatusCategoryResolver | None = None,
    ):
        self.project_repository = project_repository
        self.card_repository = card_repository
        self.workspace_access = workspace_access
        self.history_repository = history_repository
        # Opcional: sem ele a resolução automática não roda e o desfecho só muda
        # quando o cliente manda explicitamente.
        self.status_category_resolver = status_category_resolver

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
        epic_id=_UNSET,
        epic_color=_UNSET,
        labels=_UNSET,
        channel=_UNSET,
        publish_date=_UNSET,
        resolution=_UNSET,
        original_estimate_seconds=_UNSET,
        remaining_estimate_seconds=_UNSET,
        archived=_UNSET,
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
            self._assert_status_exists(project_id=card.project_id, status=status)
            card.status = status
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
        if epic_id is not _UNSET:
            card.epic_id = epic_id
        if epic_color is not _UNSET:
            card.epic_color = epic_color
        if labels is not _UNSET:
            card.labels = labels
        if channel is not _UNSET:
            card.channel = channel
        if publish_date is not _UNSET:
            card.publish_date = publish_date
        if original_estimate_seconds is not _UNSET:
            card.original_estimate_seconds = original_estimate_seconds
        if remaining_estimate_seconds is not _UNSET:
            card.remaining_estimate_seconds = remaining_estimate_seconds
        if archived is not _UNSET:
            # Idempotente: rearquivar não reescreve a data original.
            if archived and card.archived_at is None:
                card.archived_at = datetime.now(UTC)
            elif not archived:
                card.archived_at = None

        # Desfecho. O explícito do cliente vence; na ausência dele, mover para uma
        # coluna `done` resolve como entregue e sair dela reabre. `resolved_at`
        # anda sempre junto — o domínio recusa um sem o outro.
        if resolution is not _UNSET:
            card.resolution = CardResolution(resolution) if resolution else None
            card.resolved_at = datetime.now(UTC) if card.resolution else None
        elif status is not _UNSET:
            self._sync_resolution_with_status(card)

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

    def _assert_status_exists(self, *, project_id: str, status: str) -> None:
        """Rejeita slug de coluna que não existe no workflow do projeto.

        O serializer deixou de restringir o status à lista canônica (colunas
        criadas no board têm slug livre), então a checagem real é aqui — sem
        ela um typo mandaria o card para uma coluna que ninguém renderiza.
        """
        if self.status_category_resolver is None:
            return
        category = self.status_category_resolver.category_of(
            project_id=project_id, status=status
        )
        if category is None:
            raise ValidationError(f"A coluna '{status}' não existe neste projeto.")

    def _sync_resolution_with_status(self, card: Card) -> None:
        """Alinha o desfecho à categoria da coluna de destino."""
        if self.status_category_resolver is None:
            return
        category = self.status_category_resolver.category_of(
            project_id=card.project_id, status=card.status
        )
        if category == "done":
            # Não sobrescreve um desfecho já escolhido (ex.: "não será feito"):
            # a pessoa pode arrastar o card para Concluído *depois* de marcar isso.
            if card.resolution is None:
                card.resolution = CardResolution.DONE
                card.resolved_at = datetime.now(UTC)
        elif category is not None and card.resolution is not None:
            card.resolution = None
            card.resolved_at = None
