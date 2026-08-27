"""Corrige cards presos numa coluna que não existe no board.

Criar/concluir subtarefa mandava o status literal "todo"/"done" pro backend
em vez do slug real da coluna do projeto (fix vem junto: ver
`interface/api/card_views.py::_counts_map` e `CardDrawer.tsx`'s `Subtasks`).
Em qualquer board com coluna renomeada — a maioria, aqui — esse literal não
bate com slug nenhum, e o card fica sem coluna: some do quadro (a contagem
"(N)" do cabeçalho ainda mostra, porque conta por `parent_id`, não por
coluna) e a barra de progresso das subtarefas nunca fecha 100%.

Sem backfill isso ficaria quebrado pra sempre pra quem já tinha subtarefa
criada antes deste release — corrigir só o código resolve só as próximas.
"""
from django.db import migrations


def fix_orphan_status(apps, schema_editor):
    CardModel = apps.get_model("projects", "CardModel")
    WorkflowStatusModel = apps.get_model("projects", "WorkflowStatusModel")

    for project_id in (
        CardModel.objects.values_list("project_id", flat=True).distinct()
    ):
        statuses = list(
            WorkflowStatusModel.objects.filter(project_id=project_id).order_by("order")
        )
        if not statuses:
            # Projeto sem workflow configurado (não devia existir, mas não
            # temos coluna nenhuma pra realocar o card com segurança).
            continue

        valid_slugs = {s.slug for s in statuses}
        default_status = next((s for s in statuses if s.is_default), statuses[0])
        # `is_done` é o flag explícito — prioridade sobre a categoria. Quando
        # nenhuma coluna tem o flag e existe mais de uma com `category=done`
        # (workflow com duas colunas "terminais", ex.: "Code review" e
        # "Concluído" ambas marcadas done), a de MAIOR order é a mais perto
        # do fim do fluxo — a "concluído" de verdade, não uma parada
        # intermediária que só reaproveitou a categoria.
        done_status = next(
            (s for s in statuses if s.is_done),
            max(
                (s for s in statuses if s.category == "done"),
                key=lambda s: s.order,
                default=None,
            ),
        )

        orphans = CardModel.objects.filter(project_id=project_id).exclude(
            status__in=valid_slugs
        )
        for card in orphans.iterator(chunk_size=500):
            # "done" literal (o valor que o toggle de subtarefa mandava) quer
            # dizer concluído de verdade — vai pra coluna de concluído real
            # do projeto, se existir; senão cai no default, igual qualquer
            # outro status órfão (ex.: "todo" literal, do create).
            target = done_status if card.status == "done" and done_status else default_status
            card.status = target.slug
            card.save(update_fields=["status"])


class Migration(migrations.Migration):
    dependencies = [("projects", "0046_projectmodel_access_user_ids")]

    # Não reversível de forma significativa: o valor órfão original (o bug em
    # si) não é uma informação que valha a pena voltar a escrever.
    operations = [migrations.RunPython(fix_orphan_status, migrations.RunPython.noop)]
