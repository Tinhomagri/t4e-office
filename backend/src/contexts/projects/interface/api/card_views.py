"""Views finas para cards."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.application.use_cases.create_card import CreateCard
from contexts.projects.application.use_cases.create_comment import CreateComment
from contexts.projects.application.use_cases.list_cards import ListCards
from contexts.projects.application.use_cases.list_comments import ListComments
from contexts.projects.application.use_cases.list_history import ListHistory
from contexts.projects.application.use_cases.update_card import UpdateCard
from contexts.projects.domain.entities.card import Card
from contexts.projects.domain.entities.comment import CardComment
from contexts.projects.domain.entities.history import CardHistoryEntry
from contexts.projects.infrastructure.django.models import CardModel
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoCardRepository,
    DjangoCommentRepository,
    DjangoHistoryRepository,
    DjangoProjectRepository,
    DjangoStatusCategoryResolver,
    DjangoWorkspaceAccess,
)
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.jql import parse_jql
from contexts.projects.interface.api.notification_views import notify
from contexts.projects.interface.api.permissions import (
    assert_card_capability,
    assert_project_capability,
    assert_project_member,
)
from contexts.projects.interface.api.serializers import (
    CardHistorySerializer,
    CardSerializer,
    CommentSerializer,
    CreateCardSerializer,
    CreateCommentSerializer,
    UpdateCardSerializer,
)


def _card_dict(card: Card, project_key: str) -> dict:
    """Monta o payload público do card, incluindo o ref legível (KEY-num)."""
    return {
        "id": card.id,
        "ref": f"{project_key}-{card.number}",
        "project_id": card.project_id,
        "number": card.number,
        "title": card.title,
        "description": card.description,
        "status": card.status,
        "type": card.type.value,
        "priority": card.priority.value,
        "points": card.points,
        "assignee_id": card.assignee_id,
        "reporter_id": card.reporter_id,
        "sprint_id": card.sprint_id,
        "start_date": card.start_date,
        "due_date": card.due_date,
        "order": card.order,
        "rank": card.rank,
        "parent_id": card.parent_id,
        "epic_id": card.epic_id,
        "epic_color": card.epic_color,
        "labels": card.labels,
        "channel": card.channel,
        "publish_date": card.publish_date,
        "resolution": card.resolution.value if card.resolution else None,
        "resolved_at": card.resolved_at.isoformat() if card.resolved_at else None,
        "original_estimate_seconds": card.original_estimate_seconds,
        "remaining_estimate_seconds": card.remaining_estimate_seconds,
        "flagged": card.flagged,
        "archived": card.is_archived,
        "archived_at": card.archived_at.isoformat() if card.archived_at else None,
        "created_at": card.created_at.isoformat() if card.created_at else None,
        "updated_at": card.updated_at.isoformat() if card.updated_at else None,
    }


def _deps():
    return (
        DjangoProjectRepository(),
        DjangoCardRepository(),
        DjangoWorkspaceAccess(),
    )


def _working_since_map(project_id: str) -> dict[str, str]:
    """`doing_since` de todo card que está numa coluna `is_working` do projeto —
    mesma lógica de `presence.active_card`, só que pra TODOS os cards do board
    de uma vez (não só o card ativo de uma pessoa), numa única query anotada.
    Card fora de coluna `is_working` nem aparece no dict (front trata ausência
    como "não está em andamento")."""
    from django.db.models import OuterRef, Subquery

    from contexts.projects.infrastructure.django.models import (
        CardHistoryModel,
        WorkflowStatusModel,
    )

    working_slugs = list(
        WorkflowStatusModel.objects.filter(
            project_id=project_id, is_working=True
        ).values_list("slug", flat=True)
    )
    if not working_slugs:
        return {}

    latest_status_change = (
        CardHistoryModel.objects.filter(
            card_id=OuterRef("pk"), field="status", new_value=OuterRef("status")
        )
        .order_by("-created_at")
        .values("created_at")[:1]
    )
    rows = (
        CardModel.objects.filter(project_id=project_id, status__in=working_slugs)
        .annotate(status_changed_at=Subquery(latest_status_change))
        .values("id", "status_changed_at", "created_at")
    )
    return {
        str(r["id"]): r["status_changed_at"] or r["created_at"] for r in rows
    }


def _counts_map(project_id: str) -> dict[str, dict]:
    """Contadores (comentários, anexos, subtarefas) de todos os cards do projeto
    numa única query anotada — evita N+1 ao montar a lista do board."""
    from django.db.models import Count, Q

    rows = (
        CardModel.objects.filter(project_id=project_id)
        .annotate(
            c_comments=Count("comments", distinct=True),
            c_attachments=Count("attachments", distinct=True),
            c_subtasks=Count("subtasks", distinct=True),
            c_subtasks_done=Count(
                "subtasks", filter=Q(subtasks__status="done"), distinct=True
            ),
        )
        .values("id", "c_comments", "c_attachments", "c_subtasks", "c_subtasks_done")
    )
    return {
        str(r["id"]): {
            "comments_count": r["c_comments"],
            "attachments_count": r["c_attachments"],
            "subtasks_count": r["c_subtasks"],
            "subtasks_done": r["c_subtasks_done"],
        }
        for r in rows
    }


def card_row(cm, project_key: str, extra: dict | None = None) -> dict:
    """Serializa um CardModel no formato que o board consome.

    Existe para que a listagem por projeto, a busca por JQL e a visão pessoal
    (`/api/me/work/`) devolvam exatamente os mesmos campos. Quando isto era
    montado à mão em cada lugar, campos como `resolution` ficavam de fora numa
    das rotas e o card aparecia como não resolvido só naquela tela.
    """
    return {
        **(extra or {}),
        "id": str(cm.id),
        "ref": f"{project_key}-{cm.number}",
        "project_id": str(cm.project_id),
        "number": cm.number,
        "title": cm.title,
        "description": cm.description or "",
        "status": cm.status,
        "type": cm.type,
        "priority": cm.priority,
        "points": cm.points,
        "assignee_id": str(cm.assignee_id) if cm.assignee_id else None,
        "reporter_id": str(cm.reporter_id) if cm.reporter_id else None,
        "sprint_id": str(cm.sprint_id) if cm.sprint_id else None,
        "start_date": cm.start_date,
        "due_date": cm.due_date,
        "order": cm.order,
        "rank": cm.rank,
        "parent_id": str(cm.parent_id) if cm.parent_id else None,
        "epic_id": str(cm.epic_id) if cm.epic_id else None,
        "epic_color": cm.epic_color,
        "labels": cm.labels or [],
        "channel": cm.channel,
        "publish_date": cm.publish_date,
        "resolution": cm.resolution or None,
        "resolved_at": cm.resolved_at,
        "original_estimate_seconds": cm.original_estimate_seconds,
        "remaining_estimate_seconds": cm.remaining_estimate_seconds,
        "flagged": cm.flagged,
        "archived": cm.archived_at is not None,
        "archived_at": cm.archived_at,
    }


class CardListCreateView(APIView):
    """Lista e cria cards de um projeto: /api/projects/<project_id>/cards/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CardSerializer(many=True))
    def get(self, request: Request, project_id: str) -> Response:
        # Guarda no topo, valendo para os DOIS caminhos (com e sem JQL): o
        # caminho sem JQL checava apenas o workspace, então um board restrito
        # continuava respondendo a lista de cards por URL direta.
        assert_project_member(project_id=str(project_id), user_id=str(request.user.id))
        projects, cards, access = _deps()
        jql = request.query_params.get("jql", "").strip()

        if jql:
            try:
                jql_filter = parse_jql(jql, actor_id=str(request.user.id))
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            qs = (
                CardModel.objects.filter(project_id=project_id, archived_at__isnull=True)
                .filter(jql_filter)
            )
            project = projects.get(project_id=project_id)
            counts = _counts_map(str(project_id))
            working_since = _working_since_map(str(project_id))
            rows = [
                card_row(
                    cm,
                    project.key,
                    {**counts.get(str(cm.id), {}), "doing_since": working_since.get(str(cm.id))},
                )
                for cm in qs
            ]
            return Response(CardSerializer(rows, many=True).data)

        use_case = ListCards(projects, cards, access)
        result = use_case.execute(project_id=project_id, actor_id=str(request.user.id))
        project = projects.get(project_id=project_id)
        counts = _counts_map(str(project_id))
        working_since = _working_since_map(str(project_id))
        data = CardSerializer(
            [
                {
                    **_card_dict(c, project.key),
                    **counts.get(str(c.id), {}),
                    "doing_since": working_since.get(str(c.id)),
                }
                for c in result
            ],
            many=True,
        ).data
        return Response(data)

    @extend_schema(request=CreateCardSerializer, responses=CardSerializer)
    def post(self, request: Request, project_id: str) -> Response:
        serializer = CreateCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assert_project_capability(
            project_id=str(project_id), user_id=str(request.user.id), capability=caps.CREATE_ISSUE
        )
        projects, cards, access = _deps()
        use_case = CreateCard(projects, cards, access)
        data = dict(serializer.validated_data)
        # Épico informado precisa existir, ser do tipo épico e do mesmo projeto.
        if data.get("epic_id"):
            from contexts.projects.interface.api.agile_views import assert_valid_epic
            assert_valid_epic(project_id=str(project_id), epic_id=data["epic_id"])
        # Relator padrão = quem criou (como no Jira), se não informado.
        data.setdefault("reporter_id", str(request.user.id))
        card = use_case.execute(
            project_id=project_id,
            actor_id=str(request.user.id),
            **data,
        )
        project = projects.get(project_id=project_id)
        return Response(
            CardSerializer(_card_dict(card, project.key)).data,
            status=status.HTTP_201_CREATED,
        )


