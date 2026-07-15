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


class GenerateCopySerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    channel = serializers.CharField(max_length=30, default="instagram")


def _extract_variations(raw: str) -> list[str]:
    """Extrai a lista de variações da resposta da IA (JSON, com fallback)."""
    match = re.search(r"\[.*\]", raw, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            variations = [str(v).strip() for v in parsed if str(v).strip()]
            if variations:
                return variations[:3]
        except (json.JSONDecodeError, TypeError):
            pass
    # Fallback: blocos separados por linha em branco
    blocks = [b.strip() for b in raw.split("\n\n") if b.strip()]
    return blocks[:3] if blocks else [raw.strip()]


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
        prompt = (
            "Você é um copywriter sênior de marketing digital escrevendo em "
            "português do Brasil.\n"
            f"Canal: {channel} — tom {tone}.\n"
            f"Tema/título do conteúdo: {v['title']}\n"
            + (f"Briefing/descrição: {v['description']}\n" if v["description"] else "")
            + "\nEscreva 3 variações de copy prontas para publicar nesse canal, "
            "com abordagens diferentes entre si (ex.: emocional, informativa, CTA "
            "agressivo). Responda APENAS com um array JSON de 3 strings, sem "
            "nenhum texto fora do JSON."
        )
        raw = ai_config.chat_for_workspace(
            workspace_id, [{"role": "user", "content": prompt}]
        )
        metrics.log_event(
            workspace_id=workspace_id, actor_id=str(request.user.id), kind="generate_copy"
        )
        return Response({"channel": channel, "variations": _extract_variations(raw)})
