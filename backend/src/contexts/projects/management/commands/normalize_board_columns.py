"""Põe os projetos no fluxo padrão de colunas do time.

Os projetos importados do Jira vieram com as colunas de lá — cada time tinha as
suas, com nomes livres ("Itens pendentes", "ITENS INICIADOS", "Testes"…). Este
comando reescreve o quadro para o padrão de cinco colunas e leva cada card para
a coluna equivalente.

O card é movido pela CATEGORIA da coluna onde está (pendente / em andamento /
concluído), não pelo nome: nome é livre, categoria não. Quando o nome antigo diz
claramente "review" ou "backend", isso ganha da categoria — é informação mais
específica que o time escreveu à mão.

Uso:
    python manage.py normalize_board_columns --dry-run
    python manage.py normalize_board_columns
    python manage.py normalize_board_columns --projects GES,PT
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    WorkflowStatusModel,
)
from contexts.projects.interface.api.extra_views import DEFAULT_STATUSES

# Pistas no nome da coluna antiga que valem mais que a categoria.
PISTAS = (
    ("review", "review"),
    ("revis", "review"),
    ("code", "review"),
    ("teste", "review"),
    ("qa", "review"),
    ("backend", "backend"),
    ("integra", "backend"),
    ("api", "backend"),
)

# Sem pista no nome, a categoria decide.
POR_CATEGORIA = {"todo": "todo", "in_progress": "doing", "done": "done"}


def _categoria_provavel(status: str) -> str:
    """Categoria de um status que não tem mais coluna para consultar."""
    baixo = status.lower()
    if baixo in ("done", "concluido", "concluído", "entregue"):
        return "done"
    if baixo in ("backlog", "todo", "a-fazer", "pendente"):
        return "todo"
    return "in_progress"


def destino_de(nome: str, categoria: str) -> str:
    baixo = nome.lower()
    for pista, slug in PISTAS:
        if pista in baixo:
            # "Backend" e "Code Review" só existem no meio do fluxo; uma coluna
            # concluída chamada "Testes concluídos" continua sendo conclusão.
            return slug if categoria != "done" else "done"
    return POR_CATEGORIA.get(categoria, "todo")


class Command(BaseCommand):
    help = "Aplica o fluxo padrão de colunas nos projetos existentes."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--projects", default="", help="Chaves separadas por vírgula (vazio = todos)")
        parser.add_argument("--dry-run", action="store_true", help="Só relata, não grava")

    def handle(self, *args, **options) -> None:
        dry = options["dry_run"]
        chaves = [k.strip().upper() for k in options["projects"].split(",") if k.strip()]
        projetos = ProjectModel.objects.all()
        if chaves:
            projetos = projetos.filter(key__in=chaves)

        total_movidos = 0
        for projeto in projetos:
            movidos = self._normalizar(projeto, dry)
            total_movidos += movidos

        verbo = "seriam movidos" if dry else "movidos"
        self.stdout.write(self.style.SUCCESS(f"{total_movidos} card(s) {verbo}."))

    def _normalizar(self, projeto: ProjectModel, dry: bool) -> int:
        antigas = list(WorkflowStatusModel.objects.filter(project=projeto).order_by("order"))
        padrao = {d["slug"] for d in DEFAULT_STATUSES}

        # De onde cada card sai e para onde vai.
        rotas: dict[str, str] = {}
        for coluna in antigas:
            if coluna.slug in padrao:
                continue
            rotas[coluna.slug] = destino_de(coluna.name, coluna.category)

        # Card pode estar num status que NÃO tem coluna: cards antigos criados
        # antes do quadro configurável carregam valores como "backlog". Sem
        # isto eles sobrevivem à migração apontando para o nada — e sumiriam do
        # board, que desenha por coluna.
        soltos = (
            CardModel.objects.filter(project=projeto)
            .exclude(status__in=padrao | set(rotas))
            .values_list("status", flat=True)
            .distinct()
        )
        for status in soltos:
            rotas[status] = destino_de(status, _categoria_provavel(status))

        afetados = CardModel.objects.filter(project=projeto, status__in=rotas.keys()).count()
        sobrando = [c.name for c in antigas if c.slug in rotas]
        if sobrando or afetados:
            self.stdout.write(
                f"  {projeto.key}: {afetados} card(s) a mover; remove {len(sobrando)} coluna(s)"
            )
        if dry:
            return afetados

        with transaction.atomic():
            for d in DEFAULT_STATUSES:
                WorkflowStatusModel.objects.update_or_create(
                    project=projeto,
                    slug=d["slug"],
                    defaults={
                        "name": d["name"],
                        "category": d["category"],
                        "color": d["color"],
                        "order": d["order"],
                        "is_default": True,
                        "is_working": d.get("is_working", False),
                        "is_done": d.get("is_done", False),
                    },
                )
            for origem, destino in rotas.items():
                CardModel.objects.filter(project=projeto, status=origem).update(status=destino)
            # Só depois de mover os cards: apagar antes deixaria card apontando
            # para coluna inexistente, e o board não desenha a coluna do card.
            WorkflowStatusModel.objects.filter(project=projeto, slug__in=rotas.keys()).delete()

        return afetados
