"""Caso de uso: criação de sprint dentro de um projeto."""
from datetime import date

from contexts.projects.domain.entities.sprint import Sprint, SprintStatus
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from contexts.projects.domain.repositories.sprint_repository import SprintRepository
from shared.domain.errors import NotFoundError, PermissionDeniedError


class CreateSprint:
    """Cria uma sprint, validando acesso ao workspace dono do projeto."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        sprint_repository: SprintRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.sprint_repository = sprint_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        project_id: str,
        name: str,
        actor_id: str,
        goal: str = "",
        start_date: date | None = None,
        end_date: date | None = None,
        duration_days: int | None = None,
    ) -> Sprint:
        project = self.project_repository.get(project_id=project_id)
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=project.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este projeto.")

        sprint = Sprint(
            id=None,
            project_id=project_id,
            name=name,
            goal=goal,
            start_date=start_date,
            end_date=end_date,
            duration_days=duration_days,
            status=SprintStatus.PLANNED,
        )
        # Com duração e data de início, o término é consequência — quem está
        # planejando já vê a janela fechada na lista, sem iniciar a sprint.
        if duration_days and start_date and end_date is None:
            sprint.start_date, sprint.end_date = sprint.window_from(start_date)
            sprint.__post_init__()
        return self.sprint_repository.create(sprint=sprint)
