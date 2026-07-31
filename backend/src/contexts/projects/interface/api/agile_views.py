"""Views ágeis (paridade Jira): épicos, ciclo de vida de sprint e ranking Lexorank.

Seguem o padrão pragmático de extra_views: ORM direto + guards de capacidade.
"""
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import CardModel, SprintModel
from contexts.projects.infrastructure.lexorank import rank_between
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.notification_views import notify
from contexts.projects.interface.api.permissions import (
    assert_card_capability,
    assert_card_member,
    assert_project_capability,
    assert_project_member,
)
from shared.domain.errors import NotFoundError, ValidationError

# Paleta de cores de épico (Atlassian).
EPIC_COLORS = [
    "#8270DB", "#2898BD", "#22A06B", "#E56910", "#C9372C",
    "#8F7EE7", "#38A8C8", "#4BCE97", "#F5CD47", "#9F8FEF",
]


def _uid(request: Request) -> str:
    return str(request.user.id)


def assert_valid_epic(*, project_id: str, epic_id: str) -> None:
    """Garante que epic_id aponta para um épico do mesmo projeto."""
    epic = CardModel.objects.filter(id=epic_id).first()
    if epic is None:
        raise NotFoundError("Épico não encontrado.")
    if str(epic.project_id) != str(project_id):
        raise ValidationError("O épico precisa pertencer ao mesmo projeto do card.")
    if epic.type != "epic":
        raise ValidationError("O card informado como épico não é do tipo épico.")


