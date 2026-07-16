"""Habilidades de marketing do Copiloto: geração de copy por canal.

POST /api/copilot/generate-copy/
  body: {workspace_id, title, description?, channel}
  → {"variations": [str, str, str]}

Usa a IA já configurada do workspace (Anthropic/OpenAI) com um prompt de
copywriting calibrado por canal. Sem escrita no banco — o usuário escolhe a
variação e cola/salva no card.
"""
import json
import re

from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers

from contexts.copilot.infrastructure import ai_config, metrics
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import PermissionDeniedError

_CHANNEL_TONE = {
    "instagram": "leve, direto, com gancho forte na primeira linha e CTA; até 3 hashtags relevantes",
    "facebook": "conversacional e próximo, foco em engajamento",
    "linkedin": "profissional e informativo, sem hashtags em excesso, storytelling corporativo",
    "tiktok": "descontraído, jovem, frases curtas com gancho imediato",
    "youtube": "descrição clara com palavras-chave e CTA de inscrição",
    "blog": "título SEO + meta descrição de até 155 caracteres",
    "email": "assunto curto que gera abertura + preview text complementar",
    "site": "texto institucional claro e objetivo",
}


_TONE_HINT = {
    "": "",
    "institucional": "tom institucional, sério e confiável",
    "descontraido": "tom descontraído e bem-humorado",
    "urgente": "tom de urgência/escassez com CTA forte",
    "educativo": "tom educativo, didático, que ensina algo",
    "inspirador": "tom inspirador e aspiracional",
}


class GenerateCopySerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    channel = serializers.CharField(max_length=30, default="instagram")
    # Avançado: tom de voz, hashtags, quantidade e adaptação de copy existente
    tone = serializers.ChoiceField(
        choices=list(_TONE_HINT.keys()), required=False, default=""
    )
    include_hashtags = serializers.BooleanField(required=False, allow_null=True, default=None)
    count = serializers.IntegerField(required=False, min_value=1, max_value=5, default=3)
    source_copy = serializers.CharField(required=False, allow_blank=True, default="")


def _extract_variations(raw: str, limit: int = 3) -> list[str]:
    """Extrai a lista de variações da resposta da IA (JSON, com fallback)."""
    match = re.search(r"\[.*\]", raw, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            variations = [str(v).strip() for v in parsed if str(v).strip()]
            if variations:
                return variations[:limit]
        except (json.JSONDecodeError, TypeError):
            pass
    # Fallback: blocos separados por linha em branco
    blocks = [b.strip() for b in raw.split("\n\n") if b.strip()]
    return blocks[:limit] if blocks else [raw.strip()]


class GenerateCopyView(APIView):
    """Gera 3 variações de copy/legenda para um card de marketing."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = GenerateCopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        channel = v["channel"].lower()
        tone = _CHANNEL_TONE.get(channel, "adequado ao canal informado")
        count = v["count"]

        parts = [
            "Você é um copywriter sênior de marketing digital escrevendo em "
            "português do Brasil.",
            f"Canal: {channel} — tom {tone}.",
        ]
        if v["tone"]:
            parts.append(f"Tom de voz obrigatório: {_TONE_HINT[v['tone']]}.")
        if v["include_hashtags"] is True:
            parts.append("Inclua hashtags relevantes ao final de cada variação.")
        elif v["include_hashtags"] is False:
            parts.append("NÃO use hashtags em nenhuma variação.")
        parts.append(f"Tema/título do conteúdo: {v['title']}")
        if v["description"]:
            parts.append(f"Briefing/descrição: {v['description']}")
        if v["source_copy"]:
            # Modo adaptação: reescreve uma copy existente para o canal de destino
            parts.append(
                "Copy original a ser ADAPTADA para o canal acima (preserve a "
                f"mensagem central, ajuste formato e linguagem):\n{v['source_copy']}"
            )
            parts.append(
                f"\nEscreva {count} adaptações prontas para publicar nesse canal."
            )
        else:
            parts.append(
                f"\nEscreva {count} variações de copy prontas para publicar nesse "
                "canal, com abordagens diferentes entre si (ex.: emocional, "
                "informativa, CTA agressivo)."
            )
        parts.append(
            f"Responda APENAS com um array JSON de {count} strings, sem nenhum "
            "texto fora do JSON."
        )
        prompt = "\n".join(parts)

        raw = ai_config.chat_for_workspace(
            workspace_id, [{"role": "user", "content": prompt}]
        )
        metrics.log_event(
            workspace_id=workspace_id, actor_id=str(request.user.id), kind="generate_copy"
        )
        return Response(
            {"channel": channel, "variations": _extract_variations(raw, limit=count)}
        )
