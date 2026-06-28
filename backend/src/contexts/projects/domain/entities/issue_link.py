"""Entidade de vínculo entre cards (issue link) — Python puro."""
from dataclasses import dataclass
from enum import Enum

from shared.domain.errors import ValidationError


class LinkType(str, Enum):
    """Tipo de relação direcional entre dois cards (source → target)."""

    RELATES = "relates"  # relacionado a
    BLOCKS = "blocks"  # bloqueia
    DUPLICATES = "duplicates"  # duplica


@dataclass
class IssueLink:
    """Vínculo direcional entre dois cards do mesmo projeto/workspace.

    `source_id` é a origem; `target_id` o destino. O tipo é lido na direção
    source → target (ex.: source BLOCKS target). A view monta o rótulo inverso
    quando o card observado é o target.
    """

    id: str | None
    source_id: str
    target_id: str
    link_type: LinkType = LinkType.RELATES

    def __post_init__(self) -> None:
        if self.source_id == self.target_id:
            raise ValidationError("Um card não pode ser vinculado a si mesmo.")
