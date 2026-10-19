"""Etapa 3: webhooks (outbox + entrega assinada com HMAC e novas tentativas)."""
import hashlib
import hmac
import json
from datetime import timedelta

import httpx
import pytest
from django.utils import timezone

from contexts.agent_api.application.webhooks import deliver_pending
from contexts.agent_api.infrastructure.models import WebhookOutboxModel
from contexts.identity.infrastructure.django.models import WorkspaceModel
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    ProjectModel,
    SprintModel,
)

URL = "http://agentes.interno/webhook"
SECRET = "segredo-hmac"


@pytest.fixture(autouse=True)
def _config(settings):
    settings.AGENT_WEBHOOK_URL = URL
    settings.AGENT_WEBHOOK_SECRET = SECRET


@pytest.fixture
def projeto(agente, ws):
    return ProjectModel.objects.create(workspace=ws, name="P", key="P")


def _eventos():
    return list(WebhookOutboxModel.objects.order_by("ocorrido_em").values_list("evento", flat=True))


# ── geração dos eventos ───────────────────────────────────────────────────────

def test_card_criado(projeto):
    card = CardModel.objects.create(
        project=projeto, number=1, title="Pedido", source="public_link", type="bug"
    )
    ev = WebhookOutboxModel.objects.get()
    assert ev.evento == "card.criado"
    assert (ev.recurso_tipo, ev.recurso_id) == ("card", str(card.id))
    assert ev.dados["origem"] == "pedido_cliente"
    assert ev.dados["tipo"] == "bug"
    assert ev.dados["projeto_id"] == str(projeto.id)


def test_epico_nao_gera_evento(projeto):
    CardModel.objects.create(project=projeto, number=1, title="E", type="epic")
    assert _eventos() == []


def test_workspace_sem_agente_nao_gera_evento(ws, agente):
    outro = WorkspaceModel.objects.create(name="X", slug="x", owner=ws.owner)
    p = ProjectModel.objects.create(workspace=outro, name="X", key="X")
    CardModel.objects.create(project=p, number=1, title="C")
    assert _eventos() == []


def test_sem_url_configurada_nao_gera_evento(projeto, settings):
    settings.AGENT_WEBHOOK_URL = ""
    CardModel.objects.create(project=projeto, number=1, title="C")
    assert _eventos() == []


def test_status_alterado_e_bloqueado(projeto):
    card = CardModel.objects.create(project=projeto, number=1, title="C")
    WebhookOutboxModel.objects.all().delete()
    CardHistoryModel.objects.create(card=card, field="status", old_value="todo", new_value="doing")
    card.block_reason = "Sem acesso"
    card.save(update_fields=["block_reason"])
    CardHistoryModel.objects.create(card=card, field="blocked", old_value="", new_value="1")
    CardHistoryModel.objects.create(card=card, field="blocked", old_value="1", new_value="")
    status_ev, bloq_ev = WebhookOutboxModel.objects.order_by("ocorrido_em")
    assert status_ev.evento == "card.status_alterado"
    assert (status_ev.dados["de"], status_ev.dados["para"]) == ("todo", "doing")
    assert bloq_ev.evento == "card.bloqueado"
    assert bloq_ev.dados["motivo"] == "Sem acesso"


def test_sprint_encerrada(projeto):
    sprint = SprintModel.objects.create(
        project=projeto, name="S1", status="active", started_at=timezone.now() - timedelta(days=1)
    )
    card = CardModel.objects.create(project=projeto, number=1, title="C", sprint=sprint)
    CardHistoryModel.objects.filter(card=card).delete()
    WebhookOutboxModel.objects.all().delete()
    card.resolution, card.resolved_at = "done", timezone.now()
    card.save(update_fields=["resolution", "resolved_at"])
    sprint.status, sprint.completed_at = "closed", timezone.now()
    sprint.save()
    sprint.save()  # salvar de novo já fechada não duplica
    ev = WebhookOutboxModel.objects.get()
    assert ev.evento == "sprint.encerrada"
    assert ev.dados["cards_planejados"] == [str(card.id)]
    assert ev.dados["cards_concluidos"] == [str(card.id)]
    assert (ev.dados["total_planejados"], ev.dados["total_concluidos"]) == (1, 1)


# ── entrega ───────────────────────────────────────────────────────────────────

def _client(status=200, seen=None):
    def handler(request):
        if seen is not None:
            seen.append(request)
        return httpx.Response(status)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_entrega_assinada_e_marca_entregue(projeto):
    CardModel.objects.create(project=projeto, number=1, title="C")
    seen = []
    assert deliver_pending(client=_client(200, seen)) == 1
    (req,) = seen
    body = json.loads(req.content)
    ev = WebhookOutboxModel.objects.get()
    assert set(body) == {"id_evento", "evento", "ocorrido_em", "recurso", "dados"}
    assert body["id_evento"] == str(ev.id_evento)
    assert body["recurso"] == {"tipo": "card", "id": ev.recurso_id}
    esperado = hmac.new(SECRET.encode(), req.content, hashlib.sha256).hexdigest()
    assert req.headers["X-Office-Signature"] == esperado
    assert ev.entregue_em is not None
    assert deliver_pending(client=_client(200, seen)) == 0  # não reenvia


def test_falha_reagenda_com_espera_crescente(projeto):
    CardModel.objects.create(project=projeto, number=1, title="C")
    deliver_pending(client=_client(500))
    ev = WebhookOutboxModel.objects.get()
    assert ev.entregue_em is None and ev.tentativas == 1
    primeira_espera = ev.proxima_tentativa - timezone.now()
    assert primeira_espera > timedelta(seconds=10)
    assert deliver_pending(client=_client(500)) == 0  # ainda não é hora
    WebhookOutboxModel.objects.update(proxima_tentativa=timezone.now())
    deliver_pending(client=_client(500))
    ev.refresh_from_db()
    assert ev.tentativas == 2
    assert ev.proxima_tentativa - timezone.now() > primeira_espera


def test_erro_de_rede_tambem_reagenda(projeto):
    CardModel.objects.create(project=projeto, number=1, title="C")

    def boom(request):
        raise httpx.ConnectError("sem rota")

    deliver_pending(client=httpx.Client(transport=httpx.MockTransport(boom)))
    ev = WebhookOutboxModel.objects.get()
    assert ev.tentativas == 1 and "sem rota" in ev.ultimo_erro


def test_desiste_depois_de_24h(projeto):
    CardModel.objects.create(project=projeto, number=1, title="C")
    WebhookOutboxModel.objects.update(ocorrido_em=timezone.now() - timedelta(hours=25))
    deliver_pending(client=_client(500))
    ev = WebhookOutboxModel.objects.get()
    assert ev.desistiu_em is not None
    WebhookOutboxModel.objects.update(proxima_tentativa=timezone.now())
    assert deliver_pending(client=_client(200)) == 0
