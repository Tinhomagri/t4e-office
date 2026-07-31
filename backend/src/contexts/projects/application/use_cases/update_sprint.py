"""Caso de uso: atualização de sprint (editar, iniciar, encerrar)."""
from contexts.projects.domain.entities.card import CardStatus
from contexts.projects.domain.entities.sprint import Sprint, SprintStatus
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from contexts.projects.domain.repositories.sprint_repository import SprintRepository
from shared.domain.errors import NotFoundError, PermissionDeniedError

# Sentinela para distinguir "campo ausente" de "campo definido como None".
_UNSET = object()


class UpdateSprint:
    """Atualiza campos de uma sprint; só altera o que for informado.

    Ao mudar o status para `active`, garante no máximo uma sprint ativa por
    projeto (encerra as demais ativas).
    """

    def __init__(
        self,
        project_repository: ProjectRepository,
        sprint_repository: SprintRepository,
        workspace_access: WorkspaceAccess,
        card_repository: CardRepository,
    ):
        self.project_repository = project_repository
        self.sprint_repository = sprint_repository
        self.workspace_access = workspace_access
        self.card_repository = card_repository

    def execute(
        self,
        *,
        sprint_id: str,
        actor_id: str,
        name=_UNSET,
        goal=_UNSET,
        start_date=_UNSET,
        end_date=_UNSET,
        status=_UNSET,
    ) -> Sprint:
        sprint = self.sprint_repository.get(sprint_id=sprint_id)
        if sprint is None:
            raise NotFoundError("Sprint não encontrada.")
        project = self.project_repository.get(project_id=sprint.project_id)
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=project.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a esta sprint.")

        if name is not _UNSET:
            sprint.name = name
        if goal is not _UNSET:
            sprint.goal = goal
        if start_date is not _UNSET:
            sprint.start_date = start_date
        if end_date is not _UNSET:
            sprint.end_date = end_date
        if status is not _UNSET:
            sprint.status = SprintStatus(status)

        # Revalida invariantes do domínio após a mutação.
        sprint.__post_init__()
        updated = self.sprint_repository.update(sprint=sprint)

        # Regra: uma sprint ativa por projeto.
        if updated.status == SprintStatus.ACTIVE:
            self.sprint_repository.clear_active(
                project_id=updated.project_id, except_id=updated.id
            )

        # Ao encerrar: cards não concluídos voltam ao backlog do projeto.
        # Cards `done` permanecem na sprint (histórico para relatórios).
        if updated.status == SprintStatus.CLOSED:
            cards = self.card_repository.list_by_project(
                project_id=updated.project_id
            )
            for card in cards:
                if card.sprint_id == updated.id and card.status != CardStatus.DONE.value:
                    card.sprint_id = None
                    card.status = CardStatus.BACKLOG.value
                    self.card_repository.update(card=card)
        return updated
