"""Views do fluxo de marketing: aprovação de peças e versões de anexo.

Aprovação: decide o card em status "aprovacao" — aprovado avança para
"agendado", reprovado volta para "criacao" (com fallback por categoria do
workflow quando o projeto não usa os slugs de marketing). Registra histórico
e notifica o responsável/relator.

Versões: um novo upload sobre um anexo existente herda o group_id e recebe
version + 1, formando a linha do tempo da peça (v1 reprovada → v2 aprovada).

Relatório: agrega métricas do hub de marketing (cards por status/canal,
taxa de aprovação, publicadas vs planejadas) e a fila de publicação
(atrasadas, hoje, próximos 7 dias).

Biblioteca: lista as peças aprovadas do projeto (última versão de cada
grupo de anexo com approval_status="approved"), filtrável por canal.
"""
from datetime import date, timedelta

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import (
    AttachmentModel,
    CardHistoryModel,
    CardModel,
    WorkflowStatusModel,
)
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.extra_views import _ser_attachment
from contexts.projects.interface.api.notification_views import notify
from contexts.projects.interface.api.permissions import (
    assert_card_capability,
    assert_card_member,
    assert_project_member,
)


def _uid(request: Request) -> str:
    return str(request.user.id)


def _next_status(project_id: str, decision: str) -> str:
    """Status de destino após a decisão, conforme o workflow do projeto."""
    slugs = set(
        WorkflowStatusModel.objects.filter(project_id=project_id).values_list(
            "slug", flat=True
        )
    )
    if decision == "approved":
        if "agendado" in slugs:
            return "agendado"
        done = (
            WorkflowStatusModel.objects.filter(project_id=project_id, category="done")
            .order_by("order")
            .values_list("slug", flat=True)
            .first()
        )
        return done or "done"
    # rejected
    if "criacao" in slugs:
        return "criacao"
    in_prog = (
        WorkflowStatusModel.objects.filter(project_id=project_id, category="in_progress")
        .order_by("order")
        .values_list("slug", flat=True)
        .first()
    )
    return in_prog or "doing"


class CardApprovalView(APIView):
    """POST /api/cards/<card_id>/approval/ — {decision: approved|rejected, comment}."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, card_id: str) -> Response:
        assert_card_capability(
            card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE
        )
        decision = request.data.get("decision")
        if decision not in ("approved", "rejected"):
            return Response(
                {"error": "decision deve ser 'approved' ou 'rejected'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment = (request.data.get("comment") or "").strip()
        if decision == "rejected" and not comment:
            return Response(
                {"error": "Reprovação exige um comentário explicando o motivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        card = (
            CardModel.objects.filter(pk=card_id).select_related("project").first()
        )
        if card is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        old_status = card.status
        new_status = _next_status(str(card.project_id), decision)
        card.status = new_status
        card.save(update_fields=["status", "updated_at"])

        # Última versão pendente do card recebe a decisão.
        latest = AttachmentModel.objects.filter(card_id=card_id).order_by(
            "-created_at"
        ).first()
        if latest is not None:
            AttachmentModel.objects.filter(
                card_id=card_id, group_id=latest.group_id, version=latest.version
            ).update(approval_status=decision)

        label = "Aprovado" if decision == "approved" else "Reprovado"
        CardHistoryModel.objects.create(
            card_id=card_id,
            author=request.user,
            field="approval",
            old_value=old_status,
            new_value=f"{label}: {comment}" if comment else label,
        )

        ref = f"{card.project.key}-{card.number}"
        actor = _uid(request)
        targets = {str(card.assignee_id), str(card.reporter_id)} - {actor, "None"}
        for uid in targets:
            notify(
                user_id=uid,
                notif_type="card_approval",
                title=f"{label}: {ref} — {card.title}",
                body=comment,
                link=f"/boards?card={card.id}",
            )

        return Response(
            {
                "card_id": str(card.id),
                "decision": decision,
                "old_status": old_status,
                "new_status": new_status,
                "comment": comment,
            }
        )


class AttachmentVersionView(APIView):
    """POST /api/attachments/<attachment_id>/versions/ — nova versão da peça."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request: Request, attachment_id: str) -> Response:
        base = AttachmentModel.objects.filter(pk=attachment_id).first()
        if base is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        assert_card_member(card_id=str(base.card_id), user_id=_uid(request))
        qs = AttachmentModel.objects.filter(group_id=base.group_id).order_by("version")
        return Response([_ser_attachment(a, request) for a in qs])

    def post(self, request: Request, attachment_id: str) -> Response:
        base = AttachmentModel.objects.filter(pk=attachment_id).first()
        if base is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        assert_card_capability(
            card_id=str(base.card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE
        )
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "file required"}, status=status.HTTP_400_BAD_REQUEST)
        last_version = (
            AttachmentModel.objects.filter(group_id=base.group_id)
            .order_by("-version")
            .values_list("version", flat=True)
            .first()
        ) or 1
        a = AttachmentModel.objects.create(
            card_id=base.card_id,
            author=request.user,
            filename=file.name,
            file=file,
            mime_type=getattr(file, "content_type", ""),
            size=file.size,
            group_id=base.group_id,
            version=last_version + 1,
        )
        return Response(_ser_attachment(a, request), status=status.HTTP_201_CREATED)


