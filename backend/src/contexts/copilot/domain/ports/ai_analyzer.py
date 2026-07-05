"""Porta de saída: análise de texto por IA."""
from abc import ABC, abstractmethod

from contexts.copilot.domain.entities.analysis import AnalysisResult


class AiAnalyzer(ABC):
    """Contrato para o motor de IA que extrai síntese e tarefas de um texto."""

    @abstractmethod
    def analyze(self, *, text: str) -> AnalysisResult:
        """Analisa o texto e retorna resumo, tarefas, decisões e riscos."""

    @abstractmethod
    def chat(self, *, messages: list[dict]) -> str:
        """Conversa livre com a IA. `messages` = [{role, content}]; retorna a resposta."""
