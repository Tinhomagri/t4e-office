"""Backfill da sala fixa por squad.

A sala permanente (Parte 5 do domínio de audiência de reuniões) só passou a
nascer automaticamente na criação de uma squad a partir desta versão. Toda
squad criada antes disso ficaria sem sala — e como a visibilidade dela conta
inteiramente com `squad_id` (não tem lista de audiência própria), a squad
continuaria sem um espaço de reunião até alguém criar um manualmente e marcar
a squad certa. Este backfill fecha essa lacuna para os dados já existentes.

Não há "dono da squad" no domínio, então `created_by` do registro backfillado
usa o `owner_id` do workspace — a aproximação mais razoável disponível para um
registro que não nasceu de uma ação de alguém.

Idempotente por design (`get_or_create`-like via checagem prévia): rodar de
novo não duplica salas, então é seguro reexecutar depois de uma squad nova
ser criada por fora do fluxo normal (import, fixture, etc.).
"""
from django.db import migrations


def backfill(apps, schema_editor):
    SquadModel = apps.get_model("estimation", "SquadModel")
    MeetingRoomModel = apps.get_model("meetings", "MeetingRoomModel")
    WorkspaceModel = apps.get_model("identity", "WorkspaceModel")

    owner_by_workspace: dict[str, str] = dict(
        WorkspaceModel.objects.values_list("id", "owner_id")
    )

    existing_squad_ids = set(
        MeetingRoomModel.objects.filter(is_permanent=True).values_list(
            "squad_id", flat=True
        )
    )

    for squad in SquadModel.objects.all().iterator(chunk_size=500):
        if squad.id in existing_squad_ids:
            continue
        owner_id = owner_by_workspace.get(squad.workspace_id)
        if owner_id is None:
            continue
        room = MeetingRoomModel(
            workspace_id=squad.workspace_id,
            name=f"Squad {squad.name}",
            kind="meeting",
            visibility="restricted",
            squad_id=squad.id,
            is_permanent=True,
            created_by=owner_id,
        )
        room.slug = f"squad-{squad.id.hex[:12]}"
        room.save()


def noop(apps, schema_editor):
    """Backfill não é reversível de forma significativa: desfazer apagaria
    salas de reunião que já podem ter histórico de participação real."""


class Migration(migrations.Migration):
    dependencies = [
        ("meetings", "0004_meetingroommodel_audience_user_ids_and_more"),
        ("estimation", "0006_pokersessionmodel_presented_card_id"),
        ("identity", "0001_initial"),
    ]

    operations = [migrations.RunPython(backfill, noop)]
