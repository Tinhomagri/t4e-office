"""Signals da API de agentes:

- trechos rastreados em dia: toda entrada de histórico que mexe em
  status/pausa/responsável recalcula os trechos daquele card;
- webhooks: mudanças que os agentes acompanham viram eventos na outbox."""
from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from contexts.agent_api.application.sprint_summary import done_cards, planned_cards
from contexts.agent_api.application.tracked_time import TRIGGER_FIELDS, rebuild_tracked_entries
from contexts.agent_api.application.webhooks import enqueue
from contexts.agent_api.interface.cards import CARD_TYPE, PRIORITY, origem
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    ProjectModel,
    SprintModel,
)


@receiver(post_save, sender=CardHistoryModel, dispatch_uid="agent_api_tracked_time")
def _on_history(sender, instance, created, **kwargs):
    if created and instance.field in TRIGGER_FIELDS:
        card_id = instance.card_id
        transaction.on_commit(lambda: rebuild_tracked_entries(card_id))


# ── Webhooks (outbox) ─────────────────────────────────────────────────────────
# Gravados na mesma transação da mudança: se ela der rollback, o evento some
# junto. Status alterado por `QuerySet.update()` (automação) não passa por
# signal nem gera histórico — fica de fora, igual ao tempo rastreado.


@receiver(post_save, sender=CardModel, dispatch_uid="agent_api_webhook_card_created")
def _webhook_card_created(sender, instance, created, **kwargs):
    if not _enabled() or not created or instance.type not in CARD_TYPE:
        return
    enqueue(
        workspace_id=_workspace_of(instance),
        evento="card.criado",
        recurso_tipo="card",
        recurso_id=instance.id,
        dados={
            "projeto_id": str(instance.project_id),
            "titulo": instance.title,
            "tipo": CARD_TYPE[instance.type],
            "prioridade": PRIORITY.get(instance.priority, "media"),
            "status": instance.status,
            "origem": origem(instance),
        },
    )


@receiver(post_save, sender=CardHistoryModel, dispatch_uid="agent_api_webhook_card_history")
def _webhook_card_history(sender, instance, created, **kwargs):
    if not _enabled() or not created or instance.field not in ("status", "blocked"):
        return
    card = instance.card
    if card.type not in CARD_TYPE:
        return
    base = {"workspace_id": _workspace_of(card), "recurso_tipo": "card", "recurso_id": card.id}
    if instance.field == "status":
        enqueue(
            **base,
            evento="card.status_alterado",
            dados={
                "projeto_id": str(card.project_id),
                "de": instance.old_value,
                "para": instance.new_value,
            },
        )
    elif instance.new_value:  # só ao bloquear; desbloquear não é alerta
        enqueue(
            **base,
            evento="card.bloqueado",
            dados={"projeto_id": str(card.project_id), "motivo": card.block_reason},
        )


@receiver(pre_save, sender=SprintModel, dispatch_uid="agent_api_webhook_sprint_pre")
def _remember_sprint_status(sender, instance, **kwargs):
    if not _enabled():
        return
    previous = SprintModel.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    instance._agent_previous_status = previous


@receiver(post_save, sender=SprintModel, dispatch_uid="agent_api_webhook_sprint_closed")
def _webhook_sprint_closed(sender, instance, **kwargs):
    if not _enabled():
        return
    if instance.status != "closed" or getattr(instance, "_agent_previous_status", None) == "closed":
        return
    planned = planned_cards([instance]).get(str(instance.id), [])
    done = done_cards(instance, planned)
    enqueue(
        workspace_id=ProjectModel.objects.filter(id=instance.project_id)
        .values_list("workspace_id", flat=True)
        .first(),
        evento="sprint.encerrada",
        recurso_tipo="sprint",
        recurso_id=instance.id,
        dados={
            "projeto_id": str(instance.project_id),
            "nome": instance.name,
            "cards_planejados": [str(c.id) for c in planned],
            "cards_concluidos": [str(c.id) for c in done],
            "total_planejados": len(planned),
            "total_concluidos": len(done),
        },
    )


def _enabled() -> bool:
    # Sem URL configurada, nem consulta o banco.
    return bool(getattr(settings, "AGENT_WEBHOOK_URL", ""))


def _workspace_of(card):
    return ProjectModel.objects.filter(id=card.project_id).values_list(
        "workspace_id", flat=True
    ).first()
