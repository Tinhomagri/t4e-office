"""Contrato dos provedores de ferramentas do Copiloto.

Um *provider* cobre um domínio (entrega, comercial, marketing, agenda…) e
declara o que a IA pode ler e o que ela pode propor. O registry junta todos e
roteia a chamada pelo nome da ferramenta — adicionar domínio é criar um arquivo
em `providers/` e registrá-lo, sem tocar no loop da IA.

Duas regras valem para todos os provedores e são garantidas pelo registry, não
por cada provider:

* **Escrita nunca é direta.** A IA só chama `propose_actions`; as ações voltam
  ao cliente como preview e só rodam depois da confirmação do usuário.
* **Acesso ao workspace é checado uma vez**, antes de qualquer ferramenta rodar.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Protocol, runtime_checkable


def tool(name: str, description: str, properties: dict | None = None,
         required: list[str] | None = None) -> dict:
    """Monta a spec neutra de uma ferramenta (convertida por provedor de IA).

    Nomes precisam casar `^[a-zA-Z0-9_-]{1,64}$` — por isso o prefixo de domínio
    usa underscore (`sales_list_deals`), não ponto.
    """
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": properties or {},
            "required": required or [],
        },
    }


@runtime_checkable
class ToolProvider(Protocol):
    """Um domínio de ferramentas do agente.

    `domain` é o prefixo dos nomes das ferramentas de leitura e das ações de
    escrita, e também identifica o provider no registry.
    """

    domain: str

    def read_tools(self) -> list[dict]:
        """Specs das ferramentas de leitura, executáveis dentro do loop da IA."""
        ...

    def execute_read(self, name: str, args: dict) -> dict:
        """Roda uma leitura. `name` chega sem o prefixo de domínio."""
        ...

    def write_actions(self) -> dict[str, str]:
        """Ações de escrita propostas por este domínio: {nome: descrição}."""
        ...

    def write_schema(self) -> dict:
        """Propriedades que as ações deste domínio aceitam em `propose_actions`."""
        ...

    def execute_write(self, action_name: str, action: dict) -> dict:
        """Executa uma ação já confirmada pelo usuário."""
        ...


class ReadOnlyProvider:
    """Base para domínios que só leem (github, delivery).

    Evita repetir três métodos vazios em cada provider de leitura.
    """

    domain = ""

    def write_actions(self) -> dict[str, str]:
        return {}

    def write_schema(self) -> dict:
        return {}

    def execute_write(self, action_name: str, action: dict) -> dict:
        raise ValueError(f"O domínio '{self.domain}' não executa escrita.")


def parse_date(value: str | None) -> date | None:
    """Converte 'YYYY-MM-DD' vindo da IA em date. Vazio vira None."""
    if not value:
        return None
    return date.fromisoformat(value)


def parse_datetime(value: str | None) -> datetime | None:
    """Converte um ISO datetime vindo da IA. Aceita o sufixo 'Z'."""
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return datetime.fromisoformat(text)
