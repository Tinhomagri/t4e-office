# Backfill de rank pros cards que nunca tiveram um (principalmente os
# importados do Jira — `import_jira.py` nunca seta `rank`, então ficam "").
#
# Por quê isto importa: `rank_at_top()` (usado pra colocar card novo no topo
# da coluna) faz `.exclude(rank="")` pra achar o menor rank existente. Num
# projeto onde TODOS os cards têm rank="" (o caso comum: projeto inteiro veio
# do Jira), essa exclusão elimina todo mundo, "first" vira None, e o rank
# gerado pro card novo (via rank_between("", "")) é uma string não-vazia —
# que por definição vem DEPOIS de "" na ordenação lexicográfica. Resultado:
# o card novo cai no fim da coluna mesmo com a lógica de "topo" correta,
# porque nenhum card antigo tinha um rank de verdade pra competir. Só dá pra
# corrigir de vez garantindo que TODO card tenha um rank real.
from __future__ import annotations

from django.db import migrations


def backfill_ranks(apps, schema_editor):
    from contexts.projects.infrastructure.lexorank import backfill_missing_ranks

    CardModel = apps.get_model("projects", "CardModel")
    project_ids = (
        CardModel.objects.filter(rank="").values_list("project_id", flat=True).distinct()
    )
    for project_id in project_ids:
        backfill_missing_ranks(CardModel, str(project_id))


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0037_alter_cardmodel_type"),
    ]

    operations = [
        migrations.RunPython(backfill_ranks, migrations.RunPython.noop),
    ]
