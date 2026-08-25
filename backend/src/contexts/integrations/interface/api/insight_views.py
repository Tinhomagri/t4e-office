"""Endpoints de leitura analítica do contexto integrations.

Alimentam as telas do command center de marketing. Todos são somente-leitura e
agregam no banco (nunca chamam a API dos providers), para que abrir a tela não
custe uma rodada de rede por post.

* analytics/timeseries/ — série diária + comparação de período + top posts
* queue/stats/          — saúde da fila de publicação (contagens, falhas, próximo)
* accounts/health/      — estado de cada conta conectada (token, uso, volume)
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure.django.models import SocialAccountModel
from contexts.integrations.infrastructure.django.models import ScheduledPostModel
from contexts.integrations.interface.api.views import _require_member, _workspace_id
from shared.interface.permissions import SpaceAccessPermission

METRIC_KEYS = ("impressions", "likes", "comments", "shares", "clicks")

# Janela máxima aceita: acima disso a série vira ruído e o payload cresce à toa.
MAX_DAYS = 365


def _days_param(request: Request, default: int = 30) -> int:
    raw = request.query_params.get("days") or default
    try:
        days = int(raw)
    except (TypeError, ValueError):
        days = default
    return max(1, min(days, MAX_DAYS))


def _zero_metrics() -> dict[str, int]:
    return {k: 0 for k in METRIC_KEYS}


def _metrics_of(post: ScheduledPostModel) -> dict[str, int]:
    m = getattr(post, "metric", None)
    if m is None:
        return _zero_metrics()
    return {k: getattr(m, k) for k in METRIC_KEYS}


def _add(target: dict[str, int], source: dict[str, int]) -> None:
    for k in METRIC_KEYS:
        target[k] += source[k]


def _engagement(m: dict[str, int]) -> float:
    """Interações sobre impressões. Sem impressão, engajamento é 0 (não NaN)."""
    if not m["impressions"]:
        return 0.0
    interactions = m["likes"] + m["comments"] + m["shares"] + m["clicks"]
    return round(interactions / m["impressions"] * 100, 2)


class AnalyticsTimeseriesView(APIView):
    """GET série diária de métricas + período anterior + ranking de posts.

    Query: workspace_id (obrigatório), days (default 30), channel, project_id.
    """

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request)
        _require_member(request, workspace_id)
        days = _days_param(request)

        now = timezone.now()
        end_day = timezone.localdate()
        start_day = end_day - timedelta(days=days - 1)
        # O período anterior tem o mesmo tamanho e termina na véspera do atual —
        # é o que torna a variação percentual comparável.
        prev_start_day = start_day - timedelta(days=days)

        tz = timezone.get_current_timezone()
        window_start = timezone.make_aware(datetime.combine(prev_start_day, time.min), tz)

        qs = (
            ScheduledPostModel.objects.filter(
                workspace_id=workspace_id,
                status="published",
                published_at__gte=window_start,
                published_at__lte=now,
            )
            .select_related("account")
            .prefetch_related("metric")
        )
        channel = request.query_params.get("channel")
        if channel:
            qs = qs.filter(account__channel=channel)
        project_id = request.query_params.get("project_id")
        if project_id:
            qs = qs.filter(project_id=project_id)

        series: dict[date, dict] = {
            start_day + timedelta(days=i): {"date": (start_day + timedelta(days=i)).isoformat(), "posts": 0, **_zero_metrics()}
            for i in range(days)
        }
        by_channel: dict[str, dict] = {}
        # Heatmap dia-da-semana × hora: base do "melhor horário para postar".
        heatmap: dict[str, dict[str, int]] = {}
        totals = {"posts": 0, **_zero_metrics()}
        previous = {"posts": 0, **_zero_metrics()}
        ranked: list[dict] = []

        for post in qs:
            published = timezone.localtime(post.published_at)
            day = published.date()
            metrics = _metrics_of(post)

            if day < start_day:
                previous["posts"] += 1
                _add(previous, metrics)
                continue

            bucket = series.get(day)
            if bucket is not None:
                bucket["posts"] += 1
                _add(bucket, metrics)

            totals["posts"] += 1
            _add(totals, metrics)

            ch = by_channel.setdefault(
                post.account.channel, {"posts": 0, **_zero_metrics()}
            )
            ch["posts"] += 1
            _add(ch, metrics)

            slot = heatmap.setdefault(str(published.weekday()), {})
            hour = str(published.hour)
            slot[hour] = slot.get(hour, 0) + metrics["impressions"]

            ranked.append(
                {
                    "id": str(post.id),
                    "channel": post.account.channel,
                    "account_name": post.account.account_name,
                    "content": post.content[:280],
                    "published_at": post.published_at.isoformat(),
                    "metrics": metrics,
                    "engagement_rate": _engagement(metrics),
                }
            )

        for stats in by_channel.values():
            stats["engagement_rate"] = _engagement(stats)

        ranked.sort(key=lambda p: p["metrics"]["impressions"], reverse=True)

        return Response(
            {
                "range": {"start": start_day.isoformat(), "end": end_day.isoformat(), "days": days},
                "series": list(series.values()),
                "totals": {**totals, "engagement_rate": _engagement(totals)},
                "previous": {**previous, "engagement_rate": _engagement(previous)},
                "by_channel": by_channel,
                "heatmap": heatmap,
                "top_posts": ranked[:10],
            }
        )


class QueueStatsView(APIView):
    """GET saúde da fila: contagens por status/canal, falhas e próximo disparo."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request)
        _require_member(request, workspace_id)

        now = timezone.now()
        qs = ScheduledPostModel.objects.filter(workspace_id=workspace_id).select_related(
            "account"
        )

        by_status = {"draft": 0, "scheduled": 0, "published": 0, "failed": 0}
        by_channel: dict[str, dict[str, int]] = {}
        # Volume agendado por dia nos próximos 14 dias — mostra buraco e pico.
        upcoming: dict[str, int] = {}
        overdue = 0
        next_post: dict | None = None
        published_last_7d = 0
        failed_last_7d = 0
        week_ago = now - timedelta(days=7)
        horizon = timezone.localdate() + timedelta(days=14)

        for post in qs:
            by_status[post.status] = by_status.get(post.status, 0) + 1
            ch = by_channel.setdefault(
                post.account.channel,
                {"draft": 0, "scheduled": 0, "published": 0, "failed": 0},
            )
            ch[post.status] = ch.get(post.status, 0) + 1

            if post.status == "scheduled":
                day = timezone.localtime(post.scheduled_at).date()
                if timezone.localdate() <= day <= horizon:
                    upcoming[day.isoformat()] = upcoming.get(day.isoformat(), 0) + 1
                # Agendado e já passou da hora = worker atrasado ou travado.
                if post.scheduled_at < now:
                    overdue += 1
                elif next_post is None or post.scheduled_at < datetime.fromisoformat(
                    next_post["scheduled_at"]
                ):
                    next_post = {
                        "id": str(post.id),
                        "channel": post.account.channel,
                        "content": post.content[:140],
                        "scheduled_at": post.scheduled_at.isoformat(),
                    }

            if post.status == "published" and post.published_at and post.published_at >= week_ago:
                published_last_7d += 1
            if post.status == "failed" and post.updated_at >= week_ago:
                failed_last_7d += 1

        attempted = published_last_7d + failed_last_7d
        success_rate = round(published_last_7d / attempted * 100, 1) if attempted else 100.0

        return Response(
            {
                "by_status": by_status,
                "by_channel": by_channel,
                "upcoming": upcoming,
                "overdue": overdue,
                "next_post": next_post,
                "last_7d": {
                    "published": published_last_7d,
                    "failed": failed_last_7d,
                    "success_rate": success_rate,
                },
            }
        )


