"""Serviço de publicação da fila social.

Único ponto que efetiva um post: usado tanto pela ação manual ("Publicar
agora") quanto pelo worker cron (`publish_due_posts`). Concentra a transição
de estado, a coleta de métricas e a política de retry para não duplicar lógica.

Fluxo:
* sucesso  → status=published, external_id, published_at, métricas coletadas.
* falha    → attempts += 1; enquanto < MAX_ATTEMPTS, reagenda retry com backoff
  (next_attempt_at) mantendo status=scheduled; ao atingir o teto, status=failed.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from contexts.integrations.infrastructure import providers, social_publisher
from contexts.integrations.infrastructure.django.models import (
    PostMetricModel,
    ScheduledPostModel,
)

MAX_ATTEMPTS = 3
# Backoff por tentativa (minutos): 1ª falha espera 5min, 2ª espera 20min.
_BACKOFF_MIN = {1: 5, 2: 20}


def publish_now(post: ScheduledPostModel) -> ScheduledPostModel:
    """Publica o post imediatamente. Levanta PublishError se falhar (ação manual)."""
    result = providers.publish_post(post)  # pode levantar PublishError
    post.external_id = result["external_id"]
    post.status = "published"
    post.error = ""
    post.next_attempt_at = None
    post.published_at = timezone.now()
    post.attempts += 1
    post.save()
    _collect(post)
    post.refresh_from_db()
    return post


def try_publish(post: ScheduledPostModel) -> bool:
    """Tenta publicar aplicando retry/backoff. Retorna True se publicou.

    Usado pelo worker: nunca levanta — falha vira retry ou status=failed.
    """
    post.attempts += 1
    try:
        result = providers.publish_post(post)
    except social_publisher.PublishError as exc:
        return _handle_failure(post, str(exc))
    except Exception as exc:  # defensivo: erro inesperado não trava a fila
        return _handle_failure(post, f"Erro inesperado: {exc}")

    post.external_id = result["external_id"]
    post.status = "published"
    post.error = ""
    post.next_attempt_at = None
    post.published_at = timezone.now()
    post.save()
    _collect(post)
    return True


def _handle_failure(post: ScheduledPostModel, message: str) -> bool:
    post.error = message
    if post.attempts >= MAX_ATTEMPTS:
        post.status = "failed"
        post.next_attempt_at = None
    else:
        post.status = "scheduled"
        delay = _BACKOFF_MIN.get(post.attempts, 60)
        post.next_attempt_at = timezone.now() + timedelta(minutes=delay)
    post.save()
    return False


def _collect(post: ScheduledPostModel) -> None:
    try:
        data = providers.collect_metrics(post)
    except Exception:
        return
    PostMetricModel.objects.update_or_create(post=post, defaults=data)


def due_posts():
    """Posts prontos para disparar: agendados, no horário e fora do backoff."""
    from django.db.models import Q

    now = timezone.now()
    return (
        ScheduledPostModel.objects.filter(status="scheduled", scheduled_at__lte=now)
        .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
        .filter(attempts__lt=MAX_ATTEMPTS)
        .select_related("account")
        .order_by("scheduled_at")
    )
