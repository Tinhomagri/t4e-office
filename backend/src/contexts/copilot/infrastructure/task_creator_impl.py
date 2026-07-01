"""Implementação do TaskCreator que delega ao caso de uso CreateCard de projects."""
from contexts.copilot.domain.ports.task_creator import CreatedTask, TaskCreator
from contexts.projects.application.use_cases.create_card import CreateCard
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoCardRepository,
    DjangoProjectRepository,
    DjangoWorkspaceAccess,
)


class ProjectsTaskCreator(TaskCreator):
    """Cria cards reais reaproveitando o contexto projects (sem duplicar regra)."""

    def create(
        self,
        *,
        project_id: str,
        actor_id: str,
        title: str,
        description: str,
        priority: str,
        type: str,
    ) -> CreatedTask:
        projects = DjangoProjectRepository()
        use_case = CreateCard(projects, DjangoCardRepository(), DjangoWorkspaceAccess())
        card = use_case.execute(
            project_id=project_id,
            actor_id=actor_id,
            title=title,
            description=description,
            priority=priority,
            type=type,
            source="copilot",
        )
        project = projects.get(project_id=project_id)
        ref = f"{project.key}-{card.number}" if project else str(card.number)
        return CreatedTask(id=str(card.id), ref=ref, title=card.title)
