"""Board público — acompanhamento sem login, por token na URL.

Espelho read-only do board: quem tem o link vê tudo (cards, descrição,
comentários), mas nunca ALTERA o que já existe — só criar card novo é
permitido, e só quando o projeto libera (`public_allow_create`). Sem isso,
qualquer edição/exclusão continua exigindo conta.

Escopo é o token, não o project_id: link errado ou desativado (`public_token`
nulo) é 404, nunca vaza qual projeto seria.

Com `public_access_code` configurado, TODA rota deste arquivo exige o código
batendo — não só a leitura do board. O link sozinho pode vazar (print de
tela, e-mail encaminhado); sem checar o código em cada rota, dava pra pular
a tela de entrada e criar card ou postar no mural direto pela API.
"""
from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
)
from contexts.projects.infrastructure.django.models import (
    BoardMessageModel,
    CardCommentModel,
    CardModel,
    ProjectModel,
    WorkflowStatusModel,
)
from contexts.projects.interface.api.notification_views import notify
from shared.domain.errors import NotFoundError, ValidationError

MAX_MESSAGE_LEN = 2000


def _get_public_project(token: str) -> ProjectModel:
    project = ProjectModel.objects.filter(public_token=token).first() if token else None
    if project is None:
        raise NotFoundError("Link não encontrado.")
    return project


def _code_ok(project: ProjectModel, request: Request) -> bool:
    """Sem código configurado, o link sozinho já libera (comportamento
    anterior). Com código, aceita tanto em query string (GET) quanto no
    corpo (POST) — o front manda do mesmo jeito nos dois casos."""
    if not project.public_access_code:
        return True
    enviado = str(request.query_params.get("code") or request.data.get("code") or "")
    return enviado == project.public_access_code


def _ser_comment(c: CardCommentModel) -> dict:
    return {
        "id": str(c.id),
        "author_name": c.author.full_name,
        "body": c.body,
        "created_at": c.created_at.isoformat(),
    }


def _ser_public_card(card: CardModel) -> dict:
    assignee = UserModel.objects.filter(id=card.assignee_id).first() if card.assignee_id else None
    return {
        "id": str(card.id),
        "ref": f"{card.project.key}-{card.number}",
        "title": card.title,
        "description": card.description,
        "status": card.status,
        "type": card.type,
        "priority": card.priority,
        "points": card.points,
        "assignee_name": assignee.full_name if assignee else None,
        "labels": card.labels,
        "due_date": card.due_date.isoformat() if card.due_date else None,
        "comments": [
            _ser_comment(c)
            for c in card.comments.select_related("author").order_by("created_at")
        ],
    }


def _ser_column(ws: WorkflowStatusModel) -> dict:
    return {
        "id": str(ws.id),
        "slug": ws.slug,
        "name": ws.name,
        "color": ws.color,
        "order": ws.order,
    }


def _ser_message(m: BoardMessageModel) -> dict:
    return {
        "id": str(m.id),
        "author_name": m.author_name,
        "body": m.body,
        "from_team": m.from_team,
        "created_at": m.created_at.isoformat(),
    }


