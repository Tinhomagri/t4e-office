"""Porta do repositório de estágios do funil."""
from abc import ABC, abstractmethod

from contexts.sales.domain.entities.stage import PipelineStage, StageKind


class StageRepository(ABC):
    """Contrato de persistência dos estágios do funil."""

    @abstractmethod
    def create(self, *, stage: PipelineStage) -> PipelineStage:
        """Persiste um novo estágio."""

    @abstractmethod
    def get(self, *, stage_id: str) -> PipelineStage | None:
        """Busca um estágio por id (ou None)."""

    @abstractmethod
    def list_by_workspace(self, *, workspace_id: str) -> list[PipelineStage]:
        """Lista os estágios do workspace na ordem do funil."""

    @abstractmethod
    def find_by_kind(self, *, workspace_id: str, kind: StageKind) -> PipelineStage | None:
        """Primeiro estágio do workspace com a natureza informada."""

    @abstractmethod
    def count_by_kind(self, *, workspace_id: str, kind: StageKind) -> int:
        """Quantidade de estágios do workspace com a natureza informada."""

    @abstractmethod
    def slug_exists(self, *, workspace_id: str, slug: str) -> bool:
        """Indica se o slug já é usado por um estágio do workspace."""

    @abstractmethod
    def max_order(self, *, workspace_id: str) -> int:
        """Maior valor de ordem entre os estágios do workspace (0 se vazio)."""

    @abstractmethod
    def update(self, *, stage: PipelineStage) -> PipelineStage:
        """Atualiza um estágio existente."""

    @abstractmethod
    def delete(self, *, stage_id: str) -> None:
        """Remove um estágio."""