class AccountsHealthView(APIView):
    """GET estado operacional de cada conta social conectada do workspace."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request)
        _require_member(request, workspace_id)
        days = _days_param(request)

        now = timezone.now()
        start_day = timezone.localdate() - timedelta(days=days - 1)
        tz = timezone.get_current_timezone()
        window_start = timezone.make_aware(datetime.combine(start_day, time.min), tz)

        accounts = SocialAccountModel.objects.filter(workspace_id=workspace_id)
        posts = (
            ScheduledPostModel.objects.filter(workspace_id=workspace_id)
            .select_related("account")
            .prefetch_related("metric")
        )

        per_account: dict[str, dict] = {}
        for account in accounts:
            expires = account.token_expires_at
            expires_in_days = (
                (expires - now).days if expires else None
            )
            per_account[str(account.id)] = {
                "id": str(account.id),
                "channel": account.channel,
                "account_name": account.account_name,
                "connected_at": account.connected_at.isoformat(),
                "has_token": bool(account.access_token_encrypted),
                "can_refresh": bool(account.refresh_token_encrypted),
                "token_expires_at": expires.isoformat() if expires else None,
                "token_expires_in_days": expires_in_days,
                # Sem token = quebrado; expirando em <7d = atenção; resto = ok.
                "status": (
                    "disconnected"
                    if not account.access_token_encrypted
                    else "expired"
                    if expires_in_days is not None and expires_in_days < 0
                    else "expiring"
                    if expires_in_days is not None and expires_in_days <= 7
                    else "healthy"
                ),
                "posts": {"scheduled": 0, "published": 0, "failed": 0},
                "impressions": 0,
                "last_published_at": None,
                "sparkline": [0] * days,
            }

        for post in posts:
            entry = per_account.get(str(post.account_id))
            if entry is None:
                continue
            if post.status in entry["posts"]:
                entry["posts"][post.status] += 1
            if post.status != "published" or not post.published_at:
                continue
            entry["impressions"] += _metrics_of(post)["impressions"]
            if (
                entry["last_published_at"] is None
                or post.published_at.isoformat() > entry["last_published_at"]
            ):
                entry["last_published_at"] = post.published_at.isoformat()
            if post.published_at >= window_start:
                index = (timezone.localtime(post.published_at).date() - start_day).days
                if 0 <= index < days:
                    entry["sparkline"][index] += 1

        return Response({"days": days, "accounts": list(per_account.values())})
