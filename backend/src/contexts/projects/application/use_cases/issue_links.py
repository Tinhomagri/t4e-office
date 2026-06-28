"""Casos de uso de vínculos entre cards (criar, listar, remover)."""
from contexts.projects.domain.entities.issue_link import IssueLink, LinkType
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.issue_link_repository import (
    IssueLinkRepository,
)
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import (
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)


class _Base:
    def __init__(
        self,
        project_repository: ProjectRepository,
        card_repository: CardRepository,
        link_repository: IssueLinkRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.card_repository = card_repository
        self.link_repository = link_repository
        self.workspace_access = workspace_access

    def _assert_access(self, *, card_id: str, actor_id: str):
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
        return card, project


class CreateIssueLink(_Base):
    """Cria vínculo direcional source → target, mesmo projeto."""

    def execute(
        self, *, source_id: str, target_id: str, link_type: str, actor_id: str
    ) -> IssueLink:
        source, project = self._assert_access(card_id=source_id, actor_id=actor_id)
        target = self.card_repository.get(card_id=target_id)
        if target is None:
            raise NotFoundError("Card de destino não encontrado.")
        if target.project_id != source.project_id:
            raise ValidationError("Só é possível vincular cards do mesmo projeto.")
        if self.link_repository.exists(
            source_id=source_id, target_id=target_id, link_type=link_type
        ):
            raise ValidationError("Esse vínculo já existe.")
        link = IssueLink(
            id=None,
            source_id=source_id,
            target_id=target_id,
            link_type=LinkType(link_type),
        )
        return self.link_repository.create(link=link)


class ListIssueLinks(_Base):
    """Lista vínculos de um card (origem ou destino)."""

    def execute(self, *, card_id: str, actor_id: str) -> list[IssueLink]:
        self._assert_access(card_id=card_id, actor_id=actor_id)
        return self.link_repository.list_for_card(card_id=card_id)


class DeleteIssueLink(_Base):
    """Remove um vínculo, validando acesso pelo card de origem."""

    def execute(self, *, link_id: str, actor_id: str) -> None:
        link = self.link_repository.get(link_id=link_id)
        if link is None:
            raise NotFoundError("Vínculo não encontrado.")
        self._assert_access(card_id=link.source_id, actor_id=actor_id)
        self.link_repository.delete(link_id=link_id)
