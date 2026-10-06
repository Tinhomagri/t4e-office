from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0051_sprintmodel_duration_days"),
        ("identity", "0016_usermodel_whitelabel"),
    ]

    operations = [
        migrations.AddField(
            model_name="cardmodel",
            name="collaborators",
            field=models.ManyToManyField(
                blank=True,
                related_name="collaborating_cards",
                to="identity.usermodel",
            ),
        ),
    ]
