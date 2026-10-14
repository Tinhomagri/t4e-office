"""Trechos rastreados materializados: o histórico do card gera linhas de tempo
por pessoa, com id estável entre recálculos."""
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command

from contexts.agent_api.infrastructure.models import TrackedTimeEntryModel
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    ProjectModel,
    WorkflowStatusModel,
)

SP = ZoneInfo("America/Sao_Paulo")


@pytest.fixture
def card(ws):
    owner = ws.owner
    project = ProjectModel.objects.create(workspace=ws, name="P", key="P")
    WorkflowStatusModel.objects.create(
        project=project, name="Fazendo", slug="doing",
        category="in_progress", order=1, is_working=True,
    )
    return CardModel.objects.create(
        project=project, number=1, title="C", status="doing", assignee=owner
    )


def _hist(card, field, old, new, when):
    entry = CardHistoryModel.objects.create(card=card, field=field, old_value=old, new_value=new)
    # created_at é auto_now_add: ajusta depois pra simular o passado.
    CardHistoryModel.objects.filter(pk=entry.pk).update(created_at=when)
    # O signal rodou com o horário "agora"; recalcula com o horário real.
    call_command("recalcular_tempo_rastreado", card=str(card.id))
    return entry


def test_pausa_gera_trecho_com_pessoa(card):
    _hist(card, "status", "todo", "doing", datetime(2026, 10, 12, 10, tzinfo=SP))
    _hist(card, "paused", "", "1", datetime(2026, 10, 12, 12, tzinfo=SP))
    (entry,) = TrackedTimeEntryModel.objects.all()
    assert entry.pessoa_id == card.assignee_id
    assert entry.segundos == 7200
    assert entry.card_id == card.id


def test_recalcular_mantem_o_mesmo_id(card):
    _hist(card, "status", "todo", "doing", datetime(2026, 10, 12, 10, tzinfo=SP))
    _hist(card, "paused", "", "1", datetime(2026, 10, 12, 12, tzinfo=SP))
    antes = TrackedTimeEntryModel.objects.get().id
    call_command("recalcular_tempo_rastreado")
    assert TrackedTimeEntryModel.objects.get().id == antes


def test_signal_cria_trecho_sem_comando(card, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        CardHistoryModel.objects.create(
            card=card, field="status", old_value="todo", new_value="doing"
        )
        CardHistoryModel.objects.create(card=card, field="paused", old_value="", new_value="1")
    assert TrackedTimeEntryModel.objects.filter(card=card).count() == 1


def test_campo_irrelevante_nao_recalcula(card, django_assert_max_num_queries):
    with django_assert_max_num_queries(2):
        CardHistoryModel.objects.create(card=card, field="title", old_value="a", new_value="b")
