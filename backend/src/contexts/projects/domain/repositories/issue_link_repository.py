"""Porta do repositório de vínculos entre cards."""
from abc import ABC, abstractmethod

from contexts.projects.domain.entities.issue_link import IssueLink


class IssueLinkRepository(ABC):
    """Contrato de persistência de issue links."""

    @abstractmethod
    def create(self, *, link: IssueLink) -> IssueLink:
        """Persiste um novo vínculo."""

    @abstractmethod
    def list_for_card(self, *, card_id: str) -> list[IssueLink]:
        """Lista vínculos onde o card é origem ou destino."""

    @abstractmethod
    def get(self, *, link_id: str) -> IssueLink | None:
        """Busca um vínculo por id (ou None)."""

    @abstractmethod
    def exists(self, *, source_id: str, target_id: str, link_type: str) -> bool:
        """Verifica vínculo duplicado (mesma origem, destino e tipo)."""

    @abstractmethod
    def delete(self, *, link_id: str) -> None:
        """Remove um vínculo."""
