from abc import ABC, abstractmethod

from contexts.estimation.domain.entities.poker_session import (
    PokerParticipant,
    PokerSession,
    PokerVote,
)


class PokerSessionRepository(ABC):
    @abstractmethod
    def create(self, session: PokerSession) -> PokerSession: ...

    @abstractmethod
    def get(self, session_id: str) -> PokerSession | None: ...

    @abstractmethod
    def update(self, session: PokerSession) -> PokerSession: ...

    @abstractmethod
    def list_by_workspace(self, workspace_id: str) -> list[PokerSession]: ...

    @abstractmethod
    def list_by_project(self, project_id: str) -> list[PokerSession]: ...


class PokerParticipantRepository(ABC):
    @abstractmethod
    def join(self, participant: PokerParticipant) -> PokerParticipant: ...

    @abstractmethod
    def get_by_user(self, session_id: str, user_id: str) -> PokerParticipant | None: ...

    @abstractmethod
    def list_active(self, session_id: str) -> list[PokerParticipant]: ...

    @abstractmethod
    def touch(self, session_id: str, user_id: str) -> None: ...

    @abstractmethod
    def leave(self, session_id: str, user_id: str) -> None: ...


class PokerVoteRepository(ABC):
    @abstractmethod
    def upsert(self, vote: PokerVote) -> PokerVote: ...

    @abstractmethod
    def list_by_card(self, session_id: str, card_id: str) -> list[PokerVote]: ...

    @abstractmethod
    def clear_card(self, session_id: str, card_id: str) -> None: ...
