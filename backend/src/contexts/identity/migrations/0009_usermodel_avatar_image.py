from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("identity", "0005_alter_roleauditlog_actor_id_and_more")]

    operations = [
        migrations.AddField(
            model_name="usermodel",
            name="avatar_image",
            field=models.TextField(blank=True, default=""),
        ),
    ]
