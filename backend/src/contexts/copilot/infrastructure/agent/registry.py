"""Catálogo e roteamento das ferramentas do Copiloto.

O registry é o único lugar que conhece todos os domínios. Ele:

* junta as ferramentas de leitura de cada provider num catálogo só;
* monta a ferramenta `propose_actions` com as ações de escrita de todos eles;
* roteia `execute_read` / `execute_write` para o provider dono da ferramenta;
* checa **uma vez** se o ator é membro do workspace.

Regra que não muda: a IA nunca grava. Ela chama `propose_actions`, as ações
voltam ao cliente como preview e só rodam depois da confirmação do usuário —
`execute_write` é chamado pela view de confirmação, nunca de dentro do loop.
"""
from __future__ import annotations

from contexts.copilot.infrastructure.agent.providers.calendar import CalendarProvider
from contexts.copilot.infrastructure.agent.providers.delivery import DeliveryProvider
from contexts.copilot.infrastructure.agent.providers.drive import DriveProvider
from contexts.copilot.infrastructure.agent.providers.github import GithubProvider
from contexts.copilot.infrastructure.agent.providers.marketing import MarketingProvider
from contexts.copilot.infrastructure.agent.providers.projects import ProjectsProvider
from contexts.copilot.infrastructure.agent.providers.sales import SalesProvider
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import ValidationError

PROPOSE_TOOL_NAME = "propose_actions"


class AgentTools:
    """Ferramentas do agente para um (workspace, ator) fixo.

    Mantém o nome e a interface antigos (`execute_read`, `execute_write`) para
    não quebrar quem já chama — o que mudou é que por trás existem vários
    domínios em vez de um.
    """

    def __init__(self, *, workspace_id: str, actor_id: str):
        self.workspace_id = workspace_id
        self.actor_id = actor_id
        self._access = DjangoWorkspaceAccess()
        self._checked_member = False

        common = {"workspace_id": workspace_id, "actor_id": actor_id}
        projects = ProjectsProvider(**common)
        # Marketing, github e delivery reaproveitam a resolução de projeto e a
        # leitura de cards do provider de entrega em vez de duplicá-las.
        self.providers = [
            projects,
            SalesProvider(**common),
            MarketingProvider(**common, projects=projects),
            CalendarProvider(**common),
            DriveProvider(**common),
            GithubProvider(**common, projects=projects),
            DeliveryProvider(**common, projects=projects),
        ]

        self._read_index: dict[str, object] = {}
        self._write_index: dict[str, object] = {}
        for provider in self.providers:
            for spec in provider.read_tools():
                self._read_index[spec["name"]] = provider
            for action_name in provider.write_actions():
                self._write_index[action_name] = provider

    # ── Catálogo ─────────────────────────────────────────────────────────────
    @property
    def domains(self) -> list[str]:
        """Domínios ativos, na ordem em que aparecem no catálogo."""
        return [p.domain for p in self.providers]

    def read_tools(self) -> list[dict]:
        """Specs de todas as ferramentas de leitura, na ordem dos providers."""
        return [spec for p in self.providers for spec in p.read_tools()]

    def propose_tool(self) -> dict:
        """A ferramenta de escrita única, com as ações de todos os domínios."""
        actions: dict[str, str] = {}
        properties: dict[str, dict] = {}
        for provider in self.providers:
            actions.update(provider.write_actions())
            properties.update(provider.write_schema())

        action_lines = "\n".join(f"- {name}: {desc}" for name, desc in actions.items())
        schema = {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": sorted(actions)},
                "reason": {
                    "type": "string",
                    "description": "Justificativa curta da ação (mostrada ao usuário).",
                },
                **properties,
            },
            "required": ["action", "reason"],
        }
        return {
            "name": PROPOSE_TOOL_NAME,
            "description": (
                "Proponha ações de escrita para o usuário aprovar. NÃO executa "
                "nada: as ações voltam como preview para confirmação. Chame "
                "quando o usuário pedir para criar/alterar algo em qualquer "
                "domínio. Sempre inclua uma 'reason' clara em cada ação.\n"
                f"Ações disponíveis:\n{action_lines}"
            ),
            "input_schema": {
                "type": "object",
                "properties": {"actions": {"type": "array", "items": schema}},
                "required": ["actions"],
            },
        }

    def all_tools(self) -> list[dict]:
        """Catálogo completo entregue à IA: leituras + `propose_actions`."""
        return [*self.read_tools(), self.propose_tool()]

    # ── Execução ─────────────────────────────────────────────────────────────
    def _assert_member(self) -> None:
        """Checa a associação ao workspace uma vez por instância."""
        if self._checked_member:
            return
        if not self._access.is_member(
            workspace_id=self.workspace_id, user_id=self.actor_id
        ):
            raise ValidationError("Sem acesso a este workspace.")
        self._checked_member = True

    def execute_read(self, name: str, args: dict) -> dict:
        """Roda uma leitura dentro do loop da IA.

        Erros viram contexto para o modelo (`{"error": ...}`) em vez de 500 —
        assim ele explica ou tenta outro caminho em vez de a conversa morrer.
        """
        try:
            self._assert_member()
            provider = self._read_index.get(name)
            if provider is None:
                raise ValidationError(f"Ferramenta desconhecida: {name}")
            return provider.execute_read(name, args or {})
        except Exception as exc:  # noqa: BLE001 — erro é contexto, não falha HTTP
            return {"error": str(exc)}

    def execute_write(self, action: dict) -> dict:
        """Executa **uma** ação já confirmada pelo usuário."""
        kind = action.get("action")
        provider = self._write_index.get(kind)
        if provider is None:
            return {"ok": False, "error": f"Ação inválida: {kind}"}
        try:
            self._assert_member()
            return {"ok": True, **provider.execute_write(kind, action)}
        except Exception as exc:  # noqa: BLE001 — reportado por-ação ao cliente
            return {"ok": False, "action": kind, "error": str(exc)}
