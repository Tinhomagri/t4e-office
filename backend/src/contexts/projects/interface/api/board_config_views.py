"""Views da configuração de quadro/projeto (equivalente ao "Board settings" do Jira).

Três recursos:
  - ProjectDetailView       → aba "Geral" (nome, chave, avatar, lead, categoria)
  - BoardConfigView         → abas "Swimlanes", "Layout do card" e "Cores de card"
  - WorkflowStatusReorderView → drag-and-drop das colunas em uma única chamada

Leitura exige apenas ser membro do projeto; qualquer escrita exige
ADMINISTER_PROJECT (Geral/BoardConfig) ou MANAGE_WORKFLOW (reordenação de colunas).
"""
from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import (
    BoardConfigModel,
    ProjectModel,
    WorkflowStatusModel,
)
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.permissions import (
    assert_project_capability,
    assert_project_member,
)
from shared.domain.errors import NotFoundError, ValidationError


def _uid(request: Request) -> str:
    return str(request.user.id)


def _get_project(project_id: str) -> ProjectModel:
    project = ProjectModel.objects.filter(pk=project_id).first()
    if project is None:
        raise NotFoundError("Projeto não encontrado.")
    return project


def get_or_create_board_config(project_id: str) -> BoardConfigModel:
    """Config do quadro, criada no primeiro acesso com os defaults do modelo."""
    config, _ = BoardConfigModel.objects.get_or_create(
        project_id=project_id,
        defaults={"card_fields": list(BoardConfigModel.DEFAULT_CARD_FIELDS)},
    )
    return config


# ── Serialização ──────────────────────────────────────────────────────────────

def _ser_project(project: ProjectModel) -> dict:
    return {
        "id": str(project.id),
        "workspace_id": str(project.workspace_id),
        "name": project.name,
        "key": project.key,
        "template": project.template,
        "description": project.description,
        "category": project.category,
        "avatar_emoji": project.avatar_emoji,
        "avatar_color": project.avatar_color,
        "avatar_url": project.avatar_image.url if project.avatar_image else None,
        "lead_id": str(project.lead_id) if project.lead_id else None,
        "default_assignee_id": (
            str(project.default_assignee_id) if project.default_assignee_id else None
        ),
    }


def _ser_board_config(config: BoardConfigModel) -> dict:
    return {
        "project_id": str(config.project_id),
        "swimlane_mode": config.swimlane_mode,
        "card_fields": config.card_fields,
        "card_color_rule": config.card_color_rule,
        "card_color_map": config.card_color_map,
        "hide_done_after_days": config.hide_done_after_days,
        "sprints_enabled": config.sprints_enabled,
        "estimation_enabled": config.estimation_enabled,
        "available_card_fields": BoardConfigModel.AVAILABLE_CARD_FIELDS,
    }


# ── Geral (aba "Detalhes" do Jira) ────────────────────────────────────────────

