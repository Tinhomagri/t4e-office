"""Reescreve os links de notificação gravados antes do prefixo /app e do projeto.

Até a 0052 o link de um card era `/boards?card=<id>`: rota que não existe (o
produto inteiro mora sob `/app`) e que, mesmo corrigida no cliente, abre o
board no primeiro projeto da lista — onde o card não está. Clicar devolvia 404
ou um quadro qualquer sem o card aberto.

As linhas já no banco não mudam sozinhas, então são migradas aqui. O projeto
sai do próprio card referenciado no link; card apagado desde então não tem como
ser resolvido e o link vira só `/app/boards`, que ao menos abre a tela.
"""
import re

from django.db import migrations

CARD_LINK = re.compile(r"^/boards\?card=([0-9a-fA-F-]{36})$")


def forwards(apps, schema_editor):
    Notification = apps.get_model("projects", "NotificationModel")
    Card = apps.get_model("projects", "CardModel")

    rows = list(Notification.objects.filter(link__startswith="/boards"))
    if not rows:
        return

    card_ids = {m.group(1) for m in (CARD_LINK.match(r.link) for r in rows) if m}
    project_of = dict(
        Card.objects.filter(id__in=card_ids).values_list("id", "project_id")
    )

    updated = []
    for row in rows:
        match = CARD_LINK.match(row.link)
        if not match:
            # `/boards` seco (sprint iniciada, automação) — só falta o prefixo.
            row.link = f"/app{row.link}"
            updated.append(row)
            continue
        card_id = match.group(1)
        project_id = project_of.get(card_id)
        row.link = (
            f"/app/boards?project={project_id}&card={card_id}"
            if project_id
            else "/app/boards"
        )
        updated.append(row)

    Notification.objects.bulk_update(updated, ["link"], batch_size=500)


def backwards(apps, schema_editor):
    """Sem volta: o link antigo estava quebrado, recriá-lo não serve a nada."""


class Migration(migrations.Migration):
    dependencies = [("projects", "0052_cardmodel_collaborators")]

    operations = [migrations.RunPython(forwards, backwards)]
