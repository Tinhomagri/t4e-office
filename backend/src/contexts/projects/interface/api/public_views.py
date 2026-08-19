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

import asyncio
import json
import time
from datetime import UTC, datetime

from django.http import StreamingHttpResponse
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
)
from contexts.projects.infrastructure.django.models import (
    AttachmentModel,
    BoardMessageModel,
    CardCommentModel,
    CardModel,
    ProjectModel,
    SprintModel,
    WorkflowStatusModel,
)
from contexts.projects.infrastructure.lexorank import rank_at_top
from contexts.projects.interface.api.notification_views import EventStreamRenderer, notify
from shared.domain.errors import NotFoundError, ValidationError

MAX_MESSAGE_LEN = 2000

# Imagem, não arquivo qualquer: é anexo de cliente sem conta, numa rota sem
# autenticação — superfície de abuso bem maior que o upload autenticado (que
# nem valida isso). Whitelist de mimetype + teto de tamanho é o mínimo aqui.
MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


class PublicCardCreateThrottle(AnonRateThrottle):
    """Throttle só desta rota — o projeto não tinha NENHUM throttle em lugar
    nenhum; criar card (e agora subir imagem) por um link sem login pede um
    limite, senão é convite a encher o disco de anexo."""

    scope = "public_card_create"


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


def _ser_public_attachment(a: AttachmentModel, request: Request) -> dict:
    return {
        "id": str(a.id),
        "filename": a.filename,
        "url": request.build_absolute_uri(a.file.url) if a.file else None,
        "mime_type": a.mime_type,
    }


def _ser_public_card(card: CardModel, request: Request) -> dict:
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
        "attachments": [
            _ser_public_attachment(a, request)
            for a in card.attachments.order_by("created_at")
        ],
        "flagged": card.flagged,
    }


def _ser_column(ws: WorkflowStatusModel) -> dict:
    return {
        "id": str(ws.id),
        "slug": ws.slug,
        "name": ws.name,
        "color": ws.color,
        "order": ws.order,
    }


def _ser_reply_to(m: BoardMessageModel) -> dict | None:
    # Trecho da original — só o suficiente pra citação, não a mensagem
    # inteira: mural pode ter texto longo e o preview tem que caber numa linha.
    if m.reply_to_id is None:
        return None
    original = m.reply_to
    if original is None:  # apagada/SET_NULL, mas reply_to_id ainda no banco
        return None
    return {
        "id": str(original.id),
        "author_name": original.author_name,
        "body": original.body[:140],
    }