class ProjectDetailView(APIView):
    """Lê e edita os dados gerais do projeto, incluindo upload do avatar."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    # Campos de texto editáveis direto do payload.
    TEXT_FIELDS = ("name", "description", "category", "avatar_emoji", "avatar_color")
    # Campos UUID que aceitam "" / null para limpar.
    UUID_FIELDS = ("lead_id", "default_assignee_id")

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        return Response(_ser_project(_get_project(str(project_id))))

    def patch(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id),
            user_id=_uid(request),
            capability=caps.ADMINISTER_PROJECT,
        )
        project = _get_project(str(project_id))

        for field in self.TEXT_FIELDS:
            if field in request.data:
                setattr(project, field, request.data[field] or "")

        # A chave é o prefixo dos cards: precisa ser única no workspace e não-vazia.
        if "key" in request.data:
            key = str(request.data["key"] or "").strip().upper()
            if not key:
                raise ValidationError("A chave do projeto não pode ficar vazia.")
            clash = (
                ProjectModel.objects.filter(workspace_id=project.workspace_id, key=key)
                .exclude(pk=project.pk)
                .exists()
            )
            if clash:
                raise ValidationError(f"Já existe um projeto com a chave {key} neste workspace.")
            project.key = key

        for field in self.UUID_FIELDS:
            if field in request.data:
                setattr(project, field, request.data[field] or None)

        # Upload do avatar (multipart). Enviar avatar_image vazio remove a imagem
        # e faz o front cair de volta no par emoji+cor.
        if "avatar_image" in request.FILES:
            project.avatar_image = request.FILES["avatar_image"]
        elif "avatar_image" in request.data and not request.data["avatar_image"]:
            project.avatar_image = None

        project.save()
        return Response(_ser_project(project))


# ── Config do quadro (swimlanes, layout do card, cores) ───────────────────────

class BoardConfigView(APIView):
    permission_classes = [IsAuthenticated]

    BOOL_FIELDS = ("sprints_enabled", "estimation_enabled")

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        return Response(_ser_board_config(get_or_create_board_config(str(project_id))))

    def patch(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id),
            user_id=_uid(request),
            capability=caps.ADMINISTER_PROJECT,
        )
        config = get_or_create_board_config(str(project_id))

        if "swimlane_mode" in request.data:
            mode = request.data["swimlane_mode"]
            valid = {c[0] for c in BoardConfigModel.SWIMLANE_CHOICES}
            if mode not in valid:
                raise ValidationError(f"Modo de swimlane inválido: {mode}.")
            config.swimlane_mode = mode

        if "card_fields" in request.data:
            fields = request.data["card_fields"]
            if not isinstance(fields, list):
                raise ValidationError("card_fields deve ser uma lista.")
            unknown = set(fields) - set(BoardConfigModel.AVAILABLE_CARD_FIELDS)
            if unknown:
                raise ValidationError(f"Campos desconhecidos: {', '.join(sorted(unknown))}.")
            # Preserva a ordem canônica para o board renderizar sempre igual.
            config.card_fields = [
                f for f in BoardConfigModel.AVAILABLE_CARD_FIELDS if f in set(fields)
            ]

        if "card_color_rule" in request.data:
            rule = request.data["card_color_rule"]
            valid = {c[0] for c in BoardConfigModel.CARD_COLOR_CHOICES}
            if rule not in valid:
                raise ValidationError(f"Regra de cor inválida: {rule}.")
            config.card_color_rule = rule

        if "card_color_map" in request.data:
            color_map = request.data["card_color_map"]
            if not isinstance(color_map, dict):
                raise ValidationError("card_color_map deve ser um objeto.")
            config.card_color_map = color_map

        if "hide_done_after_days" in request.data:
            config.hide_done_after_days = int(request.data["hide_done_after_days"] or 0)

        for field in self.BOOL_FIELDS:
            if field in request.data:
                setattr(config, field, bool(request.data[field]))

        config.save()
        return Response(_ser_board_config(config))


# ── Reordenação de colunas (drag-and-drop) ────────────────────────────────────

class WorkflowStatusReorderView(APIView):
    """Aplica a nova ordem das colunas em uma só chamada.

    Recebe `{"status_ids": [...]}` na ordem desejada. Fazer um PATCH por coluna
    deixaria o board em ordem inconsistente entre as respostas, então a
    reordenação inteira roda numa transação.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id),
            user_id=_uid(request),
            capability=caps.MANAGE_WORKFLOW,
        )
        status_ids = request.data.get("status_ids")
        if not isinstance(status_ids, list) or not status_ids:
            raise ValidationError("Informe status_ids como uma lista não vazia.")

        owned = set(
            str(pk)
            for pk in WorkflowStatusModel.objects.filter(
                project_id=project_id
            ).values_list("id", flat=True)
        )
        received = [str(s) for s in status_ids]
        if set(received) != owned:
            raise ValidationError(
                "status_ids deve conter exatamente as colunas do projeto."
            )

        with transaction.atomic():
            for order, status_id in enumerate(received):
                WorkflowStatusModel.objects.filter(pk=status_id).update(order=order)

        qs = WorkflowStatusModel.objects.filter(project_id=project_id)
        from contexts.projects.interface.api.extra_views import _ser_ws

        return Response([_ser_ws(ws) for ws in qs], status=status.HTTP_200_OK)
