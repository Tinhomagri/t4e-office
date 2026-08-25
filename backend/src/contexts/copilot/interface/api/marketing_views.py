"""Endpoints de marketing do Copiloto: copy, campanha, repurpose, marca e contas.

POST /api/copilot/generate-copy/
  body: {workspace_id, title, description?, channel}
  → {"variations": [str, str, str]}

A lógica de prompt e parsing vive em `infrastructure/marketing_skills.py`,
compartilhada com as ferramentas `mkt_*` do agente — as views aqui só validam
entrada, checam acesso e registram a métrica.
"""
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure import brand_kit, marketing_skills, metrics
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import PermissionDeniedError, ValidationError
from shared.interface.permissions import SpaceAccessPermission

_TONE_HINT = marketing_skills.TONE_HINT


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


class GenerateCopyView(APIView):
    """Gera 3 variações de copy/legenda para um card de marketing."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request) -> Response:
        serializer = GenerateCopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        result = marketing_skills.generate_copy(
            workspace_id=workspace_id,
            title=v["title"],
            description=v["description"],
            channel=v["channel"],
            tone=v["tone"],
            include_hashtags=v["include_hashtags"],
            count=v["count"],
            source_copy=v["source_copy"],
        )
        metrics.log_event(
            workspace_id=workspace_id, actor_id=str(request.user.id), kind="generate_copy"
        )
        return Response(result)


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

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request) -> Response:
        serializer = RepurposeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        result = marketing_skills.repurpose(
            workspace_id=workspace_id,
            title=v["title"],
            source_copy=v["source_copy"],
            channels=v["channels"],
            tone=v["tone"],
        )
        metrics.log_event(
            workspace_id=workspace_id, actor_id=str(request.user.id), kind="repurpose"
        )
        return Response(result)


class GenerateCampaignView(APIView):
    """Gera um plano de campanha multicanal a partir de um briefing.

    POST /api/copilot/generate-campaign/
      body: {workspace_id, brief, channels[], start_date, end_date, per_channel?, tone?}
      → {"pieces": [{channel, title, copy, publish_date, format_hint}, ...]}

    Stateless: apenas retorna o plano. O frontend materializa cada peça como
    card via o endpoint de criação existente, agrupando por label de campanha.
    """

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request) -> Response:
        serializer = GenerateCampaignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        result = marketing_skills.generate_campaign(
            workspace_id=workspace_id,
            brief=v["brief"],
            channels=v["channels"],
            start_date=v["start_date"].isoformat(),
            end_date=v["end_date"].isoformat(),
            per_channel=v["per_channel"],
            tone=v["tone"],
        )
        metrics.log_event(
            workspace_id=workspace_id,
            actor_id=str(request.user.id),
            kind="generate_campaign",
        )
        return Response(result)


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

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

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

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

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
        can_edit = access.role(workspace_id=workspace_id, user_id=str(request.user.id)) == "owner"
        return Response(
            {"accounts": [self._serialize(a) for a in accounts], "can_edit": can_edit}
        )

    def post(self, request: Request) -> Response:
        from contexts.copilot.infrastructure.django.models import SocialAccountModel

        workspace_id = self._workspace_id(request)
        access = DjangoWorkspaceAccess()
        if access.role(workspace_id=workspace_id, user_id=str(request.user.id)) != "owner":
            raise PermissionDeniedError("Apenas o dono pode conectar contas.")
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
        if access.role(workspace_id=workspace_id, user_id=str(request.user.id)) != "owner":
            raise PermissionDeniedError("Apenas o dono pode desconectar contas.")
        channel = (request.query_params.get("channel") or "").lower().strip()
        SocialAccountModel.objects.filter(
            workspace_id=workspace_id, channel=channel
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
