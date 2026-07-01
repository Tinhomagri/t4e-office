"""Porta de saída: criação de tarefas (cards) em um projeto a partir da IA.

Mantém o contexto copilot desacoplado do contexto projects — a implementação
delega ao caso de uso CreateCard de projects.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class CreatedTask:
    """Referência mínima de um card criado."""

    id: str
    ref: str
    title: str


class TaskCreator(ABC):
    @abstractmethod
    def create(
        self,
        *,
        project_id: str,
        actor_id: str,
        title: str,
        description: str,
        priority: str,
        type: str,
    ) -> CreatedTask:
        """Cria um card no projeto e devolve sua referência."""