class CardDetailView(APIView):
    """Atualiza um card: PATCH /api/cards/<card_id>/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=UpdateCardSerializer, responses=CardSerializer)
    def patch(self, request: Request, card_id: str) -> Response:
        serializer = UpdateCardSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        assert_card_capability(
            card_id=str(card_id), user_id=str(request.user.id), capability=caps.EDIT_ISSUE
        )
        projects, cards, access = _deps()

        # Snapshot assignee before update for notification
        old_card = cards.get(card_id=str(card_id))
        old_assignee = str(old_card.assignee_id) if old_card and old_card.assignee_id else None

        # Épico informado precisa existir, ser do tipo épico e do mesmo projeto.
        if serializer.validated_data.get("epic_id") and old_card is not None:
            from contexts.projects.interface.api.agile_views import assert_valid_epic
            assert_valid_epic(
                project_id=str(old_card.project_id),
                epic_id=serializer.validated_data["epic_id"],
            )

        use_case = UpdateCard(
            projects,
            cards,
            access,
            DjangoHistoryRepository(),
            DjangoStatusCategoryResolver(),
        )
        card = use_case.execute(
            card_id=card_id,
            actor_id=str(request.user.id),
            **serializer.validated_data,
        )
        project = projects.get(project_id=card.project_id)

        # Notify new assignee if assignment changed
        new_assignee = str(card.assignee_id) if card.assignee_id else None
        actor = str(request.user.id)
        if new_assignee and new_assignee != old_assignee and new_assignee != actor:
            notify(
                user_id=new_assignee,
                notif_type="card_assigned",
                title=f"Card atribuído a você: {project.key}-{card.number}",
                body=card.title,
                link=f"/boards?card={card.id}",
            )

        return Response(CardSerializer(_card_dict(card, project.key)).data)

    def delete(self, request: Request, card_id: str) -> Response:
        assert_card_capability(
            card_id=str(card_id), user_id=str(request.user.id), capability=caps.DELETE_ISSUE
        )
        _, cards, _ = _deps()
        cards.delete(card_id=str(card_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


def _comment_dict(c: CardComment) -> dict:
    return {
        "id": c.id,
        "card_id": c.card_id,
        "author_id": c.author_id,
        "author_name": c.author_name,
        "body": c.body,
        "created_at": c.created_at,
    }


class CardCommentView(APIView):
    """Lista e cria comentários de um card: /api/cards/<card_id>/comments/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CommentSerializer(many=True))
    def get(self, request: Request, card_id: str) -> Response:
        use_case = ListComments(
            DjangoProjectRepository(),
            DjangoCardRepository(),
            DjangoCommentRepository(),
            DjangoWorkspaceAccess(),
        )
        result = use_case.execute(card_id=str(card_id), actor_id=str(request.user.id))
        return Response(CommentSerializer([_comment_dict(c) for c in result], many=True).data)

    @extend_schema(request=CreateCommentSerializer, responses=CommentSerializer)
    def post(self, request: Request, card_id: str) -> Response:
        serializer = CreateCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        use_case = CreateComment(
            DjangoProjectRepository(),
            DjangoCardRepository(),
            DjangoCommentRepository(),
            DjangoWorkspaceAccess(),
        )
        comment = use_case.execute(
            card_id=str(card_id),
            actor_id=str(request.user.id),
            body=serializer.validated_data["body"],
        )

        # Notifica relator/responsável + mencionados (@), exceto o próprio autor.
        from contexts.projects.infrastructure.django.models import CardModel
        try:
            cm = CardModel.objects.get(id=card_id)
            actor = str(request.user.id)
            body_preview = serializer.validated_data["body"][:120]
            ref = f"{cm.project.key}-{cm.number}"

            # Mencionados recebem notificação dedicada.
            mentioned = {str(u) for u in serializer.validated_data.get("mentions", [])}
            mentioned -= {actor, "None", ""}
            for uid in mentioned:
                notify(
                    user_id=uid,
                    notif_type="card_commented",
                    title=f"Você foi mencionado em {ref}",
                    body=body_preview,
                    link=f"/boards?card={card_id}",
                )

            # Relator/responsável (que não foram mencionados nem são o autor).
            targets = {str(cm.assignee_id), str(cm.reporter_id)} - {actor, "None"} - mentioned
            for uid in targets:
                notify(
                    user_id=uid,
                    notif_type="card_commented",
                    title=f"Novo comentário em {ref}",
                    body=body_preview,
                    link=f"/boards?card={card_id}",
                )
        except CardModel.DoesNotExist:
            pass

        return Response(
            CommentSerializer(_comment_dict(comment)).data, status=status.HTTP_201_CREATED
        )


def _history_dict(h: CardHistoryEntry) -> dict:
    return {
        "id": h.id,
        "card_id": h.card_id,
        "author_id": h.author_id,
        "author_name": h.author_name,
        "field": h.field,
        "old_value": h.old_value,
        "new_value": h.new_value,
        "created_at": h.created_at,
    }


class CardHistoryView(APIView):
    """Lista o histórico de um card: GET /api/cards/<card_id>/history/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CardHistorySerializer(many=True))
    def get(self, request: Request, card_id: str) -> Response:
        use_case = ListHistory(
            DjangoProjectRepository(),
            DjangoCardRepository(),
            DjangoHistoryRepository(),
            DjangoWorkspaceAccess(),
        )
        result = use_case.execute(card_id=str(card_id), actor_id=str(request.user.id))
        return Response(
            CardHistorySerializer([_history_dict(h) for h in result], many=True).data
        )