class PublicBoardView(APIView):
    """GET /api/public/boards/<token>/ — o board inteiro, sem autenticação.

    Com `public_access_code` configurado, a PRIMEIRA vez exige `?code=`
    batendo. O código é compartilhado por um canal separado; uma vez
    validado, o cliente guarda e não pede de novo.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request: Request, token: str) -> Response:
        try:
            project = _get_public_project(token)
        except NotFoundError:
            return Response({"error": "Link não encontrado."}, status=404)
        if not _code_ok(project, request):
            return Response({"code_required": True}, status=401)

        columns = WorkflowStatusModel.objects.filter(project=project).order_by("order")
        cards = (
            CardModel.objects.filter(project=project, archived_at__isnull=True)
            .select_related("project")
            .prefetch_related("comments__author")
            .order_by("status", "rank", "order", "number")
        )
        return Response(
            {
                "project": {"name": project.name, "key": project.key},
                "allow_create": project.public_allow_create,
                "columns": [_ser_column(c) for c in columns],
                "cards": [_ser_public_card(c) for c in cards],
            }
        )


class PublicCardCreateView(APIView):
    """POST /api/public/boards/<token>/cards/ — só cria; nunca altera o que
    já existe. 403 quando o projeto não liberou criação pública."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request: Request, token: str) -> Response:
        try:
            project = _get_public_project(token)
        except NotFoundError:
            return Response({"error": "Link não encontrado."}, status=404)
        if not _code_ok(project, request):
            return Response({"code_required": True}, status=401)
        if not project.public_allow_create:
            return Response(
                {"error": "Este board não aceita cards criados pelo link público."},
                status=403,
            )

        title = str(request.data.get("title") or "").strip()
        if not title:
            raise ValidationError("Informe um título.")
        description = str(request.data.get("description") or "")

        status_slug = str(request.data.get("status") or "")
        column = (
            WorkflowStatusModel.objects.filter(project=project, slug=status_slug).first()
            if status_slug
            else None
        )
        if column is None:
            column = WorkflowStatusModel.objects.filter(project=project).order_by("order").first()

        ultimo = CardModel.objects.filter(project=project).order_by("-number").first()
        numero = (ultimo.number + 1) if ultimo else 1

        card = CardModel.objects.create(
            project=project,
            number=numero,
            title=title[:200],
            description=description,
            status=column.slug if column else "todo",
            # Marca a origem: card de fora do time, não confundir com o que
            # o próprio time criou — útil pra saber de onde veio a sugestão.
            source="public_link",
        )
        return Response(_ser_public_card(card), status=201)


class PublicMessageListCreateView(APIView):
    """Mural do board — sempre disponível quando o link existe (não tem
    liga/desliga próprio); o único portão de escrita é o mesmo código de
    acesso do board inteiro. Nome de quem escreve é obrigatório."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request: Request, token: str) -> Response:
        try:
            project = _get_public_project(token)
        except NotFoundError:
            return Response({"error": "Link não encontrado."}, status=404)
        if not _code_ok(project, request):
            return Response({"code_required": True}, status=401)
        mensagens = BoardMessageModel.objects.filter(project=project)
        return Response([_ser_message(m) for m in mensagens])

    def post(self, request: Request, token: str) -> Response:
        try:
            project = _get_public_project(token)
        except NotFoundError:
            return Response({"error": "Link não encontrado."}, status=404)
        if not _code_ok(project, request):
            return Response({"code_required": True}, status=401)

        body = str(request.data.get("body") or "").strip()
        if not body:
            raise ValidationError("Escreva uma mensagem.")
        if len(body) > MAX_MESSAGE_LEN:
            raise ValidationError(f"Mensagem muito longa (máximo {MAX_MESSAGE_LEN} caracteres).")
        # Nome é obrigatório: sem ele não dá pra saber quem escreveu no mural.
        author_name = str(request.data.get("author_name") or "").strip()[:80]
        if not author_name:
            raise ValidationError("Informe seu nome.")

        mensagem = BoardMessageModel.objects.create(
            project=project, author_name=author_name, body=body, from_team=False
        )

        # Owner/admin do workspace são quem configura o link e mais provável
        # de acompanhar — sem isto ninguém saberia que chegou recado novo a
        # não ser abrindo a aba Cliente por acaso.
        destinatarios = MembershipModel.objects.filter(
            workspace_id=project.workspace_id, role__in=["owner", "admin"]
        ).values_list("user_id", flat=True)
        for user_id in destinatarios:
            notify(
                str(user_id),
                "board_message",
                title=f"{author_name} escreveu no mural de {project.key}",
                body=body[:140],
                link=f"/app/boards?project={project.id}&view=mural",
            )

        return Response(_ser_message(mensagem), status=201)
