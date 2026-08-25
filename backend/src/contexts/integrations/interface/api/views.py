"""API do contexto integrations.

Endpoints (todos autenticados, checagem de membership do workspace):
* posts/                — GET lista (filtros project/month) | POST agenda
* posts/<id>/           — PATCH edita/reagenda | DELETE
* posts/<id>/publish/   — POST publica agora (simulado) e gera métricas
* analytics/            — GET métricas agregadas por canal
"""
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure.django.models import SocialAccountModel
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from contexts.integrations.infrastructure import providers, publishing_service, social_publisher
from contexts.integrations.infrastructure.django.models import (
    PostMetricModel,
    ScheduledPostModel,
)
from shared.domain.errors import PermissionDeniedError, ValidationError
from shared.interface.permissions import SpaceAccessPermission


def _require_member(request: Request, workspace_id: str) -> DjangoWorkspaceAccess:
    access = DjangoWorkspaceAccess()
    if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
        raise PermissionDeniedError("Você não tem acesso a este workspace.")
    return access


def _workspace_id(request: Request) -> str:
    wid = request.query_params.get("workspace_id") or request.data.get("workspace_id")
    if not wid:
        raise ValidationError("Informe o workspace_id.")
    return str(wid)


def _ser_post(p: ScheduledPostModel) -> dict:
    metric = getattr(p, "metric", None)
    return {
        "id": str(p.id),
        "card_id": str(p.card_id) if p.card_id else None,
        "project_id": str(p.project_id) if p.project_id else None,
        "channel": p.account.channel,
        "account_name": p.account.account_name,
        "content": p.content,
        "media_url": p.media_url,
        "media_urls": p.media_urls or [],
        "mentions": p.mentions or [],
        "scheduled_at": p.scheduled_at.isoformat(),
        "status": p.status,
        "external_id": p.external_id,
        "error": p.error,
        "attempts": p.attempts,
        "next_attempt_at": p.next_attempt_at.isoformat() if p.next_attempt_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "metrics": {
            "impressions": metric.impressions,
            "likes": metric.likes,
            "comments": metric.comments,
            "shares": metric.shares,
            "clicks": metric.clicks,
        }
        if metric
        else None,
    }


class SchedulePostSerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    account_id = serializers.CharField()
    content = serializers.CharField()
    scheduled_at = serializers.DateTimeField()
    project_id = serializers.CharField(required=False, allow_null=True, default=None)
    card_id = serializers.CharField(required=False, allow_null=True, default=None)
    media_url = serializers.CharField(required=False, allow_blank=True, default="")
    media_urls = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    mentions = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class PostsView(APIView):
    """GET lista posts do workspace | POST agenda um post."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request)
        _require_member(request, workspace_id)
        qs = (
            ScheduledPostModel.objects.filter(workspace_id=workspace_id)
            .select_related("account")
            .prefetch_related("metric")
        )
        project_id = request.query_params.get("project_id")
        if project_id:
            qs = qs.filter(project_id=project_id)
        month = request.query_params.get("month")  # "YYYY-MM"
        if month:
            try:
                year, mon = (int(x) for x in month.split("-"))
            except (TypeError, AttributeError, IndexError, ValueError):
                raise ValidationError("month deve ser YYYY-MM.") from None
            qs = qs.filter(scheduled_at__year=year, scheduled_at__month=mon)
        return Response({"posts": [_ser_post(p) for p in qs]})

    def post(self, request: Request) -> Response:
        serializer = SchedulePostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        _require_member(request, workspace_id)
        try:
            account = SocialAccountModel.objects.get(
                id=v["account_id"], workspace_id=workspace_id
            )
        except SocialAccountModel.DoesNotExist:
            raise ValidationError("Conta social não encontrada neste workspace.") from None
        post = ScheduledPostModel.objects.create(
            workspace_id=workspace_id,
            project_id=v["project_id"] or None,
            card_id=v["card_id"] or None,
            account=account,
            content=v["content"],
            media_url=v["media_url"],
            media_urls=v["media_urls"],
            mentions=v["mentions"],
            scheduled_at=v["scheduled_at"],
            created_by_id=str(request.user.id),
        )
        return Response(_ser_post(post), status=status.HTTP_201_CREATED)


class PostDetailView(APIView):
    """PATCH edita/reagenda | DELETE remove um post não publicado."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def _get(self, request: Request, post_id: str) -> ScheduledPostModel:
        try:
            post = ScheduledPostModel.objects.select_related("account").get(id=post_id)
        except ScheduledPostModel.DoesNotExist:
            raise ValidationError("Post não encontrado.") from None
        _require_member(request, str(post.workspace_id))
        return post

    def patch(self, request: Request, post_id: str) -> Response:
        post = self._get(request, post_id)
        if post.status == "published":
            raise ValidationError("Post já publicado não pode ser editado.")
        if "content" in request.data:
            post.content = str(request.data["content"])
        if "scheduled_at" in request.data:
            post.scheduled_at = serializers.DateTimeField().to_internal_value(
                request.data["scheduled_at"]
            )
        if "media_url" in request.data:
            post.media_url = str(request.data["media_url"])
        if "media_urls" in request.data:
            post.media_urls = list(request.data["media_urls"] or [])
        if "mentions" in request.data:
            post.mentions = list(request.data["mentions"] or [])
        # Reeditar reabre a fila: zera falha/backoff.
        if post.status == "failed":
            post.status = "scheduled"
            post.attempts = 0
            post.error = ""
            post.next_attempt_at = None
        post.save()
        return Response(_ser_post(post))

    def delete(self, request: Request, post_id: str) -> Response:
        post = self._get(request, post_id)
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PostPublishView(APIView):
    """POST publica o post agora (simulado) e gera métricas iniciais."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request, post_id: str) -> Response:
        try:
            post = ScheduledPostModel.objects.select_related("account").get(id=post_id)
        except ScheduledPostModel.DoesNotExist:
            raise ValidationError("Post não encontrado.") from None
        _require_member(request, str(post.workspace_id))
        if post.status == "published":
            raise ValidationError("Post já publicado.")
        try:
            post = publishing_service.publish_now(post)
        except social_publisher.PublishError as exc:
            post.status = "failed"
            post.error = str(exc)
            post.save(update_fields=["status", "error", "updated_at"])
            raise ValidationError(str(exc)) from exc
        return Response(_ser_post(post))


class AnalyticsView(APIView):
    """GET métricas agregadas por canal do workspace (atualiza coleta)."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request)
        _require_member(request, workspace_id)
        qs = (
            ScheduledPostModel.objects.filter(
                workspace_id=workspace_id, status="published"
            )
            .select_related("account")
            .prefetch_related("metric")
        )
        project_id = request.query_params.get("project_id")
        if project_id:
            qs = qs.filter(project_id=project_id)
        # Métricas reais são coletadas na publicação e no refresh; aqui só lemos
        # o que está salvo (evita N chamadas às APIs a cada consulta).
        refresh = request.query_params.get("refresh") == "1"
        by_channel: dict[str, dict] = {}
        posts_out = []
        for post in qs:
            if refresh:
                data = providers.collect_metrics(post)
                PostMetricModel.objects.update_or_create(post=post, defaults=data)
            else:
                m = getattr(post, "metric", None)
                data = (
                    {k: getattr(m, k) for k in ("impressions", "likes", "comments", "shares", "clicks")}
                    if m
                    else {"impressions": 0, "likes": 0, "comments": 0, "shares": 0, "clicks": 0}
                )
            ch = by_channel.setdefault(
                post.account.channel,
                {"posts": 0, "impressions": 0, "likes": 0, "comments": 0, "shares": 0, "clicks": 0},
            )
            ch["posts"] += 1
            for k in ("impressions", "likes", "comments", "shares", "clicks"):
                ch[k] += data[k]
            posts_out.append({**_ser_post(post), "metrics": data})
        totals = {"posts": 0, "impressions": 0, "likes": 0, "comments": 0, "shares": 0, "clicks": 0}
        for ch in by_channel.values():
            for k in totals:
                totals[k] += ch[k]
        return Response(
            {"totals": totals, "by_channel": by_channel, "posts": posts_out}
        )
