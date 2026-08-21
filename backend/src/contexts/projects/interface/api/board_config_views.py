"""Views da configuração de quadro/projeto (equivalente ao "Board settings" do Jira).

Três recursos:
  - ProjectDetailView       → aba "Geral" (nome, chave, avatar, lead, categoria)
  - BoardConfigView         → abas "Swimlanes", "Layout do card" e "Cores de card"
  - WorkflowStatusReorderView → drag-and-drop das colunas em uma única chamada

Leitura exige apenas ser membro do projeto. Escrita: ADMINISTER_PROJECT para
ProjectDetailView (identidade do projeto); MANAGE_WORKFLOW para BoardConfigView
e WorkflowStatusReorderView (config do quadro em si — coluna, swimlane, layout).
"""
from __future__ import annotations

import secrets
from datetime import date

from django.db import transaction
from rest_framework import status
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


# Formatos aceitos no avatar e teto do data URI. O front reduz para 128×128
# antes de enviar (poucos KB); o limite existe para barrar um POST manual que
# tentasse enfiar um arquivo grande direto na coluna.
AVATAR_PREFIXES = ("data:image/webp;base64,", "data:image/png;base64,", "data:image/jpeg;base64,")
AVATAR_MAX_CHARS = 400_000  # ~300 KB depois de decodificar o base64


def _clean_avatar(raw) -> str:
    """Valida o data URI do avatar. String vazia remove a imagem."""
    value = str(raw or "").strip()
    if not value:
        return ""
    if not value.startswith(AVATAR_PREFIXES):
        raise ValidationError("Formato de imagem inválido. Use PNG, JPEG ou WebP.")
    if len(value) > AVATAR_MAX_CHARS:
        raise ValidationError("Imagem grande demais. Envie uma menor.")
    return value


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
        # Já é um data URI — vai direto no src da <img>, sem passar por storage.
        "avatar_url": project.avatar_image or None,
        "lead_id": str(project.lead_id) if project.lead_id else None,
        "default_assignee_id": (
            str(project.default_assignee_id) if project.default_assignee_id else None
        ),
        "squad_id": str(project.squad_id) if project.squad_id else None,
        "access_user_ids": [str(value) for value in (project.access_user_ids or [])],
        "visibility": project.visibility,
        "deadline": project.deadline.isoformat() if project.deadline else None,
        "created_at": project.created_at.isoformat(),
        "public_token": project.public_token,
        "public_allow_create": project.public_allow_create,
        "public_access_code": project.public_access_code,
        "mural_notification_excluded_user_ids": list(
            project.mural_notification_excluded_user_ids
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

        # Avatar chega como data URI já reduzido pelo front. Enviar vazio remove
        # a imagem e o projeto volta a exibir o par emoji+cor.
        if "avatar_image" in request.data:
            project.avatar_image = _clean_avatar(request.data["avatar_image"])

        if "visibility" in request.data:
            visibility = str(request.data["visibility"] or "restricted")
            if visibility not in dict(ProjectModel.VISIBILITY_CHOICES):
                raise ValidationError("Visibilidade inválida.")
            project.visibility = visibility

        # Squad dona: quem entra nela enxerga o board inteiro. Precisa ser do
        # mesmo workspace — senão um projeto vazaria acesso pra outro time.
        if "squad_id" in request.data:
            squad_id = request.data["squad_id"] or None
            if squad_id:
                from contexts.estimation.infrastructure.django.models import SquadModel

                pertence = SquadModel.objects.filter(
                    id=squad_id, workspace_id=project.workspace_id
                ).exists()
                if not pertence:
                    raise ValidationError("Squad não encontrada neste workspace.")
            project.squad_id = squad_id

        if "access_user_ids" in request.data:
            from contexts.identity.infrastructure.django.models import MembershipModel

            raw_ids = request.data["access_user_ids"] or []
            ids = list(dict.fromkeys(str(value) for value in raw_ids))
            valid_ids = {
                str(uid)
                for uid in MembershipModel.objects.filter(
                    workspace_id=project.workspace_id, user_id__in=ids
                ).values_list("user_id", flat=True)
            }
            if len(valid_ids) != len(ids):
                raise ValidationError("Algum usuário não pertence a este workspace.")
            project.access_user_ids = ids

        if "deadline" in request.data:
            raw_deadline = request.data["deadline"]
            if not raw_deadline:
                project.deadline = None
            else:
                try:
                    project.deadline = date.fromisoformat(str(raw_deadline))
                except ValueError as exc:
                    raise ValidationError("Data de prazo inválida. Use o formato AAAA-MM-DD.") from exc

        if "public_allow_create" in request.data:
            project.public_allow_create = bool(request.data["public_allow_create"])

        if "mural_notification_excluded_user_ids" in request.data:
            from contexts.identity.infrastructure.django.models import MembershipModel

            raw_ids = request.data["mural_notification_excluded_user_ids"] or []
            ids = [str(i) for i in raw_ids]
            pertencem = {
                str(uid)
                for uid in MembershipModel.objects.filter(
                    workspace_id=project.workspace_id, user_id__in=ids
                ).values_list("user_id", flat=True)
            }
            if len(pertencem) != len(set(ids)):
                raise ValidationError("Algum usuário não pertence a este workspace.")
            project.mural_notification_excluded_user_ids = ids

        # Gerar/revogar o link público — nunca aceita um token vindo do
        # cliente: só o servidor decide o valor, senão dava pra "escolher"
        # um token de outro projeto.
        action = request.data.get("public_token_action")
        if action == "generate":
            project.public_token = secrets.token_urlsafe(24)
        elif action == "revoke":
            project.public_token = None

        # Código de acesso ao board: curto de propósito — alguém vai DIGITAR
        # isto, não colar de um link. Alfabeto sem 0/O/1/I/L pra não confundir
        # ao ouvir por telefone ou ler numa captura de tela.
        code_action = request.data.get("public_access_code_action")
        if code_action == "generate":
            alfabeto = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
            project.public_access_code = "".join(secrets.choice(alfabeto) for _ in range(6))
        elif code_action == "revoke":
            project.public_access_code = None

        project.save()
        return Response(_ser_project(project))

    def delete(self, request: Request, project_id: str) -> Response:
        """Apaga o projeto e tudo que pertence a ele (cards, sprints,
        colunas, histórico — cascade no banco). Definitivo, só admin."""
        assert_project_capability(
            project_id=str(project_id),
            user_id=_uid(request),
            capability=caps.ADMINISTER_PROJECT,
        )
        project = _get_project(str(project_id))
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Config do quadro (swimlanes, layout do card, cores) ───────────────────────

class BoardConfigView(APIView):
    permission_classes = [IsAuthenticated]

    BOOL_FIELDS = ("sprints_enabled", "estimation_enabled")

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        return Response(_ser_board_config(get_or_create_board_config(str(project_id))))

    def patch(self, request: Request, project_id: str) -> Response:
        # MANAGE_WORKFLOW, não ADMINISTER_PROJECT: isto é config do QUADRO
        # (swimlane, layout, cores), a mesma capacidade que já libera colunas —
        # não a identidade do projeto (nome/visibilidade/squad), que fica só
        # com admin.
        assert_project_capability(
            project_id=str(project_id),
            user_id=_uid(request),
            capability=caps.MANAGE_WORKFLOW,
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
