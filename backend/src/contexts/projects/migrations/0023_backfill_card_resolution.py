"""Backfill do desfecho em cards que já estavam concluídos.

Sem isto, todo card entregue antes desta versão ficaria com `resolution` vazio —
e como velocity/burndown passam a contar por desfecho, os relatórios históricos
zerariam da noite para o dia.

O critério é a categoria da coluna em WorkflowStatus (configurável por projeto),
com fallback nos slugs canônicos para projetos criados antes do workflow
customizável. `resolved_at` recebe `updated_at`: é a melhor aproximação que
existe da data de entrega em dados antigos — o instante da última mudança do
card, que na prática foi a mudança para a coluna final.
"""
from django.db import migrations

# Slugs que significavam "concluído" antes do workflow configurável. `publicado`
# é o estágio final do template de marketing.
FALLBACK_DONE = ("done", "publicado")


def backfill(apps, schema_editor):
    CardModel = apps.get_model("projects", "CardModel")
    WorkflowStatusModel = apps.get_model("projects", "WorkflowStatusModel")

    # Colunas da categoria `done`, agrupadas por projeto.
    done_by_project: dict[str, set[str]] = {}
    for project_id, slug in WorkflowStatusModel.objects.filter(
        category="done"
    ).values_list("project_id", "slug"):
        done_by_project.setdefault(str(project_id), set()).add(slug)

    projects_with_workflow = {
        str(pid)
        for pid in WorkflowStatusModel.objects.values_list(
            "project_id", flat=True
        ).distinct()
    }

    for card in CardModel.objects.filter(resolution="").iterator(chunk_size=500):
        project_id = str(card.project_id)
        if project_id in projects_with_workflow:
            is_done = card.status in done_by_project.get(project_id, set())
        else:
            is_done = card.status in FALLBACK_DONE
        if not is_done:
            continue
        card.resolution = "done"
        card.resolved_at = card.updated_at
        # `update_fields` para não disparar o auto_now de `updated_at`, que
        # reescreveria justamente a data que estamos usando como referência.
        card.save(update_fields=["resolution", "resolved_at"])


def unbackfill(apps, schema_editor):
    """Reversível: limpa só o que este backfill poderia ter escrito."""
    CardModel = apps.get_model("projects", "CardModel")
    CardModel.objects.filter(resolution="done").update(resolution="", resolved_at=None)


class Migration(migrations.Migration):
    dependencies = [("projects", "0022_cardmodel_archived_at_and_more")]

    operations = [migrations.RunPython(backfill, unbackfill)]
