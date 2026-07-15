"""Views do fluxo de marketing: aprovação de peças e versões de anexo.

Aprovação: decide o card em status "aprovacao" — aprovado avança para
"agendado", reprovado volta para "criacao" (com fallback por categoria do
workflow quando o projeto não usa os slugs de marketing). Registra histórico
e notifica o responsável/relator.

Versões: um novo upload sobre um anexo existente herda o group_id e recebe
version + 1, formando a linha do tempo da peça (v1 reprovada → v2 aprovada).
"""
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
