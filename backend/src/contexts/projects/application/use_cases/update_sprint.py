"""Caso de uso: edição de sprint (nome, meta, datas).

Mudar o status (iniciar/concluir) NÃO passa por aqui — ver
`interface/api/sprint_lifecycle.py`, que valida, grava início/fim e decide o
destino dos cards abertos."""
from contexts.projects.domain.entities.sprint import Sprint
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
    """Atualiza campos de uma sprint; só altera o que for informado."""

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
        duration_days=_UNSET,
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
        if duration_days is not _UNSET:
            sprint.duration_days = duration_days

        # Mudar a duração reposiciona o término, mas só quando quem chamou não
        # mandou uma data de término junto: aí a data explícita é a intenção, e
        # recalcular por cima dela ignoraria o que foi pedido.
        if (
            duration_days is not _UNSET
            and sprint.duration_days
            and sprint.start_date
            and end_date is _UNSET
        ):
            sprint.start_date, sprint.end_date = sprint.window_from(sprint.start_date)

        # Revalida invariantes do domínio após a mutação.
        sprint.__post_init__()
        return self.sprint_repository.update(sprint=sprint)