def _ser_message(m: BoardMessageModel) -> dict:
    return {
        "id": str(m.id),
        "author_name": m.author_name,
        "body": m.body,
        "from_team": m.from_team,
        "created_at": m.created_at.isoformat(),
        "reply_to": _ser_reply_to(m),
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

        # Cópia exata do que o time vê por padrão no board interno: sprint
        # ativa se houver uma, senão backlog (cards sem sprint) — o mesmo
        # escopo que `KanbanView` seleciona sozinho ao abrir (nunca "todos os
        # cards de todas as sprints juntos", que não é uma visão real de lá).
        active_sprint = SprintModel.objects.filter(project=project, status="active").first()
        cards_qs = CardModel.objects.filter(project=project, archived_at__isnull=True)
        cards_qs = (
            cards_qs.filter(sprint_id=active_sprint.id)
            if active_sprint
            else cards_qs.filter(sprint__isnull=True)
        )
        cards = (
            cards_qs.select_related("project")
            .prefetch_related("comments__author", "attachments")
            .order_by("status", "-flagged", "rank", "order", "number")
        )
        return Response(
            {
                "project": {"name": project.name, "key": project.key},
                "allow_create": project.public_allow_create,
                "columns": [_ser_column(c) for c in columns],
                "cards": [_ser_public_card(c, request) for c in cards],
            }
        )


class PublicCardCreateView(APIView):
    """POST /api/public/boards/<token>/cards/ — só cria; nunca altera o que
    já existe. 403 quando o projeto não liberou criação pública.

    Aceita `image` (multipart) opcional junto do mesmo POST — cliente descreve
    o que precisa e já anexa um print/foto sem precisar de uma segunda
    requisição (que exigiria autenticação em qualquer outro fluxo de anexo)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    throttle_classes = [PublicCardCreateThrottle]

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
        # Vem como bool (JSON) ou string (multipart, quando tem imagem junto) —
        # normaliza os dois formatos pro mesmo teste.
        flagged = str(request.data.get("flagged") or "").strip().lower() in ("true", "1", "on")

        image = request.FILES.get("image")
        if image is not None:
            if image.content_type not in ALLOWED_IMAGE_TYPES:
                raise ValidationError("Anexo precisa ser uma imagem (PNG, JPEG, WEBP ou GIF).")
            if image.size > MAX_IMAGE_BYTES:
                raise ValidationError("Imagem muito grande (máximo 8MB).")

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
            # Mesma regra do board real: card novo entra no topo, não no fim
            # (senão o board público desalinha da ordem que o time vê).
            rank=rank_at_top(str(project.id)),
            # Marca a origem: card de fora do time, não confundir com o que
            # o próprio time criou — útil pra saber de onde veio a sugestão.
            source="public_link",
            flagged=flagged,
        )
        if image is not None:
            # author=None: veio de fora, sem conta — ver comentário no model.
            AttachmentModel.objects.create(
                card=card, author=None, filename=image.name, file=image,
                mime_type=image.content_type, size=image.size,
            )
        return Response(_ser_public_card(card, request), status=201)


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
        mensagens = BoardMessageModel.objects.filter(project=project).select_related("reply_to")
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

        # Resposta com citação: só aceita se a original for do MESMO board —
        # senão dava pra citar mensagem de outro projeto pelo id.
        reply_to_id = str(request.data.get("reply_to_id") or "").strip()
        reply_to = (
            BoardMessageModel.objects.filter(id=reply_to_id, project=project).first()
            if reply_to_id
            else None
        )

        mensagem = BoardMessageModel.objects.create(
            project=project, author_name=author_name, body=body, from_team=False,
            reply_to=reply_to,
        )

        # Todo mundo do workspace, não só owner/admin — quem trabalha no
        # card é quem mais precisa saber que o cliente escreveu, e antes só
        # owner/admin recebiam: o resto do time não tinha bipe nem
        # atualização instantânea nenhuma, só via no próximo poll (10s).
        destinatarios = MembershipModel.objects.filter(
            workspace_id=project.workspace_id
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


async def _stream_public_messages(project_id: str):
    """Generator assíncrono — mesma técnica do sino (`notification_views.py`):
    sob ASGI, um generator síncrono faz `StreamingHttpResponse` bufferizar a
    resposta inteira antes de mandar qualquer byte (ver comentário lá).
    Poll no banco a cada 3s é leve — tabela de mural é pequena e a query é
    por `project_id` + `created_at`, ambos indexados."""
    last_seen: datetime = datetime.now(tz=UTC)
    yield ": heartbeat\n\n"

    poll_interval = 3
    max_duration = 55  # cliente reconecta — evita timeout de proxy

    start = time.monotonic()
    while time.monotonic() - start < max_duration:
        novas = (
            BoardMessageModel.objects.filter(project_id=project_id, created_at__gt=last_seen)
            .select_related("reply_to")
            .order_by("created_at")
        )
        async for m in novas:
            yield f"data: {json.dumps(_ser_message(m))}\n\n"
            last_seen = m.created_at
        yield ": ping\n\n"
        await asyncio.sleep(poll_interval)


class PublicMessageStreamView(APIView):
    """GET /api/public/boards/<token>/messages/stream/ — SSE do mural, sem
    autenticação. Código de acesso (quando configurado) só pode vir por query
    string aqui — é GET puro, sem corpo pra mandar no POST."""

    permission_classes = [AllowAny]
    authentication_classes = []
    renderer_classes = [EventStreamRenderer]

    def get(self, request: Request, token: str) -> StreamingHttpResponse | Response:
        try:
            project = _get_public_project(token)
        except NotFoundError:
            return Response({"error": "Link não encontrado."}, status=404)
        if not _code_ok(project, request):
            return Response({"code_required": True}, status=401)

        response = StreamingHttpResponse(
            _stream_public_messages(str(project.id)),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
