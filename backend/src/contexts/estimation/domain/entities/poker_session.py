from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class SessionStatus(str, Enum):
    WAITING = "waiting"
    VOTING = "voting"
    REVEALED = "revealed"
    DONE = "done"


FIBONACCI = ["1", "2", "3", "5", "8", "13", "21", "?"]


@dataclass
class PokerParticipant:
    id: str | None
    session_id: str
    user_id: str
    user_name: str
    avatar_initials: str
    joined_at: datetime | None = None
    last_seen: datetime | None = None
    is_host: bool = False


@dataclass
class PokerVote:
    id: str | None
    session_id: str
    card_id: str
    participant_id: str
    value: str | None = None  # fibonacci value or None (not yet voted)
    participant_name: str = ""


@dataclass
class PokerSession:
    id: str | None
    workspace_id: str
    project_id: str
    created_by: str
    name: str
    status: SessionStatus = SessionStatus.WAITING
    current_card_id: str | None = None
    card_ids: list[str] = field(default_factory=list)  # cards selected by host
    created_at: datetime | None = None
