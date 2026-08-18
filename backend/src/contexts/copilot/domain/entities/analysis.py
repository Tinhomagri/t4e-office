"""Resultado da análise de um documento pela IA — Python puro."""
from dataclasses import dataclass, field


@dataclass
class SuggestedTask:
    """Tarefa sugerida pela IA, pronta para virar um card."""

    title: str
    description: str = ""
    priority: str = "medium"  # low | medium | high | urgent
    type: str = "feature"  # feature | bug | debt | spike | chore


@dataclass
class AnalysisResult:
    """Síntese estruturada de um documento."""

    summary: str
    tasks: list[SuggestedTask] = field(default_factory=list)
    decisions: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    # Prazo final extraído (contrato/proposta), ISO "AAAA-MM-DD", quando houver.
    deadline: str | None = None

    def to_dict(self) -> dict:
        return {
            "summary": self.summary,
            "tasks": [t.__dict__ for t in self.tasks],
            "decisions": self.decisions,
            "risks": self.risks,
            "deadline": self.deadline,
        }