def _done_slugs(project_id: str) -> set[str]:
    """Slugs de status considerados "publicado/concluído" no workflow do projeto."""
    return set(
        WorkflowStatusModel.objects.filter(
            project_id=project_id, category="done"
        ).values_list("slug", flat=True)
    ) or {"done"}


def _ser_queue_card(c: CardModel) -> dict:
    return {
        "id": str(c.id),
        "ref": f"{c.project.key}-{c.number}",
        "title": c.title,
        "status": c.status,
        "type": c.type,
        "channel": c.channel,
        "publish_date": c.publish_date.isoformat() if c.publish_date else None,
        "assignee_id": str(c.assignee_id) if c.assignee_id else None,
    }


class MarketingReportView(APIView):
    """GET /api/projects/<project_id>/marketing-report/ — dashboard + fila."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        cards = list(
            CardModel.objects.filter(project_id=project_id)
            .exclude(type="epic")
            .select_related("project")
        )
        done = _done_slugs(str(project_id))
        today = date.today()
        week_end = today + timedelta(days=7)

        by_status: dict[str, int] = {}
        by_channel: dict[str, int] = {}
        for c in cards:
            by_status[c.status] = by_status.get(c.status, 0) + 1
            if c.channel:
                by_channel[c.channel] = by_channel.get(c.channel, 0) + 1

        planned = [c for c in cards if c.publish_date]
        published = [c for c in planned if c.status in done]
        overdue = sorted(
            (c for c in planned if c.publish_date < today and c.status not in done),
            key=lambda c: c.publish_date,
        )
        due_today = [c for c in planned if c.publish_date == today and c.status not in done]
        due_week = sorted(
            (
                c
                for c in planned
                if today < c.publish_date <= week_end and c.status not in done
            ),
            key=lambda c: c.publish_date,
        )

        # Taxa de aprovação: decisões sobre a última versão de cada grupo de anexo.
        decisions = list(
            AttachmentModel.objects.filter(
                card__project_id=project_id, approval_status__in=["approved", "rejected"]
            ).values_list("approval_status", flat=True)
        )
        approved_n = decisions.count("approved")
        rejected_n = decisions.count("rejected")
        total_decisions = approved_n + rejected_n

        return Response(
            {
                "totals": {
                    "cards": len(cards),
                    "planned": len(planned),
                    "published": len(published),
                    "overdue": len(overdue),
                },
                "by_status": by_status,
                "by_channel": by_channel,
                "approval": {
                    "approved": approved_n,
                    "rejected": rejected_n,
                    "rate": round(approved_n / total_decisions * 100)
                    if total_decisions
                    else None,
                },
                "queue": {
                    "overdue": [_ser_queue_card(c) for c in overdue],
                    "today": [_ser_queue_card(c) for c in due_today],
                    "week": [_ser_queue_card(c) for c in due_week],
                },
                "done_statuses": sorted(done),
            }
        )


class MarketingAssetsView(APIView):
    """GET /api/projects/<project_id>/marketing-assets/?channel= — biblioteca."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        qs = (
            AttachmentModel.objects.filter(
                card__project_id=project_id, approval_status="approved"
            )
            .select_related("card", "card__project")
            .order_by("group_id", "-version")
        )
        channel = (request.query_params.get("channel") or "").strip()
        if channel:
            qs = qs.filter(card__channel=channel)

        # Mantém apenas a última versão aprovada de cada grupo.
        seen: set[str] = set()
        assets = []
        for a in qs:
            gid = str(a.group_id)
            if gid in seen:
                continue
            seen.add(gid)
            item = _ser_attachment(a, request)
            item["card"] = _ser_queue_card(a.card)
            assets.append(item)

        assets.sort(key=lambda x: x["created_at"], reverse=True)
        return Response(assets)
