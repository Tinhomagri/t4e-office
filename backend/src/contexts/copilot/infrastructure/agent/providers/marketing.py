"""Ferramentas de marketing: calendário editorial, marca e geração de conteúdo.

Antes essas habilidades só existiam como endpoints soltos — o usuário precisava
saber que a tela existia. Como ferramentas, o agente as oferece sozinho.

Geração de conteúdo é leitura para efeito de banco (não grava nada), então
`mkt_generate_copy`, `mkt_generate_campaign` e `mkt_repurpose` rodam dentro do
loop. Materializar as peças como card continua sendo escrita: a IA propõe
`create_card` do domínio `projects`, com preview e confirmação. Publicar em
rede social **não** é ferramenta — sai da empresa e fica no fluxo manual.
"""
from __future__ import annotations

from contexts.copilot.infrastructure import brand_kit, marketing_skills
from contexts.copilot.infrastructure.agent.base import ReadOnlyProvider, tool
from contexts.copilot.infrastructure.agent.providers.projects import (
    ENUM_CHANNEL,
    ProjectsProvider,
)
from shared.domain.errors import ValidationError

_ENUM_TONE = [t for t in marketing_skills.TONE_HINT if t]


class MarketingProvider(ReadOnlyProvider):
    """Habilidades de marketing expostas ao agente.

    Depende do `ProjectsProvider` para ler os cards do calendário editorial —
    evita duplicar a resolução de projeto e a checagem de acesso.
    """

    domain = "mkt"

    def __init__(self, *, workspace_id: str, actor_id: str, projects: ProjectsProvider):
        self.workspace_id = workspace_id
        self.actor_id = actor_id
        self._projects = projects

    def read_tools(self) -> list[dict]:
        channels = {
            "type": "array",
            "items": {"type": "string", "enum": ENUM_CHANNEL},
        }
        return [
            tool(
                "mkt_editorial_calendar",
                "Calendário editorial do workspace: peças de marketing com canal "
                "e data de publicação, agrupadas por data. Filtra por janela e "
                "por projeto. Use para ver o que já está agendado antes de "
                "propor novas peças e evitar empilhar conteúdo no mesmo dia.",
                {
                    "project_id": {"type": "string"},
                    "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                },
            ),
            tool(
                "mkt_read_brand_kit",
                "Lê o kit de marca do workspace (tom de voz, diretrizes, cores, "
                "fontes). O tom já é aplicado automaticamente na geração de "
                "conteúdo; use esta ferramenta quando o usuário perguntar sobre "
                "a marca ou pedir para revisar um texto contra as diretrizes.",
            ),
            tool(
                "mkt_generate_copy",
                "Gera variações de copy/legenda para um canal, já on-brand. Não "
                "grava nada: mostre as variações ao usuário. Para virar card, "
                "proponha depois a ação create_card.",
                {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "channel": {"type": "string", "enum": ENUM_CHANNEL},
                    "tone": {"type": "string", "enum": _ENUM_TONE},
                    "count": {"type": "integer", "description": "1 a 5 (padrão 3)."},
                    "source_copy": {
                        "type": "string",
                        "description": "Copy existente a adaptar, se houver.",
                    },
                },
                ["title", "channel"],
            ),
            tool(
                "mkt_generate_campaign",
                "Monta um plano de campanha multicanal a partir de um briefing, "
                "distribuindo as datas na janela informada. Não grava nada: "
                "apresente o plano e proponha create_card por peça aprovada.",
                {
                    "brief": {"type": "string"},
                    "channels": channels,
                    "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "per_channel": {"type": "integer"},
                    "tone": {"type": "string", "enum": _ENUM_TONE},
                },
                ["brief", "channels", "start_date", "end_date"],
            ),
            tool(
                "mkt_repurpose",
                "Adapta uma peça aprovada para outros canais, preservando a "
                "mensagem central. Não grava nada.",
                {
                    "title": {"type": "string"},
                    "source_copy": {"type": "string"},
                    "channels": channels,
                    "tone": {"type": "string", "enum": _ENUM_TONE},
                },
                ["title", "source_copy", "channels"],
            ),
        ]

    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            raise ValidationError(f"Ferramenta desconhecida: {name}")
        return handler(args or {})

    # ── Handlers ─────────────────────────────────────────────────────────────
    def _read_mkt_editorial_calendar(self, args: dict) -> dict:
        start = (args.get("start_date") or "").strip()
        end = (args.get("end_date") or "").strip()
        ref = args.get("project_id")
        projects = (
            [self._projects.project_or_raise(ref)]
            if ref
            else [
                p
                for p in self._projects.list_workspace_projects()
                if p.template != "software"
            ]
        )

        entries = []
        for project in projects:
            for card in self._projects.list_cards_of(project):
                publish_date = getattr(card, "publish_date", None)
                if publish_date is None:
                    continue
                iso = publish_date.isoformat()
                if start and iso < start:
                    continue
                if end and iso > end:
                    continue
                entries.append(
                    {
                        "publish_date": iso,
                        "project_key": project.key,
                        "card_id": card.id,
                        "ref": f"{project.key}-{card.number}",
                        "title": card.title,
                        "channel": getattr(card, "channel", "") or "",
                        "status": card.status.value,
                    }
                )
        entries.sort(key=lambda e: (e["publish_date"], e["channel"]))
        return {"entries": entries, "total": len(entries)}

    def _read_mkt_read_brand_kit(self, _args: dict) -> dict:
        kit = brand_kit.get_brand_kit(self.workspace_id)
        return {"brand_kit": brand_kit.brand_kit_public_dict(kit)}

    def _read_mkt_generate_copy(self, args: dict) -> dict:
        count = max(1, min(int(args.get("count") or 3), 5))
        return marketing_skills.generate_copy(
            workspace_id=self.workspace_id,
            title=args["title"],
            description=args.get("description", ""),
            channel=args.get("channel", "instagram"),
            tone=args.get("tone", ""),
            count=count,
        )

    def _read_mkt_generate_campaign(self, args: dict) -> dict:
        per_channel = max(1, min(int(args.get("per_channel") or 1), 5))
        return marketing_skills.generate_campaign(
            workspace_id=self.workspace_id,
            brief=args["brief"],
            channels=args["channels"],
            start_date=args["start_date"],
            end_date=args["end_date"],
            per_channel=per_channel,
            tone=args.get("tone", ""),
        )

    def _read_mkt_repurpose(self, args: dict) -> dict:
        return marketing_skills.repurpose(
            workspace_id=self.workspace_id,
            title=args["title"],
            source_copy=args["source_copy"],
            channels=args["channels"],
            tone=args.get("tone", ""),
        )
