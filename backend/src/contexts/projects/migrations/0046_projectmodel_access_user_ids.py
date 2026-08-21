from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("projects", "0045_alter_boardconfigmodel_hide_done_after_days")]

    operations = [
        migrations.AddField(
            model_name="projectmodel",
            name="access_user_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
