"""Caso de uso: transformar tarefas sugeridas pela IA em cards reais."""
from contexts.copilot.domain.ports.task_creator import CreatedTask, TaskCreator


class CreateTasksFromAnalysis:
    """Cria um card por tarefa selecionada pelo usuário."""

    def __init__(self, task_creator: TaskCreator):
        self.task_creator = task_creator

    def execute(
        self, *, project_id: str, actor_id: str, tasks: list[dict]
    ) -> list[CreatedTask]:
        created: list[CreatedTask] = []
        for t in tasks:
            created.append(
                self.task_creator.create(
                    project_id=project_id,
                    actor_id=actor_id,
                    title=t["title"],
                    description=t.get("description", ""),
                    priority=t.get("priority", "medium"),
                    type=t.get("type", "feature"),
                )
            )
        return created
