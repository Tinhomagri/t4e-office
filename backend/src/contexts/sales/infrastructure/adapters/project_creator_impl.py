"""Adaptador que cria o projeto de entrega via API pública do contexto projects.

Fronteira: este módulo é o único ponto de `sales` que fala com `projects`, e fala
apenas com o caso de uso `CreateProject` (camada de aplicação) — nunca com models.
A resolução de colisão de chave é feita reagindo ao `ConflictError` público do
caso de uso, sem consultar a base de `projects` diretamente.
"""
import re

from contexts.projects.application.use_cases.create_project import CreateProject
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from contexts.sales.domain.ports.project_creator import CreatedProject, ProjectCreator
from shared.domain.errors import ConflictError

_MAX_KEY_ATTEMPTS = 20


def normalize_key(value: str, fallback: str = "DEAL") -> str:
    """Deriva uma chave de projeto (2–10 alfanuméricos maiúsculos) de um texto."""
    key = re.sub(r"[^A-Za-z0-9]", "", value or "").upper()[:10]
    if len(key) < 2:
        key = fallback
    return key


class ProjectsProjectCreator(ProjectCreator):
    """Cria o projeto de entrega chamando o caso de uso `create_project`."""

    def __init__(
        self,
        *,
        project_repository: ProjectRepository,
        workspace_access: WorkspaceAccess,
    ):
        self._use_case = CreateProject(
            project_repository=project_repository,
            workspace_access=workspace_access,
        )

    def create(
        self, *, workspace_id: str, name: str, key_hint: str, actor_id: str
    ) -> CreatedProject:
        base = normalize_key(key_hint)
        for attempt in range(_MAX_KEY_ATTEMPTS):
            # Sufixo numérico a partir da segunda tentativa, respeitando o limite de 10
            if attempt == 0:
                key = base
            else:
                suffix = str(attempt + 1)
                key = f"{base[: 10 - len(suffix)]}{suffix}"
            try:
                result = self._use_case.execute(
                    workspace_id=workspace_id,
                    name=name,
                    key=key,
                    actor_id=actor_id,
                    template="software",
                )
            except ConflictError:
                continue
            return CreatedProject(
                project_id=result.project_id, name=result.name, key=result.key
            )
        raise ConflictError(
            "Não foi possível gerar uma chave livre para o projeto de entrega."
        )
