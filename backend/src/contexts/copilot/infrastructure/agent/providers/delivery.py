"""Ferramentas de saúde da entrega: estimativa e métricas de fluxo.

Duas origens:

* **Estimativa** vem do contexto `estimation` (Planning Poker), via o serviço de
  leitura extraído das views.
* **Métricas de entrega** (velocity, throughput, cards sem dono/estimativa) são
  calculadas aqui a partir de cards e sprints. A tela de Relatórios do frontend
  monta números equivalentes no cliente; não há contexto `reports` no backend,
  então o cálculo do agente vive neste provider — quando `reports` virar um
  contexto de verdade, este arquivo passa a delegar para ele.
"""
from __future__ import annotations

from contexts.copilot.infrastructure.agent.base import ReadOnlyProvider, tool
from contexts.copilot.infrastructure.agent.providers.projects import ProjectsProvider
from contexts.estimation.application import read_services as estimation_reads
from shared.domain.errors import ValidationError

# Colunas que contam como trabalho concluído para velocity/throughput.
_DONE_STATUSES = {"done", "publicado"}


class DeliveryProvider(ReadOnlyProvider):
    """Estimativa e métricas de fluxo do workspace."""

    domain = "dlv"

    def __init__(self, *, workspace_id: str, actor_id: str, projects: ProjectsProvider):
        self.workspace_id = workspace_id
        self.actor_id = actor_id
        self._projects = projects

    def read_tools(self) -> list[dict]:
        return [
            tool(
                "dlv_estimation_status",
                "Estado da estimativa no workspace: salas de Planning Poker "
                "abertas, média de pontos, distribuição e quem mais estima. "
                "Com project_id, lista também os cards sem estimativa desse "
                "projeto. Use para apontar o que impede o planejamento.",
                {"project_id": {"type": "string"}},
            ),
            tool(
                "dlv_delivery_metrics",
                "Métricas de entrega de um projeto: pontos entregues por sprint "
                "(velocity), throughput de cards, trabalho em andamento e "
                "pendências que travam o fluxo (sem dono, sem estimativa, "
                "parados em revisão). Use para responder 'como estamos "
                "entregando' e para embasar risco de prazo.",
                {"project_id": {"type": "string"}},
                ["project_id"],
            ),
        ]

    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            raise ValidationError(f"Ferramenta desconhecida: {name}")
        return handler(args or {})

    def _read_dlv_estimation_status(self, args: dict) -> dict:
        summary = estimation_reads.workspace_summary(self.workspace_id)
        out = {
            "open_sessions": estimation_reads.open_sessions(self.workspace_id),
            "rounds_total": summary["rounds_total"],
            "avg_points": summary["avg_points"],
            "points_distribution": summary["points_distribution"],
            "top_estimators": summary["top_estimators"],
        }
        ref = args.get("project_id")
        if ref:
            project = self._projects.project_or_raise(ref)
            unestimated = [
                {
                    "ref": f"{project.key}-{c.number}",
                    "title": c.title,
                    "status": c.status.value,
                }
                for c in self._projects.list_cards_of(project)
                if not c.points and c.status.value not in _DONE_STATUSES
            ]
            out["project_key"] = project.key
            out["unestimated_cards"] = unestimated
            out["unestimated_count"] = len(unestimated)
        return out

    def _read_dlv_delivery_metrics(self, args: dict) -> dict:
        project = self._projects.project_or_raise(args["project_id"])
        cards = self._projects.list_cards_of(project)
        sprints = self._projects.list_sprints_of(project)

        done = [c for c in cards if c.status.value in _DONE_STATUSES]
        in_progress = [c for c in cards if c.status.value in {"doing", "criacao"}]
        in_review = [c for c in cards if c.status.value in {"review", "aprovacao"}]

        by_sprint = []
        for sprint in sprints:
            sprint_cards = [c for c in cards if c.sprint_id == sprint.id]
            sprint_done = [c for c in sprint_cards if c.status.value in _DONE_STATUSES]
            by_sprint.append(
                {
                    "sprint": self._projects.sprint_dict(sprint),
                    "cards_total": len(sprint_cards),
                    "cards_done": len(sprint_done),
                    "points_committed": sum(c.points or 0 for c in sprint_cards),
                    "points_done": sum(c.points or 0 for c in sprint_done),
                }
            )

        closed = [s for s in by_sprint if s["sprint"]["status"] == "closed"]
        velocity = (
            round(sum(s["points_done"] for s in closed) / len(closed), 1)
            if closed
            else None
        )

        def brief(card) -> dict:
            return {
                "ref": f"{project.key}-{card.number}",
                "title": card.title,
                "status": card.status.value,
            }

        return {
            "project": {"id": project.id, "key": project.key, "name": project.name},
            "cards_total": len(cards),
            "cards_done": len(done),
            "points_total": sum(c.points or 0 for c in cards),
            "points_done": sum(c.points or 0 for c in done),
            "wip": len(in_progress),
            "in_review": len(in_review),
            # Velocity média só considera sprints fechadas — sprint em andamento
            # ainda vai receber pontos e puxaria a média para baixo.
            "velocity_avg_closed_sprints": velocity,
            "by_sprint": by_sprint,
            "blockers": {
                "unassigned": [
                    brief(c)
                    for c in cards
                    if not c.assignee_id and c.status.value not in _DONE_STATUSES
                ],
                "unestimated": [
                    brief(c)
                    for c in cards
                    if not c.points and c.status.value not in _DONE_STATUSES
                ],
                "stuck_in_review": [brief(c) for c in in_review],
            },
        }
