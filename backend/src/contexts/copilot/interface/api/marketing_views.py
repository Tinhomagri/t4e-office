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

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure import ai_config, brand_kit, metrics
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import PermissionDeniedError, ValidationError

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
        brand = brand_kit.brand_prompt_snippet(workspace_id)
        if brand:
            parts.insert(1, brand)
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


class GenerateCampaignSerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    brief = serializers.CharField(max_length=2000)
    channels = serializers.ListField(
        child=serializers.CharField(max_length=30), allow_empty=False, max_length=8
    )
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    per_channel = serializers.IntegerField(required=False, min_value=1, max_value=5, default=1)
    tone = serializers.ChoiceField(
        choices=list(_TONE_HINT.keys()), required=False, default=""
    )

    def validate(self, attrs: dict) -> dict:
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError(
                "A data final deve ser igual ou posterior à inicial."
            )
        return attrs


def _extract_pieces(raw: str) -> list[dict]:
    """Extrai a lista de peças da campanha (array JSON de objetos)."""
    match = re.search(r"\[.*\]", raw, flags=re.DOTALL)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    pieces = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        pieces.append(
            {
                "channel": str(item.get("channel", "")).lower().strip(),
                "title": str(item.get("title", "")).strip(),
                "copy": str(item.get("copy", "")).strip(),
                "publish_date": str(item.get("publish_date", "")).strip() or None,
                "format_hint": str(item.get("format_hint", "")).strip(),
            }
        )
    return [p for p in pieces if p["title"] and p["channel"]]


class RepurposeSerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    title = serializers.CharField(max_length=200)
    source_copy = serializers.CharField(max_length=8000)
    channels = serializers.ListField(
        child=serializers.CharField(max_length=30), allow_empty=False, max_length=8
    )
    tone = serializers.ChoiceField(
        choices=list(_TONE_HINT.keys()), required=False, default=""
    )


class RepurposeView(APIView):
    """Adapta uma peça aprovada para outros canais (conteúdo atômico → N canais).

    POST /api/copilot/repurpose/
      body: {workspace_id, title, source_copy, channels[], tone?}
      → {"pieces": [{channel, title, copy, format_hint}, ...]}

    Stateless: retorna as adaptações. O frontend cria um card por canal,
    vinculado à peça de origem.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = RepurposeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        channels = [c.lower().strip() for c in v["channels"] if c.strip()]
        channel_lines = "\n".join(
            f"- {ch}: tom {_CHANNEL_TONE.get(ch, 'adequado ao canal')}"
            for ch in channels
        )
        parts = [
            "Você é um copywriter sênior de marketing digital escrevendo em "
            "português do Brasil.",
            f"Peça original (título: {v['title']}):\n{v['source_copy']}",
            "\nAdapte essa MESMA mensagem central para cada canal abaixo, ajustando "
            f"formato e linguagem:\n{channel_lines}",
        ]
        if v["tone"]:
            parts.append(f"Tom de voz obrigatório: {_TONE_HINT[v['tone']]}.")
        parts.append(
            "Responda APENAS com um array JSON de objetos, um por canal, sem texto "
            "fora do JSON. Cada objeto: {\"channel\": <um dos canais>, \"title\": "
            "<título curto da peça>, \"copy\": <copy adaptada pronta para publicar>, "
            "\"format_hint\": <formato sugerido>}."
        )
        brand = brand_kit.brand_prompt_snippet(workspace_id)
        if brand:
            parts.insert(1, brand)
        prompt = "\n".join(parts)

        raw = ai_config.chat_for_workspace(
            workspace_id, [{"role": "user", "content": prompt}]
        )
        metrics.log_event(
            workspace_id=workspace_id, actor_id=str(request.user.id), kind="repurpose"
        )
        pieces = [p for p in _extract_pieces(raw) if p["channel"] in channels]
        return Response({"pieces": pieces})


class GenerateCampaignView(APIView):
    """Gera um plano de campanha multicanal a partir de um briefing.

    POST /api/copilot/generate-campaign/
      body: {workspace_id, brief, channels[], start_date, end_date, per_channel?, tone?}
      → {"pieces": [{channel, title, copy, publish_date, format_hint}, ...]}

    Stateless: apenas retorna o plano. O frontend materializa cada peça como
    card via o endpoint de criação existente, agrupando por label de campanha.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = GenerateCampaignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        channels = [c.lower().strip() for c in v["channels"] if c.strip()]
        per_channel = v["per_channel"]
        start = v["start_date"].isoformat()
        end = v["end_date"].isoformat()
        total = len(channels) * per_channel

        channel_lines = "\n".join(
            f"- {ch}: tom {_CHANNEL_TONE.get(ch, 'adequado ao canal')}"
            for ch in channels
        )
        parts = [
            "Você é um estrategista de marketing digital sênior escrevendo em "
            "português do Brasil.",
            "A partir do briefing abaixo, monte um plano de campanha multicanal.",
            f"\nBriefing:\n{v['brief']}",
            f"\nCanais e tom de cada um:\n{channel_lines}",
            f"\nGere exatamente {per_channel} peça(s) por canal ({total} no total).",
            f"Distribua as datas de publicação entre {start} e {end} (inclusive), "
            "seguindo boa prática de cadência: não empilhe duas peças do mesmo "
            "canal no mesmo dia e escalone ao longo da janela.",
        ]
        if v["tone"]:
            parts.append(f"Tom de voz geral obrigatório: {_TONE_HINT[v['tone']]}.")
        parts.append(
            "Responda APENAS com um array JSON de objetos, sem texto fora do JSON. "
            "Cada objeto: {\"channel\": <um dos canais>, \"title\": <título curto "
            "da peça>, \"copy\": <copy pronta para publicar no canal>, "
            "\"publish_date\": <YYYY-MM-DD dentro da janela>, \"format_hint\": "
            "<formato sugerido, ex.: Reels, Carrossel, Newsletter>}."
        )
        brand = brand_kit.brand_prompt_snippet(workspace_id)
        if brand:
            parts.insert(1, brand)
        prompt = "\n".join(parts)

        raw = ai_config.chat_for_workspace(
            workspace_id, [{"role": "user", "content": prompt}]
        )
        metrics.log_event(
            workspace_id=workspace_id,
            actor_id=str(request.user.id),
            kind="generate_campaign",
        )
        pieces = _extract_pieces(raw)
        # Mantém só peças em canais pedidos e datas dentro da janela.
        valid = [
            p
            for p in pieces
            if p["channel"] in channels
            and (p["publish_date"] is None or start <= p["publish_date"] <= end)
        ]
        return Response({"pieces": valid})


