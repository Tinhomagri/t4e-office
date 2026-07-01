"""Caso de uso: adicionar comentário a um card."""
from contexts.projects.domain.entities.comment import CardComment
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.comment_repository import CommentRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


class CreateComment:
    """Cria um comentário num card validando acesso ao workspace."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        card_repository: CardRepository,
        comment_repository: CommentRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.card_repository = card_repository
        self.comment_repository = comment_repository
        self.workspace_access = workspace_access

    def execute(self, *, card_id: str, actor_id: str, body: str) -> CardComment:
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

        comment = CardComment(
            id=None, card_id=card_id, author_id=actor_id, body=body
        )
        return self.comment_repository.create(comment=comment)
