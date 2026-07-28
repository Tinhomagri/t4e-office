"""Caso de uso: criar os estágios padrão do funil de um workspace."""

from contexts.sales.domain.entities.stage import PipelineStage, StageKind
from contexts.sales.domain.repositories.stage_repository import StageRepository

# Funil padrão do time comercial — renomeável, reordenável e extensível depois.
DEFAULT_STAGES = [
    {"name": "Lead", "slug": "lead", "color": "#6b7280", "probability_default": 10, "kind": StageKind.OPEN},
    {"name": "Qualificação", "slug": "qualificacao", "color": "#3b82f6", "probability_default": 30, "kind": StageKind.OPEN},
    {"name": "Proposta", "slug": "proposta", "color": "#8b5cf6", "probability_default": 50, "kind": StageKind.OPEN},
    {"name": "Negociação", "slug": "negociacao", "color": "#f59e0b", "probability_default": 75, "kind": StageKind.OPEN},
    {"name": "Ganho", "slug": "ganho", "color": "#10b981", "probability_default": 100, "kind": StageKind.WON},
    {"name": "Perdido", "slug": "perdido", "color": "#ef4444", "probability_default": 0, "kind": StageKind.LOST},
]


class SeedDefaultStages:
    """Cria o funil padrão do workspace. Idempotente: não duplica se já existir."""

    def __init__(self, stage_repository: StageRepository):
        self.stage_repository = stage_repository

    def execute(self, *, workspace_id: str) -> list[PipelineStage]:
        existing = self.stage_repository.list_by_workspace(workspace_id=workspace_id)
        if existing:
            return existing
        return [
            self.stage_repository.create(
                stage=PipelineStage(
                    id=None,
                    workspace_id=workspace_id,
                    name=spec["name"],
                    slug=spec["slug"],
                    color=spec["color"],
                    order=order,
                    probability_default=spec["probability_default"],
                    kind=spec["kind"],
                )
            )
            for order, spec in enumerate(DEFAULT_STAGES)
        ]
