"""Porta de criação do projeto de entrega (fronteira com o contexto projects).

`sales` não conhece models nem repositórios de `projects`: só declara o que
precisa. O adaptador concreto chama o caso de uso público `create_project`.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class CreatedProject:
    """Projeto de entrega criado a partir de um negócio ganho."""

    project_id: str
    name: str
    key: str


class ProjectCreator(ABC):
    """Contrato para gerar o projeto de entrega de um negócio ganho."""

    @abstractmethod
    def create(
        self, *, workspace_id: str, name: str, key_hint: str, actor_id: str
    ) -> CreatedProject:
        """Cria o projeto de entrega. `key_hint` é a chave desejada; o adaptador
        resolve colisões de chave dentro do workspace."""