class EpicListView(APIView):
    """Lista os épicos de um projeto com progresso: GET /projects/<id>/epics/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        epics = (
            CardModel.objects.filter(project_id=project_id, type="epic")
            .select_related("project")
            .annotate(
                children_total=Count("epic_children", distinct=True),
                children_done=Count(
                    "epic_children",
                    filter=Q(epic_children__status="done"),
                    distinct=True,
                ),
                points_total=Sum("epic_children__points"),
                points_done=Sum(
                    "epic_children__points", filter=Q(epic_children__status="done")
                ),
            )
            .order_by("rank", "number")
        )
        project_key = epics[0].project.key if epics else None
        rows = []
        for e in epics:
            rows.append({
                "id": str(e.id),
                "ref": f"{e.project.key}-{e.number}" if project_key is None else f"{project_key}-{e.number}",
                "title": e.title,
                "status": e.status,
                "color": e.epic_color or EPIC_COLORS[e.number % len(EPIC_COLORS)],
                "start_date": e.start_date.isoformat() if e.start_date else None,
                "due_date": e.due_date.isoformat() if e.due_date else None,
                "children_total": e.children_total,
                "children_done": e.children_done,
                "points_total": e.points_total or 0,
                "points_done": e.points_done or 0,
            })
        return Response(rows)


class SprintStartView(APIView):
    """Inicia uma sprint: POST /sprints/<id>/start/ {start_date?, end_date?, goal?}."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, sprint_id: str) -> Response:
        sprint = SprintModel.objects.filter(id=sprint_id).select_related("project").first()
        if sprint is None:
            raise NotFoundError("Sprint não encontrada.")
        assert_project_capability(
            project_id=str(sprint.project_id), user_id=_uid(request),
            capability=caps.MANAGE_SPRINTS,
        )
        if sprint.status == "active":
            return Response({"error": "A sprint já está ativa."}, status=status.HTTP_400_BAD_REQUEST)
        if sprint.status == "closed":
            return Response({"error": "Sprint encerrada não pode ser reiniciada."}, status=status.HTTP_400_BAD_REQUEST)
        other = SprintModel.objects.filter(
            project_id=sprint.project_id, status="active"
        ).exclude(id=sprint.id).first()
        if other is not None:
            return Response(
                {"error": f"Já existe uma sprint ativa ({other.name}). Conclua-a antes de iniciar outra."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not sprint.cards.exists():
            return Response(
                {"error": "Adicione ao menos um card à sprint antes de iniciá-la."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sprint.status = "active"
        sprint.started_at = timezone.now()
        if request.data.get("start_date"):
            sprint.start_date = request.data["start_date"]
        if request.data.get("end_date"):
            sprint.end_date = request.data["end_date"]
        if "goal" in request.data:
            sprint.goal = request.data.get("goal") or ""
        # Sprint sem janela definida não rende burndown nem "dias restantes".
        # Assume o padrão do time (começa hoje, 2 semanas) em vez de ficar nula.
        if not sprint.start_date:
            sprint.start_date = timezone.localdate()
        if not sprint.end_date:
            sprint.end_date = sprint.start_date + timedelta(days=14)
        sprint.save()

        # Cards da sprint ainda em backlog sobem para "todo" (como no Jira).
        sprint.cards.filter(status="backlog").update(status="todo")

        # Notifica os responsáveis por cards da sprint.
        actor = _uid(request)
        assignees = set(
            str(a) for a in sprint.cards.exclude(assignee=None).values_list("assignee_id", flat=True)
        ) - {actor}
        for uid in assignees:
            notify(
                user_id=uid,
                notif_type="sprint_started",
                title=f"Sprint iniciada: {sprint.name}",
                body=sprint.goal,
                link="/boards",
            )
        return Response(_ser_sprint(sprint))


class SprintCompleteView(APIView):
    """Conclui uma sprint: POST /sprints/<id>/complete/ {move_to: "backlog"|sprint_id}.

    Cards não concluídos vão para o backlog ou para outra sprint. Retorna resumo.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, sprint_id: str) -> Response:
        sprint = SprintModel.objects.filter(id=sprint_id).first()
        if sprint is None:
            raise NotFoundError("Sprint não encontrada.")
        assert_project_capability(
            project_id=str(sprint.project_id), user_id=_uid(request),
            capability=caps.MANAGE_SPRINTS,
        )
        if sprint.status != "active":
            return Response(
                {"error": "Só é possível concluir uma sprint ativa."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        done_count = sprint.cards.filter(status="done").count()
        open_cards = sprint.cards.exclude(status="done")
        open_count = open_cards.count()

        move_to = request.data.get("move_to", "backlog")
        if move_to == "backlog":
            open_cards.update(sprint=None, status="backlog")
        else:
            target = SprintModel.objects.filter(
                id=move_to, project_id=sprint.project_id
            ).exclude(id=sprint.id).first()
            if target is None or target.status == "closed":
                return Response(
                    {"error": "Sprint de destino inválida."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            open_cards.update(sprint=target)

        sprint.status = "closed"
        sprint.completed_at = timezone.now()
        sprint.save(update_fields=["status", "completed_at"])

        return Response({
            **_ser_sprint(sprint),
            "summary": {
                "completed_cards": done_count,
                "moved_cards": open_count,
                "moved_to": move_to,
            },
        })


class CardRankView(APIView):
    """Reposiciona um card (Lexorank): POST /cards/<id>/rank/ {before_id?, after_id?}.

    `before_id`/`after_id` são os vizinhos na nova posição (na mesma lista visual).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, card_id: str) -> Response:
        assert_card_capability(
            card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE
        )
        card = CardModel.objects.filter(id=card_id).first()
        if card is None:
            raise NotFoundError("Card não encontrado.")

        def _rank_of(cid: str | None) -> str:
            if not cid:
                return ""
            neighbor = CardModel.objects.filter(id=cid, project_id=card.project_id).first()
            if neighbor is None:
                raise ValidationError("Card vizinho inválido.")
            return neighbor.rank

        prev_rank = _rank_of(request.data.get("before_id"))
        next_rank = _rank_of(request.data.get("after_id"))
        try:
            card.rank = rank_between(prev_rank, next_rank)
        except ValueError as exc:
            raise ValidationError("Posição inválida: vizinhos fora de ordem.") from exc
        card.save(update_fields=["rank"])
        return Response({"id": str(card.id), "rank": card.rank})


class CardChildrenView(APIView):
    """Filhos de um card: GET /cards/<id>/children/.

    Para épico devolve os cards do épico; para os demais, as subtarefas.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, card_id: str) -> Response:
        assert_card_member(card_id=str(card_id), user_id=_uid(request))
        card = CardModel.objects.select_related("project").filter(id=card_id).first()
        if card is None:
            raise NotFoundError("Card não encontrado.")
        qs = (card.epic_children if card.type == "epic" else card.subtasks).order_by(
            "rank", "number"
        )
        key = card.project.key
        return Response([
            {
                "id": str(c.id),
                "ref": f"{key}-{c.number}",
                "title": c.title,
                "status": c.status,
                "type": c.type,
                "priority": c.priority,
                "points": c.points,
                "assignee_id": str(c.assignee_id) if c.assignee_id else None,
            }
            for c in qs
        ])


def _ser_sprint(s: SprintModel) -> dict:
    return {
        "id": str(s.id),
        "project_id": str(s.project_id),
        "name": s.name,
        "goal": s.goal,
        "start_date": s.start_date.isoformat() if s.start_date else None,
        "end_date": s.end_date.isoformat() if s.end_date else None,
        "status": s.status,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
    }
