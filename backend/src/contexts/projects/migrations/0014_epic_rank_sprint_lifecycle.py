"""Onda 2 (paridade Jira): épicos como vínculo próprio, Lexorank e ciclo de vida da sprint."""
import django.db.models.deletion
from django.db import migrations, models


def forwards(apps, schema_editor):
    """Migra dados: parent→epic quando o pai é épico; preenche rank a partir de order."""
    Card = apps.get_model("projects", "CardModel")
    Project = apps.get_model("projects", "ProjectModel")

    from contexts.projects.infrastructure.lexorank import initial_rank_sequence

    # 1) Cards cujo parent é um épico passam a usar o campo epic (parent fica para subtarefas).
    epic_ids = set(Card.objects.filter(type="epic").values_list("id", flat=True))
    for card in Card.objects.filter(parent_id__in=epic_ids):
        card.epic_id = card.parent_id
        card.parent_id = None
        card.save(update_fields=["epic", "parent"])

    # 2) Épicos sem cor ganham cor padrão da paleta Atlassian.
    palette = ["#8270DB", "#2898BD", "#22A06B", "#E56910", "#C9372C",
               "#8F7EE7", "#38A8C8", "#4BCE97", "#F5CD47", "#9F8FEF"]
    for i, epic in enumerate(Card.objects.filter(type="epic", epic_color="")):
        epic.epic_color = palette[i % len(palette)]
        epic.save(update_fields=["epic_color"])

    # 3) Rank inicial por projeto, preservando a ordem atual (status, order, number).
    for project_id in Project.objects.values_list("id", flat=True):
        cards = list(
            Card.objects.filter(project_id=project_id).order_by("status", "order", "number")
        )
        for card, rank in zip(cards, initial_rank_sequence(len(cards))):
            card.rank = rank
            card.save(update_fields=["rank"])


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0013_project_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="cardmodel",
            name="epic",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="epic_children",
                to="projects.cardmodel",
            ),
        ),
        migrations.AddField(
            model_name="cardmodel",
            name="epic_color",
            field=models.CharField(blank=True, default="", max_length=7),
        ),
        migrations.AddField(
            model_name="cardmodel",
            name="rank",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="sprintmodel",
            name="started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="sprintmodel",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
