"""Porta do repositório de referências de reunião."""
from abc import ABC, abstractmethod

from contexts.google.domain.entities.meeting import MeetingRef


class MeetingRefRepository(ABC):
    """Persistência leve de referências a eventos criados pelo app."""

    @abstractmethod
    def create(self, *, ref: MeetingRef) -> MeetingRef:
        """Guarda a referência (google_event_id + dono + card opcional)."""
