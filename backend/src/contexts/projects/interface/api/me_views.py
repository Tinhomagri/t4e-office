"""Visão pessoal do trabalho — o que alimenta a tela "Meu Dia".

Por que existe uma rota própria: o Meu Dia é a única tela do produto que NÃO é
sobre um workspace. Ela é sobre a pessoa, e a pessoa costuma estar em mais de um
workspace ao mesmo tempo (Boards, Marketing, Comercial). Enquanto o front
montava essa tela a partir do workspace ativo, metade do trabalho do usuário
ficava invisível dependendo de qual workspace estava selecionado.

Também é uma questão de custo: montar isso no cliente exigiria listar os
workspaces, depois os projetos de cada um, depois os cards e as sprints de cada
projeto — 1 + W + 2·(W·P) requisições. Aqui são duas queries.
"""
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    SprintModel,
)
from contexts.projects.interface.api.card_views import card_row
from contexts.projects.interface.api.serializers import CardSerializer, SprintSerializer


def _my_project_ids(user_id: str) -> list[str]:
    """Projetos de TODOS os workspaces em que a pessoa é membro."""
    workspace_ids = MembershipModel.objects.filter(user_id=user_id).values_list(
        "workspace_id", flat=True
    )
    return list(
        ProjectModel.objects.filter(workspace_id__in=workspace_ids).values_list(
            "id", flat=True
        )
    )


class MyWorkView(APIView):
    """GET /api/me/work/ — cards meus e sprints ativas, de todos os workspaces."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user_id = str(request.user.id)
        project_ids = _my_project_ids(user_id)
        if not project_ids:
            return Response({"cards": [], "sprints": []})

        # `select_related("project")` porque `card_row` precisa da key do projeto
        # para montar o ref (T4E-123). Sem isso seria uma query por card.
        cards = (
            CardModel.objects.filter(
                project_id__in=project_ids,
                assignee_id=user_id,
                archived_at__isnull=True,
            )
            .select_related("project")
            .order_by("due_date", "created_at")
        )
        # `project_key`/`project_name` vão junto porque esta tela mistura
        # projetos de workspaces diferentes: sem eles o card não tem como dizer
        # de onde veio.
        card_rows = [
            card_row(
                cm,
                cm.project.key,
                {"project_key": cm.project.key, "project_name": cm.project.name},
            )
            for cm in cards
        ]

        # Sprints ativas dos projetos onde a pessoa tem card, mais qualquer
        # sprint referenciada pelos cards dela. A segunda metade importa: um
        # card pode estar numa sprint que já foi encerrada, e sem ela o
        # cabeçalho da sprint ficaria vazio no Meu Dia.
        sprint_ids = {c["sprint_id"] for c in card_rows if c["sprint_id"]}
        sprints = SprintModel.objects.filter(
            Q(project_id__in=project_ids, status="active") | Q(id__in=sprint_ids)
        ).order_by("-started_at")

        return Response(
            {
                "cards": CardSerializer(card_rows, many=True).data,
                "sprints": SprintSerializer(sprints, many=True).data,
            }
        )
