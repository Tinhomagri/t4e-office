from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("identity", "0015_oauthclientmodel_client_secret_and_more")]

    operations = [
        migrations.AddField(
            model_name="usermodel",
            name="whitelabel",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