class BrandKitSerializer(serializers.Serializer):
    tone_of_voice = serializers.CharField(required=False, allow_blank=True, default="")
    colors = serializers.ListField(
        child=serializers.CharField(max_length=9), required=False, default=list
    )
    fonts = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    logo_url = serializers.CharField(required=False, allow_blank=True, default="")
    guidelines = serializers.CharField(required=False, allow_blank=True, default="")


class BrandKitView(APIView):
    """Kit de marca do workspace: GET (membros) / PUT (admin).

    /api/copilot/brand-kit/?workspace_id=...
    """

    permission_classes = [IsAuthenticated]

    def _workspace_id(self, request: Request) -> str:
        wid = request.query_params.get("workspace_id") or request.data.get("workspace_id")
        if not wid:
            raise ValidationError("Informe o workspace_id.")
        return str(wid)

    def get(self, request: Request) -> Response:
        workspace_id = self._workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        kit = brand_kit.get_brand_kit(workspace_id)
        data = brand_kit.brand_kit_public_dict(kit)
        data["can_edit"] = access.is_admin(
            workspace_id=workspace_id, user_id=str(request.user.id)
        )
        return Response(data)

    def put(self, request: Request) -> Response:
        workspace_id = self._workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError(
                "Apenas administradores podem editar o kit de marca."
            )
        serializer = BrandKitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        kit = brand_kit.save_brand_kit(
            workspace_id=workspace_id,
            tone_of_voice=v["tone_of_voice"],
            colors=v["colors"],
            fonts=v["fonts"],
            logo_url=v["logo_url"],
            guidelines=v["guidelines"],
            updated_by_id=str(request.user.id),
        )
        data = brand_kit.brand_kit_public_dict(kit)
        data["can_edit"] = True
        return Response(data)


class SocialConnectSerializer(serializers.Serializer):
    channel = serializers.CharField(max_length=30)
    account_name = serializers.CharField(max_length=120)


class SocialAccountsView(APIView):
    """Contas de rede social do workspace: GET / POST (connect) / DELETE.

    /api/copilot/social-accounts/?workspace_id=...
    """

    permission_classes = [IsAuthenticated]

    def _workspace_id(self, request: Request) -> str:
        wid = request.query_params.get("workspace_id") or request.data.get("workspace_id")
        if not wid:
            raise ValidationError("Informe o workspace_id.")
        return str(wid)

    def _serialize(self, acc) -> dict:
        return {
            "id": str(acc.id),
            "channel": acc.channel,
            "account_name": acc.account_name,
            "connected_at": acc.connected_at.isoformat() if acc.connected_at else None,
        }

    def get(self, request: Request) -> Response:
        from contexts.copilot.infrastructure.django.models import SocialAccountModel

        workspace_id = self._workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        accounts = SocialAccountModel.objects.filter(workspace_id=workspace_id)
        can_edit = access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id))
        return Response(
            {"accounts": [self._serialize(a) for a in accounts], "can_edit": can_edit}
        )

    def post(self, request: Request) -> Response:
        from contexts.copilot.infrastructure.django.models import SocialAccountModel

        workspace_id = self._workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Apenas administradores podem conectar contas.")
        serializer = SocialConnectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        acc, _ = SocialAccountModel.objects.update_or_create(
            workspace_id=workspace_id,
            channel=v["channel"].lower().strip(),
            defaults={
                "account_name": v["account_name"].strip(),
                "connected_by_id": str(request.user.id),
            },
        )
        return Response(self._serialize(acc), status=status.HTTP_201_CREATED)

    def delete(self, request: Request) -> Response:
        from contexts.copilot.infrastructure.django.models import SocialAccountModel

        workspace_id = self._workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Apenas administradores podem desconectar contas.")
        channel = (request.query_params.get("channel") or "").lower().strip()
        SocialAccountModel.objects.filter(
            workspace_id=workspace_id, channel=channel
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
