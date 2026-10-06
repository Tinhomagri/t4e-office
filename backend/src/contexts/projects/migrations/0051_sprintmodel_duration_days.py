from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("projects", "0050_workflowstatusmodel_is_sprint_entry")]

    operations = [
        migrations.AddField(
            model_name="sprintmodel",
            name="duration_days",
            field=models.PositiveSmallIntegerField(
                blank=True,
                null=True,
                help_text="Duração do ciclo em dias. Nulo = personalizada (datas na mão).",
            ),
        ),
    ]
