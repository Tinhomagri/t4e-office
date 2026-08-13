"""Liga a flag nas colunas que já eram "em andamento".

Antes desta série, a presença automática no Escritório procurava o slug "doing"
cravado no código. Agora ela lê `is_working` da coluna — e sem este passo todo
quadro existente ficaria sem nenhuma coluna marcada, deixando de sentar
qualquer pessoa da noite para o dia.
"""
from django.db import migrations


def marcar(apps, schema_editor):
    WorkflowStatus = apps.get_model("projects", "WorkflowStatusModel")
    WorkflowStatus.objects.filter(slug="doing").update(is_working=True)


def desmarcar(apps, schema_editor):
    WorkflowStatus = apps.get_model("projects", "WorkflowStatusModel")
    WorkflowStatus.objects.filter(slug="doing").update(is_working=False)


class Migration(migrations.Migration):
    dependencies = [("projects", "0027_workflow_status_is_working")]

    operations = [migrations.RunPython(marcar, desmarcar)]
