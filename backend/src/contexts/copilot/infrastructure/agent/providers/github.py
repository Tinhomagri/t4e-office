"""Ferramentas de código: pull requests e atividade de repositório por projeto.

Só leitura, e só do que os webhooks já gravaram no banco — nenhuma chamada à
API do GitHub dentro do loop da IA, para não pendurar o chat numa rede lenta
nem gastar rate limit por pergunta.
"""
from __future__ import annotations

from contexts.copilot.infrastructure.agent.base import ReadOnlyProvider, tool
from contexts.copilot.infrastructure.agent.providers.projects import ProjectsProvider
from contexts.github.application import read_services
from shared.domain.errors import ValidationError


class GithubProvider(ReadOnlyProvider):
    """Visão de desenvolvimento de um projeto para o agente."""

    domain = "gh"

    def __init__(self, *, workspace_id: str, actor_id: str, projects: ProjectsProvider):
        self.workspace_id = workspace_id
        self.actor_id = actor_id
        self._projects = projects

    def read_tools(self) -> list[dict]:
        return [
            tool(
                "gh_list_pull_requests",
                "Pull requests vinculados aos cards de um projeto (título, "
                "estado, autor, branch, última atualização). Use para saber o "
                "que está em revisão ou travado antes de recomendar prioridade.",
                {
                    "project_id": {"type": "string"},
                    "state": {
                        "type": "string",
                        "enum": ["open", "merged", "closed"],
                        "description": "Omita para trazer todos.",
                    },
                },
                ["project_id"],
            ),
            tool(
                "gh_repo_activity",
                "Atividade recente do repositório do projeto: commits e branches "
                "ligados a cards, mais o resumo de PRs por estado.",
                {"project_id": {"type": "string"}},
                ["project_id"],
            ),
        ]

    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            raise ValidationError(f"Ferramenta desconhecida: {name}")
        return handler(args or {})

    def _read_gh_list_pull_requests(self, args: dict) -> dict:
        project = self._projects.project_or_raise(args["project_id"])
        prs = read_services.project_pull_requests(
            str(project.id), state=args.get("state", "") or ""
        )
        return {"project_key": project.key, "pull_requests": prs, "total": len(prs)}

    def _read_gh_repo_activity(self, args: dict) -> dict:
        project = self._projects.project_or_raise(args["project_id"])
        metrics = read_services.project_dev_metrics(str(project.id), recent_limit=5)
        activity = read_services.project_repo_activity(str(project.id))
        return {
            "project_key": project.key,
            "repos": activity["repos"],
            "prs": metrics["prs"],
            "linked_cards": metrics["linked_cards"],
            "recent_activity": activity["activity"],
        }
